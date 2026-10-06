window.__ModuleLoader__.load({
  id: 'dsh-personal-skins',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
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
function createClientApi({ onProfile = () => {}, fetch: fetchOverride } = {}) {
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


const DEFAULT_SETTINGS = {
  accent: '#D88F9E', backgroundX: 50, backgroundY: 50, backgroundScale: 100,
  blur: 0, overlay: 0.25, panelOpacity: 0.85, characterSide: 'right',
  characterSize: 35, characterOpacity: 1, characterMirror: false,
  uiStyle: 'refined', decorations: true,
};

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh = p => ({...p, light:{...(p.light||{})}, dark:{...(p.dark||{})}, settings:{...DEFAULT_SETTINGS,...(p.settings||{})}});

const css = `
.dsh-skin{--sk-accent:#d88f9e;--sk-ink:#39383d;--sk-muted:#89858b;--sk-line:#ebe7e8;--sk-surface:#fff;--sk-soft:#f8f5f6;color:var(--sk-ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;max-width:1080px;margin:0 auto}
.dsh-skin *{box-sizing:border-box}.dsh-skin button,.dsh-skin input,.dsh-skin select{font:inherit}.dsh-skin button{cursor:pointer}.dsh-skin-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:4px 0 22px}.dsh-skin h2,.dsh-skin h3,.dsh-skin p{margin:0}.dsh-skin h2{font-size:22px;letter-spacing:.01em}.dsh-skin-sub{color:var(--sk-muted);margin-top:4px}.dsh-skin-actions{display:flex;gap:8px;flex-wrap:wrap}.dsh-btn{border:1px solid var(--sk-line);background:#fff;color:var(--sk-ink);border-radius:10px;padding:8px 13px;transition:.15s}.dsh-btn:hover{border-color:#d9b6be;background:#fffafb}.dsh-btn.primary{background:var(--sk-accent);border-color:var(--sk-accent);color:#fff}.dsh-btn.danger{color:#a4495b}.dsh-btn:disabled{opacity:.55;cursor:wait}.dsh-skin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}.dsh-card{background:var(--sk-surface);border:1px solid var(--sk-line);border-radius:15px;overflow:hidden;box-shadow:0 4px 14px #31212a08}.dsh-card-preview{display:block;width:100%;height:116px;object-fit:cover;background:linear-gradient(135deg,#f7e6e9,#f8f5f6 55%,#e9e0e3);position:relative;overflow:hidden}.dsh-card-body{padding:13px}.dsh-card-title{font-weight:650;display:flex;align-items:center;gap:7px}.dsh-tag{font-size:10px;background:#f8edf0;color:#a26070;border-radius:99px;padding:2px 7px}.dsh-card-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.dsh-card-controls .dsh-btn{padding:5px 8px;font-size:12px;border-radius:8px}.dsh-empty{padding:36px;text-align:center;color:var(--sk-muted);border:1px dashed var(--sk-line);border-radius:14px;grid-column:1/-1}.dsh-editor{margin-top:20px;border:1px solid var(--sk-line);border-radius:16px;background:#fff;padding:18px}.dsh-editor-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.dsh-editor-top h3{font-size:16px}.dsh-editor-grid{display:grid;grid-template-columns:minmax(250px,1fr) minmax(260px,1fr);gap:20px}.dsh-preview{position:relative;min-height:360px;border-radius:12px;overflow:hidden;background:linear-gradient(145deg,#f5e5e8,#e7dce0);isolation:isolate}.dsh-preview-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(0px);z-index:-2}.dsh-preview-shade{position:absolute;inset:0;background:rgba(30,25,29,.25);z-index:-1}.dsh-preview-tint{position:absolute;inset:0;z-index:0;background:var(--sk-wallpaper-tint,transparent)}.dsh-preview-person{position:absolute;bottom:0;height:78%;width:auto;max-width:60%;object-fit:contain;object-position:bottom;pointer-events:none}.dsh-preview[data-ui-style=basic] .dsh-preview-tint{display:none}.dsh-preview[data-ui-style=refined] .dsh-preview-person{z-index:1}.dsh-preview-label{position:absolute;z-index:4;left:21%;top:28%;color:#4a4145;font-weight:600}.dsh-preview-label:after{content:"  Aa";color:var(--sk-accent);font-size:22px}.dsh-preview-sidebar{position:absolute;inset:0 auto 0 0;width:19%;background:var(--sk-fill,rgba(255,255,255,.82));border-right:1px solid var(--sk-line);z-index:3}.dsh-preview-compose{position:absolute;z-index:3;left:27%;right:6%;bottom:7%;height:13%;border:1px solid var(--sk-line);border-radius:10px;background:var(--sk-fill,rgba(255,255,255,.9))}.dsh-preview-message{position:absolute;z-index:3;left:32%;top:38%;width:55%;height:16%;border:1px solid var(--sk-line);border-radius:10px;background:var(--sk-fill,rgba(255,255,255,.9))}.dsh-preview-message.second{top:57%;left:40%;width:45%;height:12%}.dsh-preview-message:after{content:"";display:block;width:68%;height:4px;margin:18px 12px;background:rgba(80,65,75,.16);box-shadow:0 10px rgba(80,65,75,.1)}.dsh-preview[data-ui-style=refined] .dsh-preview-sidebar,.dsh-preview[data-ui-style=refined] .dsh-preview-compose{box-shadow:0 4px 16px rgba(40,25,35,.12)}.dsh-preview[data-ui-style=refined] .dsh-preview-message{box-shadow:0 4px 16px rgba(40,25,35,.12)}.dsh-preview-send{position:absolute;right:6px;bottom:5px;width:24px;height:24px;border:0;border-radius:8px;background:var(--sk-button);color:var(--sk-button-text);font-size:14px}.dsh-preview[data-decorations=false] .dsh-preview-sidebar,.dsh-preview[data-decorations=false] .dsh-preview-compose,.dsh-preview[data-decorations=false] .dsh-preview-message{outline:none!important;box-shadow:none!important;}.dsh-controls{display:flex;flex-direction:column;gap:12px}.dsh-field{display:grid;grid-template-columns:1fr auto;gap:7px 12px;align-items:center}.dsh-field label{font-size:12px;color:#656168}.dsh-field output{font-size:11px;color:var(--sk-muted)}.dsh-field input[type=range]{grid-column:1/-1;width:100%;accent-color:var(--sk-accent)}.dsh-field input[type=color]{width:40px;height:28px;padding:2px;border:1px solid var(--sk-line);border-radius:7px;background:white}.dsh-field select,.dsh-field input[type=text]{border:1px solid var(--sk-line);border-radius:8px;padding:7px;background:#fff;color:var(--sk-ink)}.dsh-row{display:flex;gap:9px;align-items:center}.dsh-notice,.dsh-message{min-height:20px;color:#a4495b;font-size:12px;margin-top:8px}@media(max-width:700px){.dsh-editor-grid{grid-template-columns:1fr}.dsh-preview{min-height:280px}.dsh-skin-head{align-items:flex-start;flex-direction:column}.dsh-editor{padding:13px}}
`;

const previewDetailCss = `
.dsh-preview-sidebar{padding:9px 6px;display:flex;flex-direction:column;gap:5px}.dsh-preview-new-session,.dsh-preview-row{min-width:0;padding:5px 6px;border-radius:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:9px;line-height:1.3}.dsh-preview-new-session{background:var(--sk-toolbar);color:var(--sk-brand);font-weight:600}.dsh-preview-row{color:var(--sk-ink)}.dsh-preview-row.selected{background:var(--sk-selected)}.dsh-preview-compose{display:flex;flex-direction:column;justify-content:space-between;padding:0 5px 5px}.dsh-preview-toolbar{display:flex;justify-content:space-between;gap:4px;align-items:center;height:24px;padding:0 4px;border-top:1px solid var(--sk-line);border-radius:0 0 8px 8px;background:var(--sk-toolbar);color:var(--sk-muted);font-size:8px;white-space:nowrap}
.dsh-preview[data-ui-style=refined][data-decorations=true] .dsh-preview-new-session{outline:1px solid var(--sk-line);outline-offset:-1px}.dsh-preview[data-ui-style=refined][data-decorations=true] .dsh-preview-row.selected{box-shadow:inset 2px 0 var(--sk-brand)}.dsh-preview[data-decorations=false] .dsh-preview-new-session,.dsh-preview[data-decorations=false] .dsh-preview-row,.dsh-preview[data-decorations=false] .dsh-preview-toolbar{border-color:transparent!important;outline:none!important;box-shadow:none!important}
.dsh-preview-header{position:absolute;z-index:3;left:19%;right:0;top:11%;min-height:14%;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--sk-line);background:var(--sk-header-fill);color:var(--sk-header-ink);font-size:9px;line-height:1.25}
.dsh-preview-header-title{font-size:10px;font-weight:600}.dsh-preview-header-tabs{display:flex;gap:12px;color:var(--sk-header-muted);font-size:8px}.dsh-preview-header-tabs span:last-child{color:var(--sk-header-accent);font-weight:700;border-bottom:2px solid var(--sk-header-accent);padding-bottom:2px}
.dsh-preview[data-ui-style=basic] .dsh-preview-header{display:flex;background:var(--sk-header-fill,#fff);color:#29272a;border-color:transparent}
.dsh-preview[data-ui-style=basic][data-dark=true] .dsh-preview-header{background:#1c1c20;color:#f5f2f3}
.dsh-preview[data-ui-style=basic] .dsh-preview-header-tabs{color:#716c73}
.dsh-preview[data-ui-style=basic][data-dark=true] .dsh-preview-header-tabs{color:#b9b4bc}
.dsh-preview[data-ui-style=basic] .dsh-preview-header-tabs span:last-child{color:#4b91d1;border-color:#4b91d1}
.dsh-preview-person{z-index:1}
.dsh-preview[data-ui-style=basic] .dsh-preview-sidebar,.dsh-preview[data-ui-style=basic] .dsh-preview-message,.dsh-preview[data-ui-style=basic] .dsh-preview-compose{display:block;background:#fff;border:0;border-radius:0;box-shadow:none;outline:none}
.dsh-preview[data-ui-style=basic][data-dark=true] .dsh-preview-sidebar,.dsh-preview[data-ui-style=basic][data-dark=true] .dsh-preview-message,.dsh-preview[data-ui-style=basic][data-dark=true] .dsh-preview-compose{background:#1c1c20;color:#f5f2f3}
.dsh-preview[data-ui-style=basic] .dsh-preview-new-session,.dsh-preview[data-ui-style=basic] .dsh-preview-row.selected{background:transparent;color:inherit;box-shadow:none;outline:none}
.dsh-preview[data-ui-style=basic] .dsh-preview-send{background:#4b91d1;color:#fff;border-radius:4px}
.dsh-preview[data-ui-style=basic] .dsh-preview-label{display:none}
`;

const standaloneCss = `
.dsh-skin-workspace-host{position:fixed;inset:48px 0 0;z-index:9999;pointer-events:auto}
.dsh-skin-standalone{--sk-accent:#d88f9e;--sk-ink:#39383d;--sk-muted:#77737a;--sk-line:#e2dfe2;--sk-surface:#fff;--sk-soft:#f7f5f6;position:absolute;inset:0;max-width:none;width:auto;height:100%;margin:0;padding:clamp(16px,2.4vw,32px);overflow:hidden;display:flex;flex-direction:column;gap:16px;background:#f7f5f6;color:var(--sk-ink);isolation:isolate;-webkit-app-region:no-drag}
.dsh-skin-standalone,.dsh-skin-standalone *{-webkit-app-region:no-drag}
html:is([data-theme="dark"],.dark) .dsh-skin-standalone,html.dark .dsh-skin-standalone,html[style*="color-scheme: dark"] .dsh-skin-standalone,body[data-ds-dark-theme] .dsh-skin-standalone{--sk-ink:#f2eff2;--sk-muted:#b2adb4;--sk-line:#444149;--sk-surface:#29272e;--sk-soft:#222026;background:#19181d;color:var(--sk-ink)}
@media(prefers-color-scheme:dark){html:not([data-theme]):not(.light):not(.dark):not([style*="color-scheme: light"]):not([style*="color-scheme: dark"]) .dsh-skin-standalone:not([data-theme="light"]),html:not([data-theme]):not(.light):not(.dark):not([style*="color-scheme: light"]):not([style*="color-scheme: dark"]) body:not([data-ds-dark-theme]) .dsh-skin-standalone{--sk-ink:#f2eff2;--sk-muted:#b2adb4;--sk-line:#444149;--sk-surface:#29272e;--sk-soft:#222026;background:#19181d;color:var(--sk-ink)}}
.dsh-workspace-bar{height:46px;flex:none;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--sk-line);padding:0 2px 12px}
.dsh-workspace-bar strong{font-size:20px;letter-spacing:.01em}
.dsh-workspace-close{border:1px solid var(--sk-line);border-radius:9px;padding:8px 13px;background:var(--sk-surface);color:var(--sk-ink)}
.dsh-skin-workspace-body{min-height:0;flex:1;overflow:auto}
.dsh-skin-standalone .dsh-skin-head{margin:0 0 14px}
.dsh-skin-standalone .dsh-skin-grid{padding-bottom:12px}
.dsh-skin-standalone .dsh-card,.dsh-skin-standalone .dsh-editor{background:var(--sk-surface);border-color:var(--sk-line);color:var(--sk-ink)}
.dsh-skin-standalone .dsh-btn,.dsh-skin-standalone .dsh-field select,.dsh-skin-standalone .dsh-field input[type=text]{background:var(--sk-surface);border-color:var(--sk-line);color:var(--sk-ink)}
.dsh-skin-standalone .dsh-btn.primary{background:var(--sk-accent);border-color:var(--sk-accent);color:#fff}
.dsh-skin-standalone .dsh-editor{height:100%;margin:0;padding:0;border:0;border-radius:0;box-shadow:none;display:flex;flex-direction:column;gap:16px}
.dsh-skin-standalone .dsh-editor-top{flex:none;margin:0;padding:0 0 12px;border-bottom:1px solid var(--sk-line)}
`;

const editorLayoutCss = `
.dsh-image-conflict{grid-column:1/-1;margin-top:8px;padding-top:10px;border-top:1px solid var(--sk-line)}.dsh-image-conflict p{font-size:12px;color:var(--sk-muted);line-height:1.5}.dsh-image-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.dsh-image-option{min-width:0;padding:6px;border:1px solid var(--sk-line);border-radius:9px;background:var(--sk-soft);color:var(--sk-ink);text-align:center}.dsh-image-option img{display:block;width:100%;height:64px;object-fit:contain;margin-bottom:4px}.dsh-image-option:focus-visible{outline:2px solid var(--sk-accent);outline-offset:2px}
.dsh-preview-frame{min-width:0;min-height:360px;display:grid}.dsh-preview-frame>.dsh-preview{width:100%}
.dsh-control-group{min-width:0;margin:0;padding:10px 12px 12px;border:1px solid var(--sk-line);border-radius:12px}.dsh-load-state{min-height:38vh;display:grid;place-content:center;justify-items:center;gap:12px;text-align:center;color:var(--sk-muted)}
.dsh-control-group legend{padding:0 6px;color:var(--sk-muted);font-size:12px;font-weight:600}
.dsh-upload-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.dsh-upload-card{display:grid;grid-template-columns:76px minmax(0,1fr);grid-template-rows:auto auto auto;gap:4px 12px;min-width:0;padding:10px;border:1px solid var(--sk-line);border-radius:12px;background:var(--sk-surface);color:var(--sk-ink)}.dsh-upload-card h4{grid-column:1/-1;margin:0 0 2px;font-size:14px}.dsh-upload-thumb{grid-column:1;grid-row:2/5;display:grid;place-items:center;width:76px;height:72px;margin:0;overflow:hidden;border:1px solid var(--sk-line);border-radius:9px;background:var(--sk-soft);color:var(--sk-muted);font-size:11px}.dsh-upload-thumb img{display:block;width:100%;height:100%;object-fit:contain}.dsh-skin .dsh-upload-choose{grid-column:2;display:block;width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--sk-upload-button,#8f5366);border-radius:9px;background:var(--sk-upload-button,#8f5366);color:var(--sk-upload-button-text,#fff);font-size:16px;font-weight:600}.dsh-skin .dsh-upload-choose:hover{filter:brightness(.95)}.dsh-skin .dsh-upload-choose:disabled{opacity:.6;cursor:wait;filter:grayscale(.2)}.dsh-upload-state{grid-column:2;display:block;min-height:20px;margin:0;color:var(--sk-muted);font-size:12px;overflow-wrap:anywhere}.dsh-upload-remove{grid-column:2;justify-self:start;margin-top:2px;padding:5px 9px;border:1px solid var(--sk-line);border-radius:8px;background:var(--sk-surface);color:var(--sk-ink);font-size:12px}.dsh-upload-limit{margin:0 0 10px;color:var(--sk-muted);font-size:12px}.dsh-upload-cards [hidden]{display:none!important}
.dsh-skin-standalone .dsh-preview-frame{width:100%;height:100%;min-width:0;min-height:0;display:grid;place-items:center;container-type:size;overflow:hidden}
.dsh-skin-standalone .dsh-preview{width:min(100cqw,160cqh);height:auto;min-height:0;aspect-ratio:16/10;max-height:none;align-self:center;background:#e9e3e6}
.dsh-skin-standalone .dsh-editor-grid{grid-template-columns:minmax(0,1fr) minmax(320px,380px);flex:1;min-height:0}
.dsh-skin-standalone .dsh-controls{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 8px 12px 0}
.dsh-skin-standalone .dsh-control-group{background:var(--sk-surface);border-color:var(--sk-line)}
.dsh-skin-standalone .dsh-name{margin-top:6px;padding:7px 9px;border:1px solid var(--sk-line);border-radius:8px;background:var(--sk-surface);color:var(--sk-ink)}
.dsh-skin-standalone .dsh-field label{color:var(--sk-muted)}
.dsh-skin-standalone .dsh-editor .dsh-notice{flex:none;margin:0}
.dsh-skin-discard-layer{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:20px;background:rgba(15,12,16,.42);-webkit-app-region:no-drag}
.dsh-skin-discard-dialog{width:min(420px,100%);padding:24px;border:1px solid var(--sk-line);border-radius:16px;background:var(--sk-surface);color:var(--sk-ink);box-shadow:0 18px 56px #0004}
.dsh-skin-discard-dialog h3{margin:0 0 8px;font-size:18px}.dsh-skin-discard-dialog p{margin:0;color:var(--sk-muted)}
.dsh-skin-discard-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
@media(max-width:850px){.dsh-skin-standalone .dsh-editor-grid{grid-template-columns:minmax(0,1fr) minmax(280px,340px)}}
@media(max-width:700px){.dsh-preview-frame{min-height:280px}}
@media(max-width:680px){.dsh-skin-standalone .dsh-editor{height:auto;min-height:100%}.dsh-skin-standalone .dsh-editor-top{position:sticky;top:0;z-index:2;flex-wrap:wrap;gap:12px;background:var(--sk-surface);padding:8px 0 12px}.dsh-skin-standalone .dsh-editor-grid{grid-template-columns:minmax(0,1fr);flex:none}.dsh-skin-standalone .dsh-preview-frame{height:auto;aspect-ratio:16/10;container-type:normal}.dsh-skin-standalone .dsh-preview{width:100%;height:auto;aspect-ratio:16/10;max-height:none}.dsh-skin-standalone .dsh-controls{overflow:visible;padding-right:0}}
`;

function mountEditor(container, {api, standalone = false, onClose = () => {}, getUiTheme = () => ({fill:'rgba(255,255,255,.85)',line:'rgba(216,143,158,.22)',ink:'#29272a',accent:'#D88F9E'})} = {}) {
  if (!container || !api) throw new TypeError('mountEditor requires container and api');
  const doc = container.ownerDocument || document;
  const style = doc.createElement('style'); style.textContent = `${css}\n${previewDetailCss}\n${standalone ? standaloneCss : ''}\n${editorLayoutCss}`; doc.head.append(style);
  const root = doc.createElement('section'); root.className = standalone ? 'dsh-skin dsh-skin-standalone' : 'dsh-skin';
  if (standalone) { root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '我的皮肤工作区'); root.setAttribute('tabindex', '-1'); }
  container.append(root);
  let state, editing = null, busy = false, loading = true, loadError = '', disposed = false, deletingId = null, previewGeneration = 0, notice = '';
  const win = doc.defaultView || globalThis.window;
  const media = win?.matchMedia?.('(prefers-color-scheme: dark)') || { matches: false };
  let hostDark = isDark(doc, media);
  const onHostThemeChange = () => {
    const next = isDark(doc, media);
    if (next === hostDark) return;
    hostDark = next;
    if (editing && !disposed) void syncPreview();
  };
  const Observer = win?.MutationObserver || globalThis.MutationObserver;
  const themeObserver = Observer ? new Observer(onHostThemeChange) : null;
  if (doc.documentElement) themeObserver?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  if (doc.body) themeObserver?.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  media.addEventListener?.('change', onHostThemeChange);
  const uploadUi = new Map();
  let uploadRenderGeneration = 0;
  let initialDraft = null, confirmingDiscard = false, discardIntent = null, confirmationFocus = null;
  function focusDescriptor(element) {
    if (!element) return null;
    if (element.id) return { selector: `#${element.id}` };
    if (element.dataset?.action) {
      const action = element.dataset.action;
      const id = element.dataset.id;
      return { selector: id ? `[data-action="${action}"][data-id="${id}"]` : `[data-action="${action}"]` };
    }
    if (element.dataset?.setting) return { selector: `[data-setting="${element.dataset.setting}"]` };
    return null;
  }
  const isDirty = () => Boolean(editing && initialDraft !== JSON.stringify(editing));
  function requestDiscard(intent) {
    if (busy) return false;
    if (isDirty()) {
      confirmingDiscard = true;
      discardIntent = intent;
      confirmationFocus = focusDescriptor(doc.activeElement);
      render();
      requestAnimationFrame(() => root.querySelector('.dsh-skin-discard-continue')?.focus());
      return false;
    }
    if (intent === 'workspace') onClose();
    else { resetUploadUi(); editing = null; initialDraft = null; render(); }
    return true;
  }
  function resolveDiscard(accept) {
    const intent = discardIntent;
    confirmingDiscard = false;
    discardIntent = null;
    if (accept && intent === 'workspace') { resetUploadUi(); onClose(); return; }
    if (accept && intent === 'editor') { resetUploadUi(); editing = null; initialDraft = null; }
    render();
    if (!accept) requestAnimationFrame(() => {
      const restored = confirmationFocus?.selector && root.querySelector(confirmationFocus.selector);
      const fallback = root.querySelector('.dsh-name') || root.querySelector('[data-setting]') || root.querySelector('.dsh-skin-workspace-close') || root.querySelector('button');
      (restored || fallback || root).focus();
      confirmationFocus = null;
    });
  }
  const requestClose = () => {
    if (confirmingDiscard) { resolveDiscard(false); return false; }
    return requestDiscard('workspace');
  };
  const status = msg => { notice = msg || ''; const el = root.querySelector('.dsh-message') || root.querySelector('.dsh-notice'); if(el) el.textContent = notice; };
  const setBusy = value => {
    busy = value;
    root.querySelectorAll('button,input,select').forEach(control => {
      let locked = value;
      if (!locked && control.matches('.dsh-card-controls button')) locked = Boolean(editing);
      if (!locked && (control.dataset.action === 'new' || control.dataset.action === 'default')) locked = Boolean(editing) || !state || loading;
      if (!locked && control.dataset.action === 'clear') {
        const field = control.dataset.kind === 'background' ? 'backgroundId' : 'characterId';
        locked = !draftAsset(field);
      }
      control.disabled = locked;
    });
  };
  const uploadKey = kind => kind;
  const imageField = kind => kind === 'background' ? 'backgroundId' : 'characterId';
  const draftAsset = field => editing?.light?.[field] || editing?.dark?.[field];
  const imageConflict = (p, field) => Boolean(p?.light?.[field] && p?.dark?.[field] && p.light[field] !== p.dark[field]);
  const shareImage = (field, id) => { editing.light[field] = id; editing.dark[field] = id; };
  function normalizeDraft(p) {
    for (const field of ['backgroundId', 'characterId']) {
      if (!p.light[field]) p.light[field] = p.dark[field];
      if (!p.dark[field]) p.dark[field] = p.light[field];
    }
    return p;
  }
  const revokeUploadUrl = (item) => { if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl); };
  const resetUploadUi = () => { for (const item of uploadUi.values()) revokeUploadUrl(item); uploadUi.clear(); };
  const uploadLabel = (kind) => kind === 'background' ? '背景图片' : '立绘图片';
  const uploadHeading = (kind) => kind === 'background' ? '背景图片' : '透明立绘';
  const uploadMessage = kind => {
    const item = uploadUi.get(uploadKey(kind));
    if (item) return item.message || (item.fileName || '图片') + (item.phase === 'uploaded' ? '：上传完成，保存皮肤后生效' : '：尚未上传');
    const field = kind === 'background' ? 'backgroundId' : 'characterId';
    return draftAsset(field) ? '已设置' + uploadLabel(kind) : '尚未选择' + uploadLabel(kind);
  };
  const focusUploadButton = kind => {
    const restore = () => {
      const button = root.querySelector('[data-action="choose-upload"][data-kind="' + kind + '"]');
      if (!disposed && button && !button.disabled) button.focus();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(restore);
    else restore();
  };
  async function syncUploadThumbs() {
    const generation = ++uploadRenderGeneration;
    const cards = [...root.querySelectorAll('[data-upload-card]')];
    await Promise.all(cards.map(async card => {
      const kind = card.dataset.uploadCard;
      const thumb = card.querySelector('.dsh-upload-thumb');
      if (!thumb) return;
      const item = uploadUi.get(uploadKey(kind));
      if (item?.objectUrl) {
        thumb.innerHTML = '<img alt="' + esc(uploadLabel(kind)) + '预览">';
        const image = thumb.querySelector('img');
        if (image && !disposed && generation === uploadRenderGeneration && image.isConnected) image.src = item.objectUrl;
        return;
      }
      const field = kind === 'background' ? 'backgroundId' : 'characterId';
      const id = draftAsset(field);
      if (!id) { thumb.textContent = '暂无图片预览'; return; }
      try {
        const src = await imageUrl(id);
        if (disposed || generation !== uploadRenderGeneration || !thumb.isConnected) return;
        thumb.innerHTML = '<img alt="' + esc(uploadLabel(kind)) + '预览">';
        const image = thumb.querySelector('img');
        if (image?.isConnected) image.src = src;
      } catch {
        if (!disposed && generation === uploadRenderGeneration && thumb.isConnected) thumb.textContent = '图片预览暂不可用';
      }
    }));
    await Promise.all([...root.querySelectorAll('[data-legacy-image]')].map(async image => {
      try {
        const src = await imageUrl(image.dataset.legacyImage);
        if (!disposed && generation === uploadRenderGeneration && image.isConnected) image.src = src;
      } catch {}
    }));
  }
  const unsubscribeState = typeof api.onState === 'function'
    ? api.onState(next => {
      if (!next?.presets) return;
      state = next;
      if (!editing && !busy) render();
    })
    : null;
  async function imageUrl(id) { return id ? await api.assetUrl(id) : ''; }
  function render() {
    if (disposed) return;
    const presets = state?.presets || [];
    const cards = presets.map(p=>`<article class="dsh-card"><img class="dsh-card-preview" data-thumb="${esc(p.id)}" alt=""><div class="dsh-card-body"><div class="dsh-card-title">${esc(p.name)}${state.activePresetId===p.id?'<span class="dsh-tag">使用中</span>':''}</div><div class="dsh-card-controls"><button class="dsh-btn" data-action="edit" data-id="${esc(p.id)}">编辑</button><button class="dsh-btn" data-action="duplicate" data-id="${esc(p.id)}">复制</button><button class="dsh-btn" data-action="apply" data-id="${esc(p.id)}">应用</button>${deletingId===p.id?`<button class="dsh-btn danger" data-action="delete-confirm" data-id="${esc(p.id)}">确认删除</button><button class="dsh-btn" data-action="delete-cancel">取消</button>`:`<button class="dsh-btn danger" data-action="delete" data-id="${esc(p.id)}">删除</button>`}</div></div></article>`).join('');
    const listContent = state
      ? `<div class="dsh-skin-grid">${cards||'<div class="dsh-empty">还没有皮肤，创建一套专属主题吧。</div>'}</div>`
      : `<div class="dsh-load-state" role="status"><p>${loading ? '正在读取皮肤…' : '读取皮肤失败，请重试。'}</p>${loading ? '' : '<button class="dsh-btn primary" data-action="retry">重试</button>'}</div>`;
    const manager = `<header class="dsh-skin-head"><div><h2>我的皮肤</h2><p class="dsh-skin-sub">为 DeepSeek Harness 换一套轻盈的视觉氛围</p></div><div class="dsh-skin-actions"><button class="dsh-btn" data-action="default" ${state && !loading ? '' : 'disabled'}>恢复默认</button><button class="dsh-btn primary" data-action="new" ${state && !loading ? '' : 'disabled'}>＋ 新建皮肤</button></div></header><div class="dsh-message" role="status">${esc(notice || loadError)}</div>${listContent}`;
    const workspaceBar = standalone ? `<header class="dsh-workspace-bar"><strong>我的皮肤</strong><button class="dsh-btn dsh-skin-workspace-close" data-action="workspace-close">关闭</button></header>` : '';
    const content = standalone
      ? (editing ? editorHtml(editing) : manager)
      : `${manager}${editing?editorHtml(editing):''}`;
    const discard = confirmingDiscard ? `<div class="dsh-skin-discard-layer"><section class="dsh-skin-discard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dsh-skin-discard-title" tabindex="-1"><h3 id="dsh-skin-discard-title">放弃未保存的修改？</h3><p>这次调整还没有保存，放弃后无法恢复。</p><div class="dsh-skin-discard-actions"><button class="dsh-btn dsh-skin-discard-continue" data-action="continue-editing">继续编辑</button><button class="dsh-btn danger" data-action="discard-changes">放弃修改</button></div></section></div>` : '';
    root.innerHTML = standalone
      ? `${workspaceBar}<main class="dsh-skin-workspace-body">${content}</main>${discard}`
      : `${content}${discard}`;
    if (editing) syncPreview();
    void syncThumbs();
    void syncUploadThumbs();
    if(editing) root.querySelectorAll('.dsh-card-controls button').forEach(button=>button.disabled=true);
    if (busy) setBusy(true);
  }
  function editorHtml(p) {
    const s = p.settings;
    const basic = s.uiStyle === 'basic';
    const hasBackground = Boolean(draftAsset('backgroundId'));
    const hasCharacter = Boolean(draftAsset('characterId'));
    const effectivePanelOpacity = Math.max(.82, Number(s.panelOpacity) || .85);
    const range = (key, label, min, max, step = 1, suffix = '') => {
      const value = key === 'panelOpacity' ? effectivePanelOpacity : s[key];
      return `<div class="dsh-field"><label for="setting-${key}">${label}</label><output>${value}${suffix}</output><input id="setting-${key}" type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
    };
    const upload = (key) => {
      const field = key === 'background' ? 'backgroundId' : 'characterId';
      const exists = Boolean(draftAsset(field));
      const title = uploadHeading(key);
      const inputId = 'upload-' + key;
      const conflict = imageConflict(p, field) ? `<div class="dsh-image-conflict"><p>这套皮肤原来使用了两张不同的${uploadLabel(key)}，请选择要保留的一张，或上传新图片。</p><div class="dsh-image-options">${['light','dark'].map(source => `<button type="button" class="dsh-image-option" data-action="retain-image" data-kind="${key}" data-source="${source}" aria-label="保留${source === 'light' ? '浅色' : '深色'}${uploadLabel(key)}"><img data-legacy-image="${esc(p[source][field])}" alt="${source === 'light' ? '浅色' : '深色'}${uploadLabel(key)}预览"><span>保留${source === 'light' ? '浅色' : '深色'}图片</span></button>`).join('')}</div></div>` : '';
      return `<article class="dsh-upload-card" data-upload-card="${key}"><h4>${title}</h4><div class="dsh-upload-thumb" role="img" aria-label="${title}预览">暂无图片预览</div><button class="dsh-upload-choose" type="button" data-action="choose-upload" data-kind="${key}" aria-controls="${inputId}">选择${uploadLabel(key)}</button><input id="${inputId}" type="file" accept="image/png,image/jpeg,image/webp" data-upload="${key}" aria-label="选择${uploadLabel(key)}" hidden tabindex="-1"><span class="dsh-upload-state" role="status" aria-live="polite" data-upload-state="${key}">${esc(uploadMessage(key))}</span>${exists ? `<button class="dsh-upload-remove" type="button" data-action="clear" data-kind="${key}">移除图片</button>` : ''}${conflict}</article>`;
    };
    return `<section class="dsh-editor"><div class="dsh-editor-top"><div><h3>${p.id ? '编辑皮肤' : '新建皮肤'}</h3><input class="dsh-name" data-setting="name" type="text" maxlength="100" value="${esc(p.name)}" aria-label="皮肤名称"></div><div class="dsh-row"><button class="dsh-btn" data-action="cancel">返回列表</button><button class="dsh-btn primary" data-action="save">保存</button></div></div><div class="dsh-editor-grid"><div class="dsh-preview-frame"><div class="dsh-preview"><img class="dsh-preview-bg" alt="" aria-hidden="true"><div class="dsh-preview-shade"></div><div class="dsh-preview-tint"></div><div class="dsh-preview-sidebar"><div class="dsh-preview-new-session">＋ 新建会话</div><div class="dsh-preview-row selected">最近对话</div><div class="dsh-preview-row">工作区</div></div><div class="dsh-preview-header" aria-hidden="true"><div class="dsh-preview-header-title">会话标题</div><div class="dsh-preview-header-tabs"><span>对话</span><span>轨迹</span></div></div><div class="dsh-preview-message"></div><div class="dsh-preview-message second"></div><div class="dsh-preview-compose"><div class="dsh-preview-toolbar"><span>工作区内修改</span><span>模型</span></div><span class="dsh-preview-send" aria-hidden="true">↑</span></div><img class="dsh-preview-person" alt="" aria-hidden="true" style="display:none"><div class="dsh-preview-label">DeepSeek Harness</div></div></div><div class="dsh-controls"><fieldset class="dsh-control-group"><legend>图片素材</legend><p class="dsh-upload-limit">支持 PNG、JPG、WebP，单张不超过 10 MiB</p><div class="dsh-upload-cards">${upload('background')}${upload('character')}</div></fieldset>${hasBackground ? `<fieldset class="dsh-control-group"><legend>背景调整</legend>${range('backgroundX', '背景水平位置', 0, 100, 1, '%')}${range('backgroundY', '背景垂直位置', 0, 100, 1, '%')}${range('backgroundScale', '背景缩放', 100, 200, 1, '%')}${range('blur', '背景模糊', 0, 20, 1, 'px')}</fieldset>` : ''}<fieldset class="dsh-control-group"><legend>可读性与配色</legend>${basic ? '' : `<div class="dsh-field"><label>强调色</label><input type="color" data-setting="accent" value="${esc(s.accent)}"></div>`}${range('overlay', '背景遮罩', 0, 0.9, 0.01)}${basic ? '' : range('panelOpacity', '面板不透明度', .82, 1, 0.01)}<div class="dsh-field"><label for="setting-uiStyle">皮肤模式</label><select id="setting-uiStyle" data-setting="uiStyle"><option value="refined" ${s.uiStyle === 'refined' ? 'selected' : ''}>精致主题</option><option value="basic" ${s.uiStyle === 'basic' ? 'selected' : ''}>基础皮肤</option></select></div>${basic ? '' : `<div class="dsh-field"><label for="setting-decorations">装饰边框与阴影</label><input id="setting-decorations" type="checkbox" data-setting="decorations" ${s.decorations ? 'checked' : ''}></div>`}</fieldset>${hasCharacter ? `<fieldset class="dsh-control-group"><legend>立绘设置</legend><div class="dsh-field"><label>立绘位置</label><select data-setting="characterSide"><option value="left" ${s.characterSide === 'left' ? 'selected' : ''}>左侧</option><option value="right" ${s.characterSide === 'right' ? 'selected' : ''}>右侧</option></select></div>${range('characterSize', '立绘大小', 10, 60, 1, '%')}${range('characterOpacity', '立绘透明度', 0, 1, 0.01)}<div class="dsh-field"><label>立绘镜像</label><input type="checkbox" data-setting="characterMirror" ${s.characterMirror ? 'checked' : ''}></div></fieldset>` : ''}</div></div><div class="dsh-notice" role="status">${esc(notice)}</div></section>`;
  }
  async function syncThumbs(){
    const cards=root.querySelectorAll('[data-thumb]');
    await Promise.all([...cards].map(async el=>{const p=state?.presets?.find(x=>x.id===el.dataset.thumb);const id=p?.light?.backgroundId||p?.dark?.backgroundId;try{const src=await imageUrl(id);if(el.isConnected&&src)el.src=src;}catch{}}));
  }
  async function syncPreview(){
    const current=++previewGeneration;
    const p=editing,s=p.settings; const bg=root.querySelector('.dsh-preview-bg'), shade=root.querySelector('.dsh-preview-shade'), person=root.querySelector('.dsh-preview-person');
    if(!bg)return; let id=draftAsset('backgroundId') || '';
    bg.style.objectPosition=`${s.backgroundX}% ${s.backgroundY}%`; bg.style.transform=`scale(${s.backgroundScale/100})`; bg.style.transformOrigin=`${s.backgroundX}% ${s.backgroundY}%`; bg.style.filter=`blur(${s.blur}px)`;shade.style.background=`rgba(24,20,23,${s.overlay})`;
    person.style.display='none';person.style.left=s.characterSide==='left'?'4%':'auto';person.style.right=s.characterSide==='right'?'4%':'auto';person.style.width=`${s.characterSize}%`;person.style.opacity=s.characterOpacity;person.style.transform=s.characterMirror?'scaleX(-1)':'';
    const dark=hostDark;
    const preview=root.querySelector('.dsh-preview');
    preview?.setAttribute('data-ui-style',s.uiStyle||'refined');
    preview?.setAttribute('data-decorations',String(s.decorations!==false));
    preview?.setAttribute('data-dark',String(dark));
    const theme={pageContent:'rgba(255,255,255,0.92)',pageSidebar:'rgba(255,255,255,0.90)',pageHeader:'rgba(255,255,255,0.94)',pageMuted:'#535058',...(getUiTheme(s,dark)||{})};
    root.style.setProperty('--sk-upload-button',theme.button||'#8f5366');
    root.style.setProperty('--sk-upload-button-text',theme.buttonText||'#fff');
    root.style.setProperty('--sk-accent',theme.button||s.accent);
    if(preview){
      const refined=s.uiStyle!=='basic';
      const fill=!dark?theme.pageContent:(refined?theme.composerFill:'#1c1c20');
      const neutralInk=dark?'#f5f2f3':'#29272a';
      preview.style.setProperty('--sk-accent',refined?theme.accent:'#4b91d1');
      preview.style.setProperty('--sk-fill',fill);
      preview.style.setProperty('--sk-toolbar',refined?theme.toolbar:fill);
      preview.style.setProperty('--sk-selected',refined?theme.selected:'transparent');
      preview.style.setProperty('--sk-brand',refined?theme.brand:'#4b91d1');
      preview.style.setProperty('--sk-ink',refined?theme.ink:neutralInk);
      preview.style.setProperty('--sk-muted',!dark?theme.pageMuted:(refined?theme.muted:'#b9b4bc'));
      preview.style.setProperty('--sk-wallpaper-tint',refined?theme.wallpaperTint:`rgba(${dark?'28,28,32':'255,255,255'},0)`);
      preview.style.setProperty('--sk-line',refined?theme.line:'transparent');
      preview.style.setProperty('--sk-button',refined?theme.button:'#4b91d1');
      preview.style.setProperty('--sk-button-text','#fff');
      preview.style.setProperty('--sk-header-fill',!dark?theme.pageHeader:(refined?theme.headerFill:'#1c1c20'));
      preview.style.setProperty('--sk-header-ink',refined?theme.headerInk:(dark?'#f5f2f3':'#29272a'));
      preview.style.setProperty('--sk-header-muted',refined?theme.headerMuted:(dark?'#b9b4bc':'#716c73'));
      preview.style.setProperty('--sk-header-accent',refined?theme.headerAccent:'#4b91d1');
      const label=root.querySelector('.dsh-preview-label');
      if(label)label.style.color=refined?theme.brand:neutralInk;
      for(const card of root.querySelectorAll('.dsh-preview-sidebar,.dsh-preview-message,.dsh-preview-compose')){
        card.style.background=!dark?(card.classList.contains('dsh-preview-sidebar')?theme.pageSidebar:theme.pageContent):(refined?(card.classList.contains('dsh-preview-sidebar')?theme.sidebarFill:card.classList.contains('dsh-preview-message')?theme.messageFill:theme.composerFill):fill);
        card.style.color=refined?theme.ink:neutralInk;
        card.style.borderColor=refined&&s.decorations!==false?theme.line:'transparent';
        card.style.outline=refined&&s.decorations!==false?`1px solid ${theme.line}`:'none';
        card.style.boxShadow=refined&&s.decorations!==false?'0 4px 16px rgba(40,25,35,.12)':'none';
      }
    }
    try { const src=await imageUrl(id); if(disposed||current!==previewGeneration||!bg.isConnected)return; if(src)bg.src=src;else bg.removeAttribute('src'); } catch { if(!disposed&&current===previewGeneration)bg.removeAttribute('src'); }
    const char=draftAsset('characterId');
    try { const src=await imageUrl(char); if(current!==previewGeneration)return; if(src){person.src=src;person.style.display='block';} else {person.removeAttribute('src');} } catch {if(current===previewGeneration)person.removeAttribute('src');}
  }
  async function refresh(){
    loading = true;
    loadError = '';
    if (!state && !disposed) render();
    try {
      state = await api.state();
      loading = false;
      loadError = '';
      if (!disposed) render();
      return state;
    } catch (error) {
      loading = false;
      loadError = '读取皮肤失败，请重试。';
      state = null;
      if (!disposed) render();
      throw error;
    }
  }
  async function acceptProfile(next) {
    if (next?.presets) { state = next; render(); }
    else await refresh();
  }
  async function action(btn){
    const a=btn.dataset.action,id=btn.dataset.id;
    if(a==='new'){ resetUploadUi(); editing={id:null,name:'新建皮肤',light:{backgroundId:null,characterId:null},dark:{backgroundId:null,characterId:null},settings:{...DEFAULT_SETTINGS}};initialDraft=JSON.stringify(editing);render(); }
    else if(a==='edit'){const p=state.presets.find(x=>x.id===id);if(p){resetUploadUi();editing=normalizeDraft(fresh(p));initialDraft=JSON.stringify(editing);render();}}
    else if(a==='cancel'){requestDiscard('editor');}
    else if(a==='workspace-close'){requestClose();}
    else if(a==='continue-editing'){resolveDiscard(false);}
    else if(a==='discard-changes'){resolveDiscard(true);}
    else if(a==='retry'){try{await refresh()}catch{}}
    else if(a==='clear'){const kind=btn.dataset.kind,key=uploadKey(kind);revokeUploadUrl(uploadUi.get(key));uploadUi.delete(key);shareImage(imageField(kind),null);render();focusUploadButton(kind);}
    else if(a==='retain-image'){const kind=btn.dataset.kind,field=imageField(kind);shareImage(field,editing[btn.dataset.source][field]);notice='';render();focusUploadButton(kind);}
    else if(a==='delete-cancel'){deletingId=null;render();}
    else if(a==='save'){
      const p=fresh(editing); if(!p.name.trim()){status('请填写皮肤名称');return;}
      if (['backgroundId','characterId'].some(field => imageConflict(p,field))) { status('请先选择要保留的图片，再保存皮肤。'); return; }
      try{setBusy(true); if(!p.id){const created=await api.create(p.name);const added=created?.presets?.[created.presets.length-1];if(!added)throw new Error('创建成功但未返回新皮肤');editing.id=added.id;p.id=added.id;} const updated=await api.update(p.id,p); resetUploadUi();editing=null;initialDraft=null;await acceptProfile(updated);}catch(e){status(`保存失败：${e.message||e}`)}finally{setBusy(false)}
    } else if(a==='duplicate'||a==='delete'||a==='delete-confirm'){
      const p=state.presets.find(x=>x.id===id);if(!p)return;
      if (a === 'delete') { deletingId = id; render(); return; }
      try {
        setBusy(true);
        const updated = a === 'duplicate' ? await api.duplicate(id) : await api.remove(id);
        if (a === 'delete-confirm') deletingId = null;
        await acceptProfile(updated);
      } catch(e) { status(`操作失败：${e.message||e}`); }
      finally { setBusy(false); }
    } else if (a === 'apply' || a === 'default') {
      try {
        setBusy(true);
        await acceptProfile(await api.activate(a === 'default' ? null : id));
      } catch(e) { status(`应用失败：${e.message||e}`); }
      finally { setBusy(false); }
    }
  }
  async function handleUpload(t) {
    const file = t.files?.[0];
    if (!file || busy || !editing) return;
    const kind = t.dataset.upload, key = uploadKey(kind);
    t.value = '';
    const item = {fileName: file.name || '所选图片', phase: 'checking', message: '正在检查图片…'};
    uploadUi.set(key, item);
    let objectUrl = '', stage = 'check';
    setBusy(true);
    render();
    const fail = (message) => { const error = new Error(message); error.userMessage = message; return error; };
    try {
      if (file.size > 10 * 1024 * 1024) throw fail('图片不能超过 10 MiB，请选择较小的图片。');
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const actual = bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
        ? {mime: 'image/png', label: 'PNG'}
        : bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
          ? {mime: 'image/jpeg', label: 'JPEG'}
          : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
            ? {mime: 'image/webp', label: 'WebP'} : null;
      const declared = String(file.type || '').toLowerCase();
      if (!/^image\/(png|jpeg|webp)$/.test(declared)) throw fail('无法确认所选文件的图片格式，请选择 PNG、JPG 或 WebP 图片。');
      if (!actual) throw fail('无法识别图片内容，请选择有效的 PNG、JPG 或 WebP 图片。');
      if (declared !== actual.mime) {
        const suffix = /\.png$/i.test(file.name || '') && declared === 'image/png' && actual.mime === 'image/jpeg';
        throw fail(suffix ? '文件后缀为 PNG，但实际内容是 JPEG，请改为 .jpg 后重试。' : '文件声明的格式与实际图片内容不一致，请检查文件格式后重试。');
      }
      objectUrl = URL.createObjectURL(file);
      item.objectUrl = objectUrl;
      item.message = '正在检查图片：' + item.fileName;
      render();
      stage = 'decode';
      const decoded = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({width: image.naturalWidth, height: image.naturalHeight});
        image.onerror = () => reject(new Error('decode'));
        image.src = objectUrl;
      });
      if (!decoded.width || !decoded.height || decoded.width * decoded.height > 40_000_000) throw fail('图片尺寸无效或超过 4000 万像素，请选择较小的图片。');
      if (disposed || editing == null) return;
      item.phase = 'uploading';
      item.message = '正在上传：' + item.fileName;
      render();
      stage = 'upload';
      const asset = await api.upload(file);
      if (disposed || editing == null) return;
      shareImage(imageField(kind), asset.id);
      revokeUploadUrl(item);
      item.objectUrl = '';
      item.phase = 'uploaded';
      item.message = item.fileName + '：上传完成，保存皮肤后生效';
      render();
    } catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      item.objectUrl = '';
      item.phase = 'failed';
      item.message = error?.userMessage || (stage === 'decode'
        ? '图片无法解码，请选择有效图片后重试。'
        : stage === 'upload' ? '上传未成功，请检查图片格式或网络后重试。' : '图片处理失败，请重新选择 PNG、JPG 或 WebP 图片。');
      if (!disposed) render();
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(false);
      focusUploadButton(kind);
    }
  }
  root.addEventListener('click', async e=>{const b=e.target.closest('button');if(!b||busy)return;const actionName=b.dataset.action;if(actionName==='choose-upload'){root.querySelector('#upload-'+b.dataset.kind)?.click();return;}const needsState=['new','edit','duplicate','delete','delete-confirm','apply','default'].includes(actionName);if(needsState&&(!state||loading))return;if(actionName==='retry'&&loading)return;await action(b);});
  root.addEventListener('input',e=>{const t=e.target;if(!editing||!t.dataset.setting)return;const key=t.dataset.setting;if(key==='name'){editing.name=t.value;return;} if(t.type==='range')editing.settings[key]=Number(t.value);else if(t.type==='checkbox')editing.settings[key]=t.checked;else if(t.type==='color')editing.settings[key]=t.value;const out=t.parentElement.querySelector('output');if(out)out.textContent=`${t.value}${['backgroundX','backgroundY','backgroundScale','characterSize'].includes(key)?'%':key==='blur'?'px':''}`;syncPreview();});
  root.addEventListener('change',async e=>{const t=e.target;if(t.dataset.setting&&t.tagName==='SELECT'){editing.settings[t.dataset.setting]=t.value;if(t.dataset.setting==='uiStyle'){const controls=root.querySelector('.dsh-controls'),scrollTop=controls?.scrollTop||0;render();const next=root.querySelector(`#setting-uiStyle`);next?.focus?.();const nextControls=root.querySelector('.dsh-controls');if(nextControls)nextControls.scrollTop=scrollTop;}else syncPreview();}if(t.dataset.setting==='decorations'){editing.settings.decorations=t.checked;syncPreview();}if(t.dataset.upload)await handleUpload(t);});
  render();
  refresh().catch(()=>{});
  const dispose = ()=>{disposed=true;previewGeneration++;themeObserver?.disconnect();media.removeEventListener?.('change',onHostThemeChange);uploadRenderGeneration++;resetUploadUi();unsubscribeState?.();root.remove();style.remove();};
  dispose.requestClose = requestClose;
  return dispose;
}


/**
 * Skin renderer.
 *
 * Two facts about DSH 0.2.x decide this design:
 *
 * 1. Every slot is rendered through `renderSlot()`, which mounts a
 *    `<div data-slot="<name>" style="display: contents">` anchor. An element
 *    with `display: contents` generates no box, so marking a slot anchor and
 *    giving it a background paints nothing at all.
 * 2. On macOS, DSH leaves `html` and `body` transparent, but paints the app
 *    frame, center column, and conversation view from `--dsw-alias-bg-base`.
 *    Making that one token transparent exposes the wallpaper through those
 *    nested surfaces. The wallpaper layer applies one base tint, while
 *    layer-1/2/3 retain the preset's translucent fill for local panels.
 *
 * It owns the base and panel token overrides plus the tint layer. Refined mode
 * decorates only verified painted host boxes; every marker and token is leased
 * and restored when the style changes or the renderer is disabled.
 */
const BASE_SELECTORS = { composer: '[data-slot="conversation.composer.bar"]', sidebar: '[data-slot="sidebar"]', header: '.ST7X_W_header' };
const BASE_TOKEN = '--dsw-alias-bg-base';
const PANEL_TOKENS = [
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
];
const SURFACE_ATTRIBUTE = 'data-dsh-skin-surface';
const SURFACE_VALUE = '--dsh-skin-surface-value';
const PANEL_VALUE = '--dsh-skin-panel-value';
const ACCENT_VALUE = '--dsh-skin-accent-value';
const UI_STYLE = 'data-dsh-skin-ui';
const DECORATIONS = 'data-dsh-skin-decorations';
const BOX_ATTRIBUTE = 'data-dsh-skin-box';
const LIGHT_SURFACE = '255,255,255';
const DARK_SURFACE = '28,28,32';
const READABLE_ATTRIBUTE = 'data-dsh-skin-readable';
const READABILITY_KEYS = ['fill', 'ink', 'muted', 'hover', 'selected', 'border', 'caption', 'icon', 'header', 'sidebar', 'content', 'meta'];
const READABILITY_VARS = READABILITY_KEYS.map(key => `--dsh-skin-page-${key}`);

const CSS = `
html[${SURFACE_ATTRIBUTE}] body {
  ${BASE_TOKEN}: transparent !important;
}
/* Readability is shared by basic and refined skins, independent of decoration. */
html[${SURFACE_ATTRIBUTE}][${READABLE_ATTRIBUTE}="light"] body {
  --dsw-alias-label-primary: var(--dsh-skin-page-ink) !important;
  --dsw-alias-label-secondary: var(--dsh-skin-page-muted) !important;
  --dsw-alias-label-tertiary: var(--dsh-skin-page-caption) !important;
  --dsw-alias-label-caption: var(--dsh-skin-page-caption) !important;
  --dsw-specific-sidebar-fill: transparent !important;
}
html[${READABLE_ATTRIBUTE}="light"] [data-slot="sidebar"] ._3WPZCG_root {
  background-color: var(--dsh-skin-page-sidebar) !important;
}
html[${READABLE_ATTRIBUTE}="light"] .ST7X_W_header {
  background-color: var(--dsh-skin-page-header) !important;
  --dsw-alias-label-primary: var(--dsh-skin-page-ink) !important;
  --dsw-alias-label-secondary: var(--dsh-skin-page-muted) !important;
  --dsw-alias-label-tertiary: var(--dsh-skin-page-caption) !important;
  --dsw-alias-label-caption: var(--dsh-skin-page-caption) !important;
}
html[${READABLE_ATTRIBUTE}="light"] [data-slot="sidebar"] ._3WPZCG_panelRow,
html[${READABLE_ATTRIBUTE}="light"] [data-slot="sidebar"] [role="treeitem"] {
  color: var(--dsh-skin-page-ink);
}
html[${READABLE_ATTRIBUTE}="light"] [data-slot="sidebar"] :is(.jJkEga_time, .jJkEga_projectText) {
  color: var(--dsh-skin-page-caption) !important;
}
html[${READABLE_ATTRIBUTE}="light"] [data-slot="sidebar"] .jJkEga_slot:not(.jJkEga_folderActive) {
  color: var(--dsh-skin-page-icon);
}
/* The assistant's markdown is a painted box; slot anchors are display:contents. */
html[${READABLE_ATTRIBUTE}="light"] [data-chat-flow-kind="assistant-step"] .gKv1-q_root {
  background-color: var(--dsh-skin-page-content);
  color: var(--dsh-skin-page-ink);
  border-radius: 12px;
  padding: 12px 16px;
}
html[${READABLE_ATTRIBUTE}="light"] [data-turn-tail] :is(.ppByMG_action, .ppByMG_timeStart, .ppByMG_endInfo),
html[${READABLE_ATTRIBUTE}="light"] [data-composer-stats] .OpZ85W_pill,
html[${READABLE_ATTRIBUTE}="light"] .y0jqnG_trigger {
  background-color: var(--dsh-skin-page-meta);
  border-radius: 8px;
}
html[${READABLE_ATTRIBUTE}="light"] [data-turn-tail] :is(.ppByMG_timeStart, .ppByMG_endInfo) { padding: 2px 6px; }
html[${READABLE_ATTRIBUTE}="light"] :is(.IzP3Va_fileMeta, .ppByMG_timeStart, .ppByMG_timeEnd, .OpZ85W_label) {
  color: var(--dsh-skin-page-caption) !important;
}
html[${READABLE_ATTRIBUTE}="light"] [data-composer-card] {
  background-color: var(--dsh-skin-page-content) !important;
  --dsw-alias-label-secondary: var(--dsh-skin-page-muted) !important;
  --dsw-alias-label-tertiary: var(--dsh-skin-page-caption) !important;
  --dsw-alias-label-caption: var(--dsh-skin-page-caption) !important;
}
html[${READABLE_ATTRIBUTE}="light"] [data-composer-card] :is(input, textarea, [contenteditable="true"]) {
  color: var(--dsh-skin-page-ink);
}
html[${READABLE_ATTRIBUTE}="light"] :is([data-composer-card], [data-plugin-panel], [data-testid="task-manager-page"]) :is(input, textarea)::placeholder {
  color: var(--dsh-skin-page-caption) !important;
  opacity: 1;
}
html[${READABLE_ATTRIBUTE}="light"] [data-plugin-panel] .ZVcBiW_toolbar,
html[${READABLE_ATTRIBUTE}="light"] [data-testid="task-manager-page"] .CxUija_pageHeading > h1 {
  background-color: var(--dsh-skin-page-header);
  border-radius: 12px;
  padding: 8px 12px;
}
html[${READABLE_ATTRIBUTE}="light"] [data-testid="task-manager-page"] .CxUija_pageHeading > h1 {
  flex: 0 1 auto;
}
/* Verified DSH 0.2.x plugin page anchors; only these local boxes cover the wallpaper. */
html[${SURFACE_ATTRIBUTE}] [data-plugin-panel],
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] {
  --dsw-alias-label-primary: var(--dsh-skin-page-ink) !important;
  --dsw-alias-label-secondary: var(--dsh-skin-page-muted) !important;
  --dsw-alias-label-tertiary: var(--dsh-skin-page-muted) !important;
  --dsw-alias-label-caption: var(--dsh-skin-page-muted) !important;
  --dsw-alias-interactive-bg-hover: var(--dsh-skin-page-hover) !important;
  --dsw-alias-interactive-bg-active: var(--dsh-skin-page-selected) !important;
  --dsw-alias-border-l2: var(--dsh-skin-page-border) !important;
  --dsw-alias-border-l3: var(--dsh-skin-page-border) !important;
}
html[${SURFACE_ATTRIBUTE}] [data-plugin-panel] > header > div:first-child,
html[${SURFACE_ATTRIBUTE}] [data-plugin-panel] [data-plugin-group],
html[${SURFACE_ATTRIBUTE}] [data-plugin-panel] .ZVcBiW_empty {
  background-color: var(--dsh-skin-page-fill) !important;
  border-radius: 14px;
  padding: 16px;
}
html[${SURFACE_ATTRIBUTE}] [data-plugin-panel] [data-plugin-group] > ul {
  margin-bottom: 0;
}
/* TaskManagerPage.module.css classes verified in the same host bundle. */
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_filterTabs,
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_searchField,
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_listRows,
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_empty {
  background-color: var(--dsh-skin-page-fill) !important;
  border-radius: 14px;
}
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_filterTabs { padding: 6px; }
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_filterTab {
  color: var(--dsh-skin-page-muted) !important;
}
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_filterTabActive {
  color: var(--dsh-skin-page-ink) !important;
  background-color: var(--dsh-skin-page-selected) !important;
}
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_searchField input {
  color: var(--dsh-skin-page-ink) !important;
  caret-color: var(--dsh-skin-page-ink);
}
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_searchField input::placeholder {
  color: var(--dsh-skin-page-muted) !important;
  opacity: 1;
}
html[${SURFACE_ATTRIBUTE}] [data-testid="task-manager-page"] .CxUija_empty {
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
  margin: 24px auto;
  padding: 32px;
}
html[${SURFACE_ATTRIBUTE}][${UI_STYLE}="refined"] body {
${PANEL_TOKENS.map(token => `  ${token}: var(${PANEL_VALUE}) !important;`).join('\n')}
}
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="composer"] {
  background-color: var(--dsh-skin-box-fill) !important;
  border-radius: var(--dsh-skin-box-radius) !important;
  color: var(--dsh-skin-ink);
}
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="message"] {
  background-color: var(--dsh-skin-message-fill) !important;
  border-radius: var(--dsh-skin-box-radius) !important;
  color: var(--dsh-skin-message-ink);
}
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] { background-color: transparent !important; }
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="header"] {
  background-color: var(--dsh-skin-header-fill) !important;
  color: var(--dsh-skin-header-ink) !important;
  --dsw-alias-label-primary: var(--dsh-skin-header-ink) !important;
  --dsw-alias-label-secondary: var(--dsh-skin-header-muted) !important;
  --dsw-alias-label-tertiary: var(--dsh-skin-header-muted) !important;
  --dsw-alias-label-caption: var(--dsh-skin-header-muted) !important;
  --dsw-alias-state-business-primary: var(--dsh-skin-header-accent) !important;
}
[${UI_STYLE}="refined"][${DECORATIONS}="false"] [${BOX_ATTRIBUTE}="header"] { border-bottom-color: transparent !important; }
/* Verified against the DSH 0.2.x app.asar bundle; revalidate these hashed classes when the host UI changes. */
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_panelRow,
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] [role="treeitem"] { color: var(--dsh-skin-ink); }
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_newSession {
  color: var(--dsh-skin-brand);
  background-color: var(--dsh-skin-toolbar) !important;
  border-radius: 9px;
}
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_panelRow:hover,
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] [role="treeitem"]:hover { background-color: var(--dsh-skin-hover) !important; }
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_panelRow._3WPZCG_panelActive,
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] [role="treeitem"][aria-selected="true"],
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="sidebar"] [aria-current="page"] {
  background-color: var(--dsh-skin-selected) !important;
  color: var(--dsh-skin-ink) !important;
}
[${BOX_ATTRIBUTE}="composer"], [data-dsh-skin-owned="composer"] { --dsh-skin-accent: var(${ACCENT_VALUE}); }
[${BOX_ATTRIBUTE}="composer"] :focus-visible, [data-dsh-skin-owned="composer"] :focus-visible { outline-color: var(--dsh-skin-accent) !important; }
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="composer"] .yhfFVG_row {
  background-color: var(--dsh-skin-toolbar) !important;
  border-top: 1px solid var(--dsh-skin-border) !important;
  border-radius: 0 0 var(--dsh-skin-box-radius) var(--dsh-skin-box-radius);
}
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="composer"] .yhfFVG_input { color: var(--dsh-skin-ink); caret-color: var(--dsh-skin-accent); }
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="composer"] .yhfFVG_primary {
  background-color: var(--dsh-skin-button) !important;
  color: var(--dsh-skin-button-text) !important;
}
[${UI_STYLE}="refined"] [${BOX_ATTRIBUTE}="composer"] .yhfFVG_primary:hover { background-color: var(--dsh-skin-button-hover) !important; }
html[${UI_STYLE}="refined"] body {
  --dsw-alias-button-primary-fill: var(--dsh-skin-button) !important;
  --dsw-alias-button-primary-hover: var(--dsh-skin-button-hover) !important;
  --dsw-alias-button-info-fill: var(--dsh-skin-button) !important;
  --dsw-alias-button-info-hover: var(--dsh-skin-button-hover) !important;
  --dsw-alias-button-elevated-fill: var(--dsh-skin-box-fill) !important;
  --dsw-alias-button-floating-fill: var(--dsh-skin-box-fill) !important;
  --dsw-alias-button-floating-hover: var(--dsh-skin-hover) !important;
  --dsw-alias-interactive-bg-active: var(--dsh-skin-hover) !important;
  --dsw-alias-interactive-bg-hover: var(--dsh-skin-hover) !important;
  --dsw-alias-interactive-bg-hover-solid: var(--dsh-skin-soft) !important;
  --dsw-alias-label-primary: var(--dsh-skin-ink) !important;
  --dsw-alias-label-secondary: var(--dsh-skin-muted) !important;
  --dsw-alias-label-tertiary: var(--dsh-skin-muted) !important;
  --dsw-alias-label-caption: var(--dsh-skin-muted) !important;
  --dsw-alias-brand-primary: var(--dsh-skin-brand) !important;
  --dsw-alias-brand-text: var(--dsh-skin-brand) !important;
  --dsw-alias-border-l1: var(--dsh-skin-border) !important;
  --dsw-alias-border-l2: var(--dsh-skin-border) !important;
  --dsw-alias-border-l3: var(--dsh-skin-border) !important;
  --dsw-alias-border-l2-darkmode-thin: var(--dsh-skin-border) !important;
  --dsw-specific-selector: var(--dsh-skin-hover) !important;
  --dsw-specific-sidebar-fill: var(--dsh-skin-sidebar-fill) !important;
}
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="composer"],
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="sidebar"],
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="message"] { outline: 1px solid var(--dsh-skin-box-line) !important; outline-offset: -1px; box-shadow: 0 5px 22px rgba(30, 20, 28, .10); }
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_newSession { outline: 1px solid var(--dsh-skin-box-line); outline-offset: -1px; }
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_panelRow._3WPZCG_panelActive,
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="sidebar"] [role="treeitem"][aria-selected="true"],
[${UI_STYLE}="refined"][${DECORATIONS}="true"] [${BOX_ATTRIBUTE}="sidebar"] [aria-current="page"] { box-shadow: inset 3px 0 var(--dsh-skin-brand); }
[${UI_STYLE}="refined"][${DECORATIONS}="false"] [${BOX_ATTRIBUTE}="composer"],
[${UI_STYLE}="refined"][${DECORATIONS}="false"] [${BOX_ATTRIBUTE}="sidebar"],
[${UI_STYLE}="refined"][${DECORATIONS}="false"] [${BOX_ATTRIBUTE}="message"] { outline: none !important; box-shadow: none !important; border-color: transparent !important; }
[${UI_STYLE}="refined"][${DECORATIONS}="false"] [${BOX_ATTRIBUTE}="composer"] .yhfFVG_row { border-top-color: transparent !important; }
[${UI_STYLE}="refined"][${DECORATIONS}="false"] [${BOX_ATTRIBUTE}="sidebar"] ._3WPZCG_newSession { outline: none !important; }
/* DSH marks body children outside #root no-drag. DOM pointer-events do not reset Electron's native app-region hit test. */
.dsh-skin-layer { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: -1; visibility: hidden; -webkit-app-region: initial !important; }
.dsh-skin-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; will-change: transform; filter: blur(var(--dsh-blur,0px)); }
.dsh-skin-shade { position: absolute; inset: 0; background: rgba(24,20,23,var(--dsh-overlay,0)); }
.dsh-skin-character { position: absolute; bottom: 0; max-width: 60vw; max-height: 80vh; height: auto; object-fit: contain; object-position: bottom; }
.dsh-skin-character { z-index: 1; }
.dsh-skin-surface { position: absolute; inset: 0; z-index: 0; background: var(${SURFACE_VALUE}); }
`;

function isDark(doc, media) {
  const html = doc.documentElement;
  const theme = (html?.getAttribute('data-theme') || '').toLowerCase();
  if (theme === 'dark' || theme === 'light') return theme === 'dark';
  if (html?.classList.contains('dark')) return true;
  if (html?.classList.contains('light')) return false;
  const colorScheme = (html?.style.colorScheme || '').toLowerCase();
  if (colorScheme === 'dark' || colorScheme === 'light') return colorScheme === 'dark';
  if (doc.body?.hasAttribute('data-ds-dark-theme')) return true;
  return Boolean(media.matches);
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function getUiTheme(settings = {}, dark = false) {
  const basic = settings.uiStyle === 'basic';
  const opacity = clamp(settings.panelOpacity ?? 0.85, basic ? 0.3 : 0.82, 1, 0.85);
  const accent = typeof settings.accent === 'string' && /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent.toUpperCase() : '#D88F9E';
  const rgb = accent.slice(1).match(/../g).map(part => parseInt(part, 16));
  const luminanceOf = color => color.map(value => { const c=value/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrast = (a,b) => { const l1=Math.max(a,b),l2=Math.min(a,b);return (l1+.05)/(l2+.05); };
  let buttonLow=0,buttonHigh=1;
  for(let i=0;i<16;i++){
    const ratio=(buttonLow+buttonHigh)/2;
    const blended=rgb.map(v=>Math.round(v*(1-ratio)));
    if(contrast(luminanceOf(blended),1)>=4.5) buttonHigh=ratio; else buttonLow=ratio;
  }
  const buttonRgb=rgb.map(v=>Math.round(v*(1-buttonHigh)));
  const button=`#${buttonRgb.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
  const buttonHoverRgb=buttonRgb.map(v=>Math.round(v*.92));
  const buttonHover=`#${buttonHoverRgb.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
  const neutralRgb = (dark ? (basic ? DARK_SURFACE : '30,30,35') : LIGHT_SURFACE).split(',').map(Number);
  const brandFillMix = basic ? 0 : dark ? .30 : .10;
  const brandSurfaceRgb = neutralRgb.map((value,index) => Math.round(value * (1 - brandFillMix) + rgb[index] * brandFillMix));
  const target = dark ? [255,255,255] : [24,22,25];
  const brandSurfaceLuminance = luminanceOf(brandSurfaceRgb);
  let low=0,high=1;
  for(let i=0;i<16;i++){
    const ratio=(low+high)/2;
    const blended=rgb.map((v,index)=>Math.round(v+(target[index]-v)*ratio));
    if(contrast(luminanceOf(blended),brandSurfaceLuminance)>=4.5) high=ratio; else low=ratio;
  }
  const brandRgb=rgb.map((v,index)=>Math.round(v+(target[index]-v)*high));
  const panelOpacity = opacity;
  const panelRgb = basic ? neutralRgb : neutralRgb.map((value,index) => Math.round(value * .96 + rgb[index] * .04));
  const panel = `rgba(${panelRgb.join(',')},${panelOpacity})`;
  const tinted = (amount, alpha = panelOpacity) => `rgba(${neutralRgb.map((value,index) => Math.round(value * (1 - amount) + rgb[index] * amount)).join(',')},${alpha})`;
  const sidebarFill = basic ? panel : tinted(dark ? .16 : .06);
  const composerFill = basic ? panel : tinted(dark ? .20 : .10);
  const messageFill = basic ? panel : tinted(dark ? .10 : .035);
  const toolbar = basic ? panel : tinted(dark ? .12 : .06);
  const headerAlpha = dark ? .88 : .94;
  const headerRgb = dark ? [20,18,24] : [255,255,255];
  const headerFill = `rgba(${headerRgb.join(',')},${headerAlpha})`;
  const worstHeaderRgb = dark
    ? headerRgb.map(value=>value*headerAlpha+255*(1-headerAlpha))
    : headerRgb.map(value=>value*headerAlpha);
  const headerLuminance = luminanceOf(worstHeaderRgb);
  const headerTarget = dark ? [255,255,255] : [24,22,25];
  let headerLow=0,headerHigh=1;
  for(let i=0;i<16;i++){
    const ratio=(headerLow+headerHigh)/2;
    const blended=rgb.map((v,index)=>Math.round(v+(headerTarget[index]-v)*ratio));
    if(contrast(luminanceOf(blended),headerLuminance)>=4.5) headerHigh=ratio; else headerLow=ratio;
  }
  const headerAccentRgb=rgb.map((v,index)=>Math.round(v+(headerTarget[index]-v)*headerHigh));
  const headerAccent=`#${headerAccentRgb.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
  const wallpaperOpacity = basic ? 0 : .12;
  const wallpaperTint = `rgba(${dark ? DARK_SURFACE : LIGHT_SURFACE},${wallpaperOpacity})`;
  return {
    fill: composerFill, panel, sidebarFill, composerFill, messageFill, toolbar, selected: tinted(dark ? .30 : .18, 1), wallpaperTint,
    line: basic ? `rgba(${rgb.join(',')},.22)` : `rgba(${rgb.join(',')},.5)`, border: basic ? `rgba(${rgb.join(',')},.34)` : `rgba(${rgb.join(',')},.6)`,
    ink: dark ? '#f5f2f3' : '#29272a', muted: dark ? '#b9b4bc' : '#716c73', soft: dark ? '#252329' : '#f8f5f6',
    headerFill, headerInk: dark ? '#f5f2f3' : '#29272a', headerMuted: dark ? '#ded9df' : '#535058', headerAccent,
    // Local page surfaces must remain readable even over a white/black wallpaper,
    // including in basic mode, which leaves the host's other controls untouched.
    pageFill: dark ? 'rgba(20,18,24,0.85)' : 'rgba(255,255,255,0.85)',
    pageInk: dark ? '#f5f2f3' : '#29272a', pageMuted: dark ? '#e0dde3' : '#535058',
    pageHover: dark ? '#35323b' : '#eeeaf0', pageSelected: dark ? '#48414f' : '#e2dce8',
    pageBorder: dark ? 'rgba(224,221,227,0.35)' : 'rgba(83,80,88,0.35)',
    pageCaption: dark ? '#e0dde3' : '#535B66', pageIcon: dark ? '#e0dde3' : '#535058',
    pageHeader: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.94)',
    pageSidebar: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.90)',
    pageContent: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.92)',
    pageMeta: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.94)',
    accent, brand: `#${brandRgb.map(v=>v.toString(16).padStart(2,'0')).join('')}`, button, buttonHover, hover:`rgba(${rgb.join(',')},.12)`, buttonText:'#FFFFFF',
  };
}

function installRenderer({
  api,
  document: doc = globalThis.document,
  selectors = BASE_SELECTORS,
  window: win = globalThis.window,
  layerRoot = null,
} = {}) {
  if (!doc || !api) throw new TypeError('installRenderer requires api and document');

  const html = doc.documentElement;
  const media = win?.matchMedia?.('(prefers-color-scheme: dark)') || {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.append(style);

  const layer = doc.createElement('div');
  layer.className = 'dsh-skin-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<img class="dsh-skin-image" alt=""><div class="dsh-skin-shade"></div><img class="dsh-skin-character" alt=""><div class="dsh-skin-surface"></div>';
  (layerRoot || doc.body || html).append(layer);
  const image = layer.querySelector('.dsh-skin-image');
  const character = layer.querySelector('.dsh-skin-character');

  const originalSurfaceAttribute = html.getAttribute(SURFACE_ATTRIBUTE);
  const originalReadableAttribute = html.getAttribute(READABLE_ATTRIBUTE);
  const originalSurfaceValue = html.style.getPropertyValue(SURFACE_VALUE);
  const originalPanelValue = html.style.getPropertyValue(PANEL_VALUE);
  const originalUiStyle = html.getAttribute(UI_STYLE);
  const originalDecorations = html.getAttribute(DECORATIONS);
  const originalUiVars = ['--dsh-skin-box-fill','--dsh-skin-sidebar-fill','--dsh-skin-message-fill','--dsh-skin-toolbar','--dsh-skin-selected','--dsh-skin-box-line','--dsh-skin-box-radius','--dsh-skin-message-ink','--dsh-skin-border','--dsh-skin-ink','--dsh-skin-muted','--dsh-skin-soft','--dsh-skin-brand','--dsh-skin-button','--dsh-skin-button-hover','--dsh-skin-hover','--dsh-skin-button-text','--dsh-skin-header-fill','--dsh-skin-header-ink','--dsh-skin-header-muted','--dsh-skin-header-accent'].map(name => [name, html.style.getPropertyValue(name)]);
  const originalReadabilityVars = new Map(READABILITY_VARS.map(name => [name, html.style.getPropertyValue(name)]));
  const writtenReadabilityVars = new Map();

  let preset = null;
  let disposed = false;
  let generation = 0;
  let raf = null;
  let externallyDriven = false;
  let writtenSurface = null;
  let writtenPanel = null;
  const writtenAttrs = new Map();
  const writtenUiVars = new Map();
  let themeObserver;
  let bodyThemeObserver;
  let hostObserver;
  const owned = new Map();
  let legacyComposer = null;
  const urlCache = new Map();

  function setStyleValue(target, name, value) {
    if (target.style.getPropertyValue(name) === value) return;
    target.style.setProperty(name, value);
  }
  function restoreStyleValue(target, name, original, written) {
    if (target.style.getPropertyValue(name) !== written || original === written) return;
    if (original) target.style.setProperty(name, original);
    else target.style.removeProperty(name);
  }
  function setOwnedAttr(name, value) {
    if (html.getAttribute(name) === value) return;
    html.setAttribute(name, value);
    writtenAttrs.set(name, value);
  }
  function restoreOwnedAttr(name, original) {
    if (!writtenAttrs.has(name) || html.getAttribute(name) !== writtenAttrs.get(name)) return;
    if (original === null) html.removeAttribute(name);
    else html.setAttribute(name, original);
    writtenAttrs.delete(name);
  }
  function setUiVariable(name, value) {
    setStyleValue(html, name, value);
    writtenUiVars.set(name, value);
  }
  function restoreUiVariables() {
    for (const [name, written] of writtenUiVars) {
      if (html.style.getPropertyValue(name) !== written) { writtenUiVars.delete(name); continue; }
      const original = originalUiVars.find(([key]) => key === name)?.[1] || '';
      restoreStyleValue(html, name, original, written);
      writtenUiVars.delete(name);
    }
  }

  function applyReadability(theme, dark) {
    if (dark) restoreOwnedAttr(READABLE_ATTRIBUTE, originalReadableAttribute);
    else setOwnedAttr(READABLE_ATTRIBUTE, 'light');
    for (const key of READABILITY_KEYS) {
      const name = `--dsh-skin-page-${key}`;
      const value = theme[`page${key[0].toUpperCase()}${key.slice(1)}`];
      setStyleValue(html, name, value);
      writtenReadabilityVars.set(name, value);
    }
  }

  function releaseReadability() {
    restoreOwnedAttr(READABLE_ATTRIBUTE, originalReadableAttribute);
    for (const [name, written] of writtenReadabilityVars) {
      restoreStyleValue(html, name, originalReadabilityVars.get(name), written);
    }
    writtenReadabilityVars.clear();
  }

  async function assetUrl(id) {
    if (!id) return '';
    if (!urlCache.has(id)) urlCache.set(id, Promise.resolve(api.assetUrl(id)));
    try { return await urlCache.get(id); } catch { urlCache.delete(id); return ''; }
  }

  function activeSlots() {
    const result = new Map();
    for (const [slot, selector] of Object.entries(selectors || {})) {
      if (selector) {
        const anchor = doc.querySelector(selector);
        let el = anchor;
        if (slot === 'composer' && anchor) el = doc.querySelector('[data-composer-card]') || anchor.closest?.('[data-composer-card]') || anchor.querySelector('[data-composer-card]') || null;
        if (slot === 'sidebar' && anchor) {
          el = anchor.firstElementChild;
          let display = el ? win?.getComputedStyle?.(el)?.display : null;
          if (display === 'none') el = null;
          while (el && display === 'contents') {
            el = el.firstElementChild;
            display = el ? win?.getComputedStyle?.(el)?.display : null;
            if (display === 'none') el = null;
          }
          if (!el || !['block','flex'].includes(display)) el = null;
        }
        if (el) result.set(el, slot);
      }
    }
    for (const el of doc.querySelectorAll('[data-chat-flow-key][data-chat-flow-kind]')) {
      const kind = el.getAttribute('data-chat-flow-kind');
      if (['user','steering','turn-process'].includes(kind)) result.set(el, 'message');
    }
    return result;
  }

  function syncSlots(slots) {
    for (const [el, record] of owned) {
      if (!slots.has(el)) {
        restore(el, record);
        owned.delete(el);
      }
    }

    for (const [el, slot] of slots) {
      let record = owned.get(el);
      if (!record) {
        record = { original: el.getAttribute(BOX_ATTRIBUTE), originalAccent: el.style.getPropertyValue(ACCENT_VALUE), slot };
        owned.set(el, record);
      }
      record.slot = slot;
      if (el.getAttribute(BOX_ATTRIBUTE) !== slot) el.setAttribute(BOX_ATTRIBUTE, slot);
      if (slot === 'composer') {
        record.writtenAccent = preset?.settings?.accent || '#D88F9E';
        setStyleValue(el, ACCENT_VALUE, record.writtenAccent);
      }
    }
  }

  function restoreLegacyComposer() {
    if (!legacyComposer) return;
    const {el, originalOwned, originalAccent, writtenAccent} = legacyComposer;
    if (el.getAttribute('data-dsh-skin-owned') === 'composer') {
      if (originalOwned === null) el.removeAttribute('data-dsh-skin-owned');
      else el.setAttribute('data-dsh-skin-owned', originalOwned);
    }
    restoreStyleValue(el, ACCENT_VALUE, originalAccent, writtenAccent);
    legacyComposer = null;
  }

  function syncLegacyComposer(accent, enabled) {
    const el = enabled ? doc.querySelector('[data-slot="conversation.composer.bar"]') : null;
    if (legacyComposer && legacyComposer.el !== el) restoreLegacyComposer();
    if (!el) return;
    if (!legacyComposer) legacyComposer = {
      el,
      originalOwned: el.getAttribute('data-dsh-skin-owned'),
      originalAccent: el.style.getPropertyValue(ACCENT_VALUE),
      writtenAccent: null,
    };
    legacyComposer.writtenAccent = accent || '#D88F9E';
    if (el.getAttribute('data-dsh-skin-owned') !== 'composer') el.setAttribute('data-dsh-skin-owned', 'composer');
    setStyleValue(el, ACCENT_VALUE, legacyComposer.writtenAccent);
  }

  function restore(el, record) {
    if (el.getAttribute(BOX_ATTRIBUTE) === record.slot) {
      if (record.original === null) el.removeAttribute(BOX_ATTRIBUTE);
      else el.setAttribute(BOX_ATTRIBUTE, record.original);
    }
    restoreStyleValue(el, ACCENT_VALUE, record.originalAccent, record.writtenAccent);
  }

  /** Keep local panel tokens translucent and tint the wallpaper once. */
  function applySurface(theme, refined, decorations) {
    setStyleValue(html, SURFACE_VALUE, theme.wallpaperTint);
    if (originalSurfaceAttribute === null) setOwnedAttr(SURFACE_ATTRIBUTE, '');
    if (refined) {
      setStyleValue(html, PANEL_VALUE, theme.panel);
      writtenPanel = theme.panel;
      setOwnedAttr(UI_STYLE, 'refined');
      setOwnedAttr(DECORATIONS, decorations ? 'true' : 'false');
      setUiVariable('--dsh-skin-box-fill', theme.fill);
      setUiVariable('--dsh-skin-sidebar-fill', theme.sidebarFill);
      setUiVariable('--dsh-skin-message-fill', theme.messageFill);
      setUiVariable('--dsh-skin-toolbar', theme.toolbar);
      setUiVariable('--dsh-skin-selected', theme.selected);
      setUiVariable('--dsh-skin-box-line', theme.line);
      setUiVariable('--dsh-skin-box-radius', '14px');
      setUiVariable('--dsh-skin-message-ink', theme.ink);
      setUiVariable('--dsh-skin-border', theme.border);
      setUiVariable('--dsh-skin-ink', theme.ink);
      setUiVariable('--dsh-skin-muted', theme.muted);
      setUiVariable('--dsh-skin-soft', theme.soft);
      setUiVariable('--dsh-skin-brand', theme.brand);
      setUiVariable('--dsh-skin-button', theme.button);
      setUiVariable('--dsh-skin-button-hover', theme.buttonHover);
      setUiVariable('--dsh-skin-hover', theme.hover);
      setUiVariable('--dsh-skin-button-text', theme.buttonText);
      setUiVariable('--dsh-skin-header-fill', theme.headerFill);
      setUiVariable('--dsh-skin-header-ink', theme.headerInk);
      setUiVariable('--dsh-skin-header-muted', theme.headerMuted);
      setUiVariable('--dsh-skin-header-accent', theme.headerAccent);
    } else {
      if (writtenPanel !== null && html.style.getPropertyValue(PANEL_VALUE) === writtenPanel) {
        restoreStyleValue(html, PANEL_VALUE, originalPanelValue, writtenPanel);
      }
      writtenPanel = null;
      restoreOwnedAttr(UI_STYLE, originalUiStyle);
      restoreOwnedAttr(DECORATIONS, originalDecorations);
      restoreUiVariables();
    }
    writtenSurface = theme.wallpaperTint;
  }

  function releaseSurface() {
    releaseReadability();
    restoreOwnedAttr(SURFACE_ATTRIBUTE, originalSurfaceAttribute);
    /* Leave a value someone else wrote after us alone. */
    if (writtenSurface !== originalSurfaceValue && html.style.getPropertyValue(SURFACE_VALUE) === writtenSurface) {
      if (originalSurfaceValue === '') html.style.removeProperty(SURFACE_VALUE);
      else html.style.setProperty(SURFACE_VALUE, originalSurfaceValue);
    }
    if (writtenPanel !== originalPanelValue && html.style.getPropertyValue(PANEL_VALUE) === writtenPanel) {
      if (originalPanelValue === '') html.style.removeProperty(PANEL_VALUE);
      else html.style.setProperty(PANEL_VALUE, originalPanelValue);
    }
    writtenPanel = null;
    writtenSurface = null;
    restoreOwnedAttr(UI_STYLE, originalUiStyle);
    restoreOwnedAttr(DECORATIONS, originalDecorations);
    restoreUiVariables();
  }

  function clearSkin() {
    for (const [el, record] of owned) restore(el, record);
    owned.clear();
    restoreLegacyComposer();
    releaseSurface();
    layer.style.visibility = 'hidden';
    image.removeAttribute('src');
    character.removeAttribute('src');
  }

  async function render() {
    const current = ++generation;
    if (disposed) return;

    if (!preset) {
      clearSkin();
      return;
    }

    const settings = preset.settings || {};
    const dark = isDark(doc, media);
    const refined = settings.uiStyle !== 'basic';
    const theme = dark ? preset.dark : preset.light;
    const otherTheme = dark ? preset.light : preset.dark;
    const backgroundId = theme?.backgroundId || otherTheme?.backgroundId;
    const characterId = theme?.characterId || otherTheme?.characterId;
    if (!refined && !backgroundId && !characterId) {
      clearSkin();
      return;
    }
    const opacity = clamp(settings.panelOpacity ?? 0.6, 0, 1, 0.6);
    const palette = getUiTheme({...settings, panelOpacity: opacity}, dark);
    applySurface(palette, refined, settings.decorations !== false);
    applyReadability(palette, dark);
    syncSlots(refined ? activeSlots() : new Map());
    syncLegacyComposer(settings.accent, refined);

    const [background, person] = await Promise.all([assetUrl(backgroundId), assetUrl(characterId)]);
    if (disposed || current !== generation) return;

    layer.style.visibility = 'visible';
    if (background) image.src = background;
    else image.removeAttribute('src');
    const scale = clamp(settings.backgroundScale ?? 100, 100, 200, 100);
    const x = clamp(settings.backgroundX ?? 50, 0, 100, 50);
    const y = clamp(settings.backgroundY ?? 50, 0, 100, 50);
    image.style.objectPosition = `${x}% ${y}%`;
    image.style.transform = `scale(${scale / 100})`;
    image.style.transformOrigin = `${x}% ${y}%`;
    image.style.setProperty('--dsh-blur', `${clamp(settings.blur ?? 0, 0, 20, 0)}px`);
    layer.style.setProperty('--dsh-overlay', String(clamp(settings.overlay ?? 0.25, 0, 0.9, 0.25)));

    if (person) {
      character.src = person;
      character.style.display = 'block';
    } else {
      character.removeAttribute('src');
      character.style.display = 'none';
    }
    character.style.width = `${clamp(settings.characterSize ?? 35, 10, 60, 35)}vw`;
    character.style.opacity = String(clamp(settings.characterOpacity ?? 1, 0, 1, 1));
    character.style.left = settings.characterSide === 'left' ? '4%' : 'auto';
    character.style.right = settings.characterSide === 'right' ? '4%' : 'auto';
    character.style.transform = settings.characterMirror ? 'scaleX(-1)' : '';
  }

  function scheduleRender() {
    if (raf !== null || disposed) return;
    raf = win.requestAnimationFrame(() => {
      raf = null;
      void render();
    });
  }

  function apply(next) {
    externallyDriven = true;
    preset = next || null;
    void render();
  }

  media.addEventListener?.('change', scheduleRender);
  themeObserver = new MutationObserver(scheduleRender);
  themeObserver.observe(html, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  if (doc.body) {
    bodyThemeObserver = new MutationObserver(scheduleRender);
    bodyThemeObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  }
  hostObserver = new MutationObserver(records => {
    const selectorsList = Object.values(selectors || {}).filter(Boolean);
    const containsTarget = node => node.nodeType === 1 && (selectorsList.some(selector =>
      node.matches(selector) || node.querySelector(selector)) || node.matches('[data-chat-flow-key][data-chat-flow-kind]') || node.querySelector('[data-chat-flow-key][data-chat-flow-kind]'));
    if (records.some(record => {
      if (record.type === 'attributes' && record.attributeName === 'data-chat-flow-kind') return true;
      if (record.type === 'childList') {
        if (record.target?.closest?.('[data-slot="sidebar"]')) return true;
        return [...record.addedNodes, ...record.removedNodes].some(node => containsTarget(node) || (node.nodeType === 1 && owned.has(node)));
      }
      return false;
    })) scheduleRender();
  });
  hostObserver.observe(doc.body || html, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-chat-flow-kind'] });

  Promise.resolve(api.state()).then(profile => {
    if (!externallyDriven) apply(profile?.presets?.find(item => item.id === profile.activePresetId) || null);
  }).catch(() => {});

  return {
    apply,
    refresh: scheduleRender,
    getUiTheme: (settings, dark = false) => getUiTheme(settings, dark),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      if (raf !== null) win.cancelAnimationFrame(raf);
      hostObserver.disconnect();
      themeObserver.disconnect();
      bodyThemeObserver?.disconnect();
      media.removeEventListener?.('change', scheduleRender);
      for (const [el, record] of owned) restore(el, record);
      owned.clear();
      restoreLegacyComposer();
      releaseSurface();
      layer.remove();
      style.remove();
    },
  };
}

installRenderer.getUiTheme = getUiTheme;


const inject = ['slots'];

function activePreset(profile) {
  return profile?.presets?.find((preset) => preset.id === profile.activePresetId) || null;
}

function createSettingsSection(openPanel) {
  return function SkinSettingsSection() {
    const trigger = React.useRef(null);
    return React.createElement('section', {
      className: 'dsh-personal-skins-launcher',
      style: { maxWidth: 720, margin: '0 auto', padding: '28px 24px', color: 'var(--dsw-alias-label-primary, CanvasText)' },
    },
    React.createElement('h2', { style: { margin: '0 0 8px', fontSize: 22 } }, '我的皮肤'),
    React.createElement('p', { style: { margin: '0 0 20px', color: 'var(--dsw-alias-label-secondary, GrayText)' } }, '在独立的大面板中管理预设、调整预览和保存更改。'),
    React.createElement('button', {
      ref: trigger,
      type: 'button',
      onClick: () => openPanel(trigger.current),
      style: { border: 0, borderRadius: 10, padding: '10px 18px', color: '#fff', background: '#d88f9e', cursor: 'pointer', font: 'inherit' },
    }, '打开皮肤工作区'));
  };
}

function createPanelOverlay(api, getUiTheme, bindOpenPanel) {
  return function SkinPanelOverlay() {
    const [open, setOpen] = React.useState(false);
    const mount = React.useRef(null);
    const returnFocus = React.useRef(null);
    const wasOpen = React.useRef(false);
    const openPanel = React.useCallback((trigger) => {
      returnFocus.current = trigger;
      setOpen(true);
    }, []);

    React.useEffect(() => {
      bindOpenPanel(openPanel);
      return () => bindOpenPanel(null);
    }, [openPanel]);

    React.useEffect(() => {
      if (!open) {
        if (!wasOpen.current) return undefined;
        wasOpen.current = false;
        const trigger = returnFocus.current;
        returnFocus.current = null;
        if (!trigger) return undefined;
        const visibleEnabled = (element) => {
          if (!element?.isConnected || element.disabled || element.getAttribute?.('aria-hidden') === 'true') return false;
          if (element.closest?.('.dsh-skin-workspace-host')) return false;
          if (!element.getClientRects?.().length) return false;
          const style = document.defaultView?.getComputedStyle?.(element);
          return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
        };
        if (visibleEnabled(trigger)) {
          trigger.focus();
          return undefined;
        }
        const chatInput = [...document.querySelectorAll('textarea,[contenteditable="true"]')].find(visibleEnabled);
        const fallback = chatInput || [...document.querySelectorAll('button:enabled,input:enabled,select:enabled,a[href],[tabindex]:not([tabindex="-1"])')]
          .find((element) => visibleEnabled(element) && !(Number.isFinite(element.tabIndex) && element.tabIndex < 0));
        fallback?.focus();
        return undefined;
      }

      wasOpen.current = true;
      const cleanup = mountEditor(mount.current, {
        api,
        getUiTheme,
        standalone: true,
        onClose: () => setOpen(false),
      });
      const dialog = mount.current?.firstElementChild;
      const focusScope = () => dialog?.querySelector('[role="alertdialog"]') || dialog;
      const focusable = () => [...(focusScope()?.querySelectorAll('button:not(:disabled),input:not(:disabled):not([hidden]):not([tabindex="-1"]),select:not(:disabled),[tabindex]:not([tabindex="-1"])') || [])];
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cleanup.requestClose?.();
          return;
        }
        if (event.key !== 'Tab' || !dialog) return;
        const items = focusable();
        if (!items.length) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const scope = focusScope();
        if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      requestAnimationFrame(() => dialog?.querySelector('.dsh-skin-workspace-close')?.focus());
      return () => {
        document.removeEventListener('keydown', onKeyDown, true);
        cleanup();
      };
    }, [open, api]);

    return open ? React.createElement('div', { ref: mount, className: 'dsh-skin-workspace-host' }) : null;
  };
}

/** Client entry called by DSH's Cordis client loader. */
function apply(ctx) {
  let renderer;
  let openPanelHandler = null;
  let pendingPanelTrigger = null;
  const requestOpenPanel = (trigger) => {
    if (openPanelHandler) openPanelHandler(trigger);
    else pendingPanelTrigger = trigger;
  };
  const bindOpenPanel = (handler) => {
    openPanelHandler = handler;
    if (handler && pendingPanelTrigger) {
      const trigger = pendingPanelTrigger;
      pendingPanelTrigger = null;
      handler(trigger);
    }
  };
  const api = createClientApi({ onProfile: (profile) => renderer?.apply(activePreset(profile)) });
  renderer = installRenderer({ api });

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'personal-skins.editor',
    order: 90,
  }, createPanelOverlay(api, renderer.getUiTheme, bindOpenPanel)));

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'personal-skins',
    order: 90,
    label: '我的皮肤',
  }, createSettingsSection((trigger) => requestOpenPanel(trigger))));

  ctx.effect(() => () => {
    renderer?.dispose();
    api.dispose();
  }, 'dsh-personal-skins: renderer');
}

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
