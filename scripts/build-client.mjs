import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function includeClientModule(file, replacements) {
  let source = await readFile(path.join(root, file), 'utf8');
  for (const [from, to] of replacements) {
    const count = source.split(from).length - 1;
    if (count !== 1) throw new Error(`${file}: expected one ${JSON.stringify(from)} export marker, found ${count}`);
    source = source.replace(from, to);
  }
  return source;
}

const api = await includeClientModule('src/client/api.js', [
  ['export function createClientApi(', 'function createClientApi('],
]);
const editor = await includeClientModule('src/client/editor.js', [
  ['export function mountEditor(', 'function mountEditor('],
  ['\nexport { DEFAULT_SETTINGS };\n', '\n'],
]);
const renderer = await includeClientModule('src/client/renderer.js', [
  ['export function installRenderer(', 'function installRenderer('],
  ['\nexport { BASE_SELECTORS };\n', '\n'],
]);
const entry = await includeClientModule('src/client/index.js', [
  ["import React from 'react';\n", ''],
  ["import { createClientApi } from './api.js';\n", ''],
  ["import { installRenderer } from './renderer.js';\n", ''],
  ["import { mountEditor } from './editor.js';\n", ''],
  ["export const inject = ['slots'];", "const inject = ['slots'];"],
  ['export function apply(', 'function apply('],
]);

const bundle = `window.__ModuleLoader__.load({
  id: 'dsh-personal-skins',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
${api}
${editor}
${renderer}
${entry}
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
`;

const output = path.join(root, 'lib/client.js');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bundle, 'utf8');
console.log(`Built ${path.relative(root, output)}`);
