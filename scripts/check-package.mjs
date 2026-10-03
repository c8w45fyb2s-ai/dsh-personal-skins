#!/usr/bin/env node
import { readFile, readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = message => errors.push(message);
const exists = async p => { try { await stat(path.join(root, p)); return true; } catch { return false; } };
let pkg;
try { pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); }
catch (e) { console.error(`check-package: cannot read package.json: ${e.message}`); process.exit(1); }

if (pkg.type !== 'module') fail('package.json must set type=module');
if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) fail('package.json must have a valid semantic version');
if (!pkg.peerDependencies?.['@deepseek-ai/cordis'] || typeof pkg.peerDependencies['@deepseek-ai/cordis'] !== 'string') fail('peerDependencies must declare @deepseek-ai/cordis compatibility');
if (pkg.exports?.['.'] !== './src/server/index.js') fail('exports["."] must point to ./src/server/index.js');
if (pkg.exports?.['./client'] !== './lib/client.js') fail('exports["./client"] must point to ./lib/client.js');
if (pkg.dsh?.client?.platform !== 'web') fail('dsh.client.platform must be web');
if (!Array.isArray(pkg.files) || pkg.files.length === 0) fail('package.json must define a non-empty files whitelist');
for (const item of pkg.files || []) {
  const normalized = String(item).replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('.local-demo') || /\.(?:png|jpe?g|webp)$/.test(normalized) || normalized === '*' || normalized === '**') fail(`unsafe or overly broad files whitelist entry: ${item}`);
}
for (const [label, file] of [['server entry', pkg.exports?.['.']], ['client bundle entry', pkg.exports?.['./client']]]) {
  if (typeof file === 'string' && !await exists(file)) fail(`${label} is missing: ${file}`);
}
if (!await exists('LICENSE')) fail('LICENSE file is missing');
else if (!/MIT License/i.test(await readFile(path.join(root, 'LICENSE'), 'utf8'))) fail('LICENSE file does not identify the MIT License');
if (String(pkg.license || '').toUpperCase() !== 'MIT') fail('package.json license must be MIT');

// If the peer is installed in this environment, verify the declared range accepts its real version.
// The checker intentionally uses the npm-provided semver implementation when available.
try {
  const require = createRequire(path.join(root, 'package.json'));
  const peerPackage = require.resolve('@deepseek-ai/cordis/package.json');
  const peer = JSON.parse(await readFile(peerPackage, 'utf8'));
  let semverPath;
  try { semverPath = require.resolve('semver'); } catch { semverPath = null; }
  if (semverPath) {
    const semver = require(semverPath);
    if (!semver.satisfies(peer.version, pkg.peerDependencies['@deepseek-ai/cordis'])) fail(`@deepseek-ai/cordis ${peer.version} is outside declared peer range ${pkg.peerDependencies['@deepseek-ai/cordis']}`);
  }
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') fail(`could not inspect installed @deepseek-ai/cordis version: ${error.message}`);
}

// Check every relative import in source without loading the host plugin or its side effects.
async function jsFiles(dir) {
  const found = [];
  if (!await exists(dir)) return found;
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await jsFiles(rel));
    else if (entry.isFile() && /\.(?:m?js|cjs)$/.test(entry.name)) found.push(rel);
  }
  return found;
}
const sources = [...await jsFiles('src'), ...await jsFiles('lib')];
for (const source of sources) {
  const text = await readFile(path.join(root, source), 'utf8');
  const patterns = [/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g, /\bimport\s*(['"])([^'"]+)\1/g];
  const refs = new Set();
  for (const re of patterns) for (const match of text.matchAll(re)) refs.add(match[2]);
  for (const spec of refs) {
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(root, path.dirname(source), spec);
    if (!target.startsWith(`${root}${path.sep}`)) { fail(`${source} imports outside the package: ${spec}`); continue; }
    let ok = false;
    for (const candidate of [target, `${target}.js`, `${target}.mjs`, `${target}.cjs`, path.join(target, 'index.js')]) {
      try { if ((await stat(candidate)).isFile()) { ok = true; break; } } catch {}
    }
    if (!ok) fail(`${source} has an unresolved relative import: ${spec}`);
  }
}

// npm's own file list is authoritative for nested directory and ignore rules.
const npmCache = await mkdtemp(path.join(os.tmpdir(), 'dsh-package-npm-cache-'));
const packed = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_cache: npmCache } });
await rm(npmCache, { recursive: true, force: true });
if (packed.error || packed.status !== 0) fail(`npm pack --dry-run failed: ${packed.error?.message || packed.stderr || packed.status}`);
else {
  try {
    const listing = JSON.parse(packed.stdout)[0]?.files || [];
    if (!listing.some(f => f.path === 'LICENSE')) fail('LICENSE is not included in the npm package');
    if (!listing.some(f => f.path === 'src/server/index.js')) fail('server entry is not included in the npm package');
    if (!listing.some(f => f.path === 'lib/client.js')) fail('client bundle entry is not included in the npm package');
    for (const file of listing) {
      const lower = file.path.toLowerCase();
      if (lower.startsWith('.local-demo/') || lower.includes('/.local-demo/')) fail(`local demo data would be published: ${file.path}`);
      if (/\.(?:png|jpe?g|webp)$/.test(lower)) fail(`raster image would be published; uploaded user assets must stay outside the package: ${file.path}`);
    }
  } catch (e) { fail(`could not parse npm pack listing: ${e.message}`); }
}

if (errors.length) {
  console.error(`Package checks failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else console.log('Package checks passed: metadata, imports, entries, MIT license, and publish file list.');
