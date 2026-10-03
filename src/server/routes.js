const PREFIX = '/api/personal-skins';
const PRESET_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const ASSET_RE = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/;
const MAX_JSON = 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function errorResponse(error) {
  const status = error?.status || (/not found/i.test(error?.message || '') ? 404 : error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500);
  return jsonResponse({ error: status === 500 ? 'Internal server error' : error?.message || 'Request failed' }, status);
}
function fetchGuard(request) {
  if (request.method.toUpperCase() === 'POST' && request.headers.get('x-dsh-personal-skins') !== '1') throw bad(403, 'Missing request token');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw bad(403, 'Cross-site request denied');
  const origin = request.headers.get('origin');
  if (origin && origin !== 'dsh-app://app') {
    try { if (new URL(origin).origin !== new URL(request.url).origin) throw bad(403, 'Cross-origin request denied'); }
    catch (error) { if (error?.status) throw error; throw bad(403, 'Cross-origin request denied'); }
  }
}
function bad(status, message) { const e = new Error(message); e.status = status; return e; }
function requireJson(request) {
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw bad(400, 'Content-Type must be application/json');
}
async function jsonBody(request, max = MAX_JSON) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > max) throw bad(413, 'Request body too large');
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > max) throw bad(413, 'Request body too large');
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw bad(400, 'Invalid JSON'); }
}
async function imageBody(request) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_IMAGE) throw bad(413, 'Request body too large');
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > MAX_IMAGE) throw bad(413, 'Request body too large');
  const mime = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const matches = mime === 'image/png' ? bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8 : mime === 'image/webp' ? bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' : false;
  if (!matches) throw bad(400, 'Unsupported image content type or signature');
  return bytes;
}
function presetId(id) { if (typeof id !== 'string' || !PRESET_RE.test(id)) throw bad(400, 'Invalid preset id'); return id; }

/**
 * Carrier-neutral exact routes for the official DSH Connection Fetch registry.
 * Handlers return Web Response objects and use only the caller-scoped store.
 * @param {{store: ReturnType<import('./store.js').createStore>}} options
 */
export function createFetchRoutes({ store } = {}) {
  if (!store) throw new TypeError('createFetchRoutes requires a store');
  const wrap = fn => async request => { try { fetchGuard(request); return await fn(request); } catch (error) { return errorResponse(error); } };
  return [
    { path: `${PREFIX}/state`, methods: ['GET'], requestBody: 'buffered', fetch: wrap(async () => jsonResponse(await store.read())) },
    { path: `${PREFIX}/command`, methods: ['POST'], requestBody: 'buffered', fetch: wrap(async request => {
      requireJson(request);
      const command = await jsonBody(request);
      if (!command || typeof command !== 'object' || Array.isArray(command)) throw bad(400, 'Command must be an object');
      switch (command.action) {
        case 'create':
          if (typeof command.name !== 'string') throw bad(400, 'name is required');
          return jsonResponse(await store.createPreset(command.name));
        case 'update':
          if (!command.patch || typeof command.patch !== 'object' || Array.isArray(command.patch)) throw bad(400, 'patch must be an object');
          return jsonResponse(await store.updatePreset(presetId(command.id), command.patch));
        case 'duplicate':
          if (command.name !== undefined && typeof command.name !== 'string') throw bad(400, 'name must be a string');
          return jsonResponse(await store.duplicatePreset(presetId(command.id), command.name));
        case 'remove': return jsonResponse(await store.deletePreset(presetId(command.id)));
        case 'activate':
          if (command.id !== null) presetId(command.id);
          return jsonResponse(await store.activatePreset(command.id));
        default: throw bad(400, 'Unknown command');
      }
    }) },
    { path: `${PREFIX}/upload`, methods: ['POST'], requestBody: 'buffered', fetch: wrap(async request => {
      const bytes = await imageBody(request);
      return jsonResponse(await store.importAsset(bytes), 201);
    }) },
    { path: `${PREFIX}/asset`, methods: ['GET'], requestBody: 'buffered', fetch: wrap(async request => {
      const id = new URL(request.url).searchParams.get('id');
      if (!id || !ASSET_RE.test(id)) throw bad(400, 'Invalid asset id');
      const bytes = await store.readAsset(id);
      const ext = id.slice(id.lastIndexOf('.') + 1);
      return new Response(bytes, { status: 200, headers: { 'Content-Type': ({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' })[ext], 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }) },
  ];
}

function loopback(ip = '') { return ip === '::1' || ip === '::ffff:127.0.0.1' || /^127(?:\.\d{1,3}){3}$/.test(ip); }
function localHost(host = '') {
  try {
    const url = new URL(`http://${host}`), name = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return name === 'localhost' || name === '::1' || /^127(?:\.\d{1,3}){3}$/.test(name);
  } catch { return false; }
}
function originAllowed(origin, host) {
  if (origin === 'dsh-app://app') return true;
  try { const url = new URL(origin); return ['http:','https:'].includes(url.protocol) && url.host.toLowerCase() === host.toLowerCase(); }
  catch { return false; }
}

/** Local-only Node HTTP adapter used by preview; it dispatches to the same official Fetch handlers. */
export function createRouter({ store } = {}) {
  const routes = createFetchRoutes({ store });
  return async function nodeHandler(req, res) {
    try {
      const host = req.headers.host || '';
      if (!loopback(req.socket?.remoteAddress) || !localHost(host)) throw bad(403, 'Local access only');
      const origin = req.headers.origin;
      if (origin && !originAllowed(origin, host)) throw bad(403, 'Cross-origin request denied');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw bad(403, 'Cross-site request denied');
      const raw = (req.url || '/').split(/[?#]/,1)[0];
      if (raw.includes('\\') || /%2e|%2f|%5c/i.test(raw) || raw.split('/').some(x => x === '.' || x === '..')) throw bad(400, 'Invalid request path');
      const incoming = new URL(req.url || '/', `http://${host}`);
      const route = routes.find(item => item.path === incoming.pathname && item.methods.includes((req.method || 'GET').toUpperCase()));
      if (!route) throw bad(404, 'Not found');
      const method = (req.method || 'GET').toUpperCase();
      if (method === 'POST' && req.headers['x-dsh-personal-skins'] !== '1') throw bad(403, 'Missing request token');
      const chunks = []; let size = 0, max = route.path.endsWith('/upload') ? MAX_IMAGE : MAX_JSON;
      for await (const chunk of req) { size += chunk.length; if (size > max) throw bad(413, 'Request body too large'); chunks.push(chunk); }
      const body = Buffer.concat(chunks, size);
      const headers = new Headers();
      for (const [name,value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD' && body.length) { init.body = body; init.duplex = 'half'; }
      const response = await route.fetch(new Request(incoming, init));
      const bytes = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(bytes);
    } catch (error) {
      const response = errorResponse(error);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!res.headersSent) { res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(bytes); }
      else res.end();
    }
  };
}
