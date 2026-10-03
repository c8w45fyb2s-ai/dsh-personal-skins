#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/server/store.js';
import { createRouter } from '../src/server/routes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Isolated scratch data; override to run a throwaway instance. */
const demoRoot = process.env.DSH_PREVIEW_DATA
  ? path.resolve(process.env.DSH_PREVIEW_DATA)
  : path.join(root, '.local-demo');
const dataRoot = path.join(demoRoot, 'data');
const DEMO_PRESET_NAME = '演示皮肤';
const portRequested = Number(process.env.DSH_PREVIEW_PORT || 4177);

/**
 * Optional seed artwork. A fresh clone ships no image, so the preview starts
 * empty and the page's own upload flow creates the first preset; point this at
 * a local image to have a demo skin waiting on start.
 */
const seedImage = process.env.DSH_PREVIEW_SEED_IMAGE
  ? path.resolve(process.env.DSH_PREVIEW_SEED_IMAGE)
  : path.join(demoRoot, 'demo-background.png');

await mkdir(demoRoot, { recursive: true });
const store = createStore(dataRoot);

let seedBytes = null;
try { seedBytes = await readFile(seedImage); } catch { seedBytes = null; }

if (seedBytes) {
  const asset = await store.importAsset(seedBytes);
  let profile = await store.read();
  let demo = profile.presets.find(item => item.name === DEMO_PRESET_NAME);
  if (!demo) {
    profile = await store.createPreset(DEMO_PRESET_NAME);
    demo = profile.presets.at(-1);
  }
  await store.updatePreset(demo.id, {
    light: { backgroundId: asset.id },
    dark: { backgroundId: asset.id },
    settings: { accent: '#D88F9E', backgroundX: 65, backgroundY: 50, backgroundScale: 100, blur: 0, overlay: 0.08, panelOpacity: 0.6, characterSide: 'right', characterSize: 35, characterOpacity: 1, characterMirror: false },
  });
  await store.activatePreset(demo.id);
}

const apiHandler = createRouter({ store });
const staticFiles = new Map([
  ['/', ['preview/index.html', 'text/html; charset=utf-8']],
  ['/src/client/api.js', ['src/client/api.js', 'text/javascript; charset=utf-8']],
  ['/src/client/editor.js', ['src/client/editor.js', 'text/javascript; charset=utf-8']],
  ['/src/client/renderer.js', ['src/client/renderer.js', 'text/javascript; charset=utf-8']],
]);

const server = createServer(async (req, res) => {
  const host = req.headers.host || '';
  const remote = req.socket.remoteAddress || '';
  const isLocal = remote === '::1' || remote === '::ffff:127.0.0.1' || /^127(?:\.\d{1,3}){3}$/.test(remote);
  let hostname = '';
  try { hostname = new URL(`http://${host}`).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch {}
  if (!isLocal || !(hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end('Local access only'); return;
  }
  const rawPath = (req.url || '/').split(/[?#]/, 1)[0];
  if (rawPath.startsWith('/api/')) return apiHandler(req, res);
  const entry = staticFiles.get(rawPath);
  if (!entry || req.method !== 'GET') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end('Not found'); return;
  }
  try {
    const bytes = await readFile(path.join(root, entry[0]));
    res.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end('Preview file unavailable');
  }
});

async function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = error => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(server.address().port); };
    server.once('error', onError); server.once('listening', onListening); server.listen(port, '127.0.0.1');
  });
}
let actualPort;
for (let candidate = portRequested; candidate <= portRequested + 10; candidate++) {
  try { actualPort = await listen(candidate); break; }
  catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
}
if (!actualPort) throw new Error('No free preview port was found');
console.log(`DSH personal skins preview: http://127.0.0.1:${actualPort}/`);
console.log(`Temporary profile data: ${dataRoot}`);
console.log('This server binds to loopback and does not read or write the real DSH profile.');
if (seedBytes) console.log(`Seeded a demo preset from ${seedImage}`);
else console.log(`No seed image at ${seedImage} — the preview starts empty. Create a skin on the page and upload an image, or set DSH_PREVIEW_SEED_IMAGE=/absolute/path/to/image.png and restart.`);

const stop = () => server.close(() => process.exit(0));
process.once('SIGINT', stop); process.once('SIGTERM', stop);
