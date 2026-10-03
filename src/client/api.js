/**
 * Relative on purpose: DSH's own callers hand the transport a root-relative
 * path (`api/...`), which is what the desktop IPC carrier and sub-path
 * deployments both resolve. A leading slash would bypass the host's mount point.
 */
const API_ROOT = 'api/personal-skins';
const WRITE_HEADER = 'X-DSH-Personal-Skins';

function getFetch() {
  const transport = globalThis.__DSH_TRANSPORT__;
  const fileUpload = globalThis.__DSH_FILE_UPLOAD__;
  const fn = transport?.fetch || fileUpload?.fetch || globalThis.fetch;
  if (typeof fn !== 'function') throw new Error('DeepSeek Harness Fetch transport is unavailable');
  const owner = transport?.fetch === fn ? transport : fileUpload?.fetch === fn ? fileUpload : globalThis;
  return fn.bind(owner);
}

/** The same API adapter is used by the plugin client and local preview. */
export function createClientApi({ onProfile = () => {}, fetch: fetchOverride } = {}) {
  const fetchRequest = fetchOverride || getFetch();
  const blobUrls = new Map();
  const stateListeners = new Set();
  let disposed = false;

  async function json(path, { method = 'GET', value } = {}) {
    const headers = new Headers();
    if (method !== 'GET') {
      headers.set('content-type', 'application/json');
      headers.set(WRITE_HEADER, '1');
    }
    const response = await fetchRequest(`${API_ROOT}${path}`, {
      method,
      headers,
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      credentials: 'include',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }

  function publish(profile) {
    onProfile(profile);
    for (const listener of stateListeners) listener(profile);
    return profile;
  }

  async function command(action, fields = {}) {
    return publish(await json('/command', { method: 'POST', value: { action, ...fields } }));
  }

  return {
    state: async () => publish(await json('/state')),
    onState(listener) {
      if (typeof listener !== 'function') throw new TypeError('state listener must be a function');
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    create: (name) => command('create', { name }),
    update: (id, preset) => command('update', {
      id,
      patch: { name: preset.name, light: preset.light, dark: preset.dark, settings: preset.settings },
    }),
    duplicate: (id) => command('duplicate', { id }),
    remove: (id) => command('remove', { id }),
    activate: (id) => command('activate', { id }),
    async upload(file) {
      const headers = new Headers();
      headers.set('content-type', file.type);
      headers.set(WRITE_HEADER, '1');
      const response = await fetchRequest(`${API_ROOT}/upload`, {
        method: 'POST',
        headers,
        body: file,
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Upload failed (${response.status})`);
      return result;
    },
    async assetUrl(id) {
      if (!id) return '';
      let cached = blobUrls.get(id);
      if (cached) return cached.promise;
      cached = { url: null, promise: null };
      cached.promise = (async () => {
        const response = await fetchRequest(`${API_ROOT}/asset?id=${encodeURIComponent(id)}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`Image request failed (${response.status})`);
        const url = URL.createObjectURL(await response.blob());
        cached.url = url;
        if (disposed) {
          URL.revokeObjectURL(url);
          throw new Error('Personal skins client was disposed');
        }
        return url;
      })().catch((error) => {
        blobUrls.delete(id);
        throw error;
      });
      blobUrls.set(id, cached);
      return cached.promise;
    },
    dispose() {
      disposed = true;
      stateListeners.clear();
      for (const cached of blobUrls.values()) if (cached.url) URL.revokeObjectURL(cached.url);
      blobUrls.clear();
    },
  };
}
