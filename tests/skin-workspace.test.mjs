import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {mountEditor} from '../src/client/editor.js';
import {createClientApi} from '../src/client/api.js';

const toDataKey = (name) => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.style = {setProperty(name, value) { this[name] = value; }};
    this._html = '';
    this._text = '';
    this._files = [];
    this.clickCount = 0;
  }
  set className(value) { this.setAttribute('class', value); }
  get className() { return this.getAttribute('class') || ''; }
  get classList() {
    return {
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const items = new Set(this.className.split(/\s+/).filter(Boolean));
        const add = force === undefined ? !items.has(name) : Boolean(force);
        if (add) items.add(name); else items.delete(name);
        this.className = [...items].join(' ');
        return add;
      },
    };
  }
  get dataset() {
    const data = {};
    for (const [name, value] of this.attributes) if (name.startsWith('data-')) data[toDataKey(name)] = value;
    return data;
  }
  get id() { return this.getAttribute('id') || ''; }
  get type() { return this.getAttribute('type') || ''; }
  get value() { return this._value ?? this.getAttribute('value') ?? ''; }
  set value(value) { this._value = String(value); }
  get checked() { return this.attributes.has('checked'); }
  set checked(value) { if (value) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }
  get disabled() { return this.attributes.has('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get files() { return this._files; }
  set files(value) { this._files = value; }
  get parentNode() { return this.parentElement; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children.at(-1) || null; }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentElement?.isConnected); }
  get textContent() { return this._text || this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this._html = ''; this.clearChildren(); }
  set innerHTML(html) {
    this._html = String(html);
    this._text = '';
    this.clearChildren();
    const stack = [this];
    const tokens = this._html.match(/<[^>]+>|[^<]+/g) || [];
    for (const token of tokens) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1)._text += token; continue; }
      const tag = token.match(/^<([a-zA-Z][\w:-]*)/)?.[1];
      if (!tag) continue;
      const element = new FakeElement(tag, this.ownerDocument);
      const attrText = token.slice(tag.length + 1, token.length - 1);
      for (const match of attrText.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        const [, name, doubleValue, singleValue, bareValue] = match;
        if (name) element.setAttribute(name, doubleValue ?? singleValue ?? bareValue ?? '');
      }
      stack.at(-1).append(element);
      if (!voidTags.has(tag.toLowerCase()) && !token.endsWith('/>')) stack.push(element);
    }
  }
  get innerHTML() { return this._html; }
  clearChildren() { for (const child of this.children) child.parentElement = null; this.children = []; }
  append(...nodes) { for (const node of nodes) { node.remove?.(); node.parentElement = this; this.children.push(node); } }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'value') this._value = undefined; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  async dispatch(type) {
    const event = {type, target: this, currentTarget: null, cancelBubble: false, preventDefault() {}, stopPropagation() { this.cancelBubble = true; }};
    const pending = [];
    for (let node = this; node; node = node.parentElement) {
      event.currentTarget = node;
      for (const listener of node.listeners.get(type) || []) pending.push(listener(event));
      if (event.cancelBubble) break;
    }
    await Promise.all(pending);
  }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.clickCount++; void this.dispatch('click'); }
  contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
  matches(selector) {
    const groups = selector.split(',').map((value) => value.trim());
    return groups.some((group) => {
      const parts = group.split(/\s+/);
      let node = this;
      if (!node.matchesSimple(parts.at(-1))) return false;
      for (let index = parts.length - 2; index >= 0; index--) {
        node = node.parentElement;
        while (node && !node.matchesSimple(parts[index])) node = node.parentElement;
        if (!node) return false;
      }
      return true;
    });
  }
  matchesSimple(selector) {
    const exclusions = [...selector.matchAll(/:not\(([^()]*)\)/g)].map(([, excluded]) => excluded);
    selector = selector.replace(/:not\([^()]*\)/g, '');
    for (const excluded of exclusions) {
      if (excluded === ':disabled' && this.disabled) return false;
      if (excluded === '[hidden]' && this.hasAttribute('hidden')) return false;
      const tabindex = excluded.match(/^\[tabindex=["']?([^\]"']+)["']?\]$/);
      if (tabindex && this.getAttribute('tabindex') === tabindex[1]) return false;
    }
    const tag = selector.match(/^[a-zA-Z][\w-]*/)?.[0];
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
    for (const [, id] of selector.matchAll(/#([\w-]+)/g)) if (this.id !== id) return false;
    for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
      if (!this.hasAttribute(name)) return false;
      if (value !== undefined && this.getAttribute(name) !== value) return false;
    }
    return true;
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matchesSimple(selector)) return node; return null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => { for (const child of node.children) { if (child.matches(selector)) found.push(child); visit(child); } };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((candidate) => candidate !== listener)); }
}

function makeContainer(doc) {
  const container = new FakeElement('div', doc);
  doc.body.append(container);
  return container;
}

function preset() {
  return {
    id: 'one', name: '原始皮肤',
    light: {backgroundId: null, characterId: null},
    dark: {backgroundId: null, characterId: null},
    settings: {accent: '#D88F9E', backgroundX: 50, backgroundY: 50, backgroundScale: 100, blur: 0, overlay: .25, panelOpacity: .85, characterSide: 'right', characterSize: 35, characterOpacity: 1, characterMirror: false},
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('preset commands update the manager without another state request, and failures keep the current list', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  const original = preset();
  const copy = {...preset(), id: 'two', name: '复制的皮肤'};
  let profile = {presets: [original], activePresetId: null};
  let reads = 0;
  const commands = [];
  const published = [];
  let failCommand = false;
  const api = createClientApi({
    onProfile: next => published.push(next),
    fetch: async (url, options) => {
      if (url.endsWith('/state')) reads++;
      else {
        const command = JSON.parse(options.body);
        commands.push(command);
        if (failCommand) return Response.json({error: 'command failed'}, {status: 500});
        if (command.action === 'duplicate') profile = {...profile, presets: [original, copy]};
        else if (command.action === 'activate') profile = {...profile, activePresetId: command.id};
        else if (command.action === 'remove') profile = {...profile, presets: [original]};
      }
      return Response.json(profile);
    },
  });
  const dispose = mountEditor(container, {api, standalone: true});
  try {
    await flush();
    const root = container.firstElementChild;
    await root.querySelector('[data-action="duplicate"][data-id="one"]').dispatch('click');
    assert.equal(root.querySelectorAll('.dsh-card').length, 2);
    await root.querySelector('[data-action="apply"][data-id="two"]').dispatch('click');
    assert.equal(root.querySelectorAll('.dsh-card')[1].querySelector('.dsh-tag')?.textContent, '使用中');
    assert.equal(published.at(-1).activePresetId, 'two', 'the renderer subscriber still receives command results');
    await root.querySelector('[data-action="default"]').dispatch('click');
    assert.equal(root.querySelector('.dsh-tag'), null);
    assert.equal(published.at(-1).activePresetId, null);
    await root.querySelector('[data-action="delete"][data-id="two"]').dispatch('click');
    assert.equal(commands.length, 3, 'asking for confirmation does not send a command');
    await root.querySelector('[data-action="delete-confirm"][data-id="two"]').dispatch('click');
    assert.equal(root.querySelectorAll('.dsh-card').length, 1);
    assert.equal(root.querySelector('[data-action="delete-confirm"]'), null);
    assert.equal(reads, 1, 'only the initial state read is necessary');
    failCommand = true;
    await root.querySelector('[data-action="apply"][data-id="one"]').dispatch('click');
    assert.match(root.querySelector('.dsh-message').textContent, /应用失败：command failed/);
    assert.equal(root.querySelectorAll('.dsh-card').length, 1);
    assert.equal(root.querySelector('[data-action="apply"]').disabled, false);
    assert.equal(reads, 1);
  } finally { dispose(); api.dispose(); }
});

test('editor reloads state when a command adapter does not return a profile', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  let activePresetId = null;
  let reads = 0;
  const dispose = mountEditor(container, {
    standalone: true,
    api: {
      state: async () => { reads++; return {presets: [preset()], activePresetId}; },
      assetUrl: async () => '',
      activate: async id => { activePresetId = id; },
    },
  });
  try {
    await flush();
    const root = container.firstElementChild;
    await root.querySelector('[data-action="apply"]').dispatch('click');
    assert.equal(reads, 2);
    assert.equal(root.querySelector('.dsh-card .dsh-tag')?.textContent, '使用中');
    assert.equal(root.querySelector('[data-action="apply"]').disabled, false);
  } finally { dispose(); }
});

function imageFile(name, type, signature) {
  const bytes = Uint8Array.from(signature);
  return {name, type, size: bytes.length, slice: () => ({arrayBuffer: async () => bytes.buffer.slice(0)})};
}

test('basic editor preserves its stored refined-only controls while preview controls follow mode and available assets', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  const profile = preset();
  profile.light.backgroundId = 'saved-background';
  profile.settings.uiStyle = 'basic';
  profile.settings.panelOpacity = .5;
  profile.settings.decorations = true;
  let savedSettings;
  const dispose = mountEditor(container, {
    api: {state: async () => ({presets: [profile], activePresetId: null}), assetUrl: async id => `blob:${id}`, onState: () => () => {}, update: async (_id, next) => {savedSettings=next.settings;return {presets: [next], activePresetId: null};}},
    standalone: true,
    getUiTheme: settings => ({button: settings.accent, buttonText: '#fff', accent: settings.accent, brand: settings.accent, composerFill: settings.accent, toolbar: settings.accent, selected: settings.accent, wallpaperTint: `rgba(255,255,255,${settings.panelOpacity})`, line: settings.accent, headerFill: settings.accent, headerInk: settings.accent, headerMuted: settings.accent, headerAccent: settings.accent}),
  });
  await flush();
  let root = container.firstElementChild;
  assert.equal(root.querySelector('[data-action="rename"]'), null, 'name changes remain in the editor form');
  await root.querySelector('[data-action="edit"]').dispatch('click');
  root = container.firstElementChild;
  const lightPreview = root.querySelector('.dsh-preview');
  assert.equal(lightPreview.style['--sk-ink'], '#29272a', 'light basic preview uses light native ink regardless of the host theme');
  assert.equal(lightPreview.style['--sk-muted'], '#716c73');
  assert.equal(root.style['--sk-accent'], '#D88F9E', 'editor controls retain their own accent color');
  await root.querySelector('[data-mode="dark"]').dispatch('click');
  root = container.firstElementChild;
  assert.ok(root.querySelector('[data-setting="name"]'));
  assert.ok(root.querySelector('[data-setting="overlay"]'));
  assert.ok(root.querySelector('[data-setting="backgroundX"]'), 'light background settings remain available in dark mode via fallback');
  assert.equal(root.querySelector('[data-setting="accent"]'), null);
  assert.equal(root.querySelector('[data-setting="panelOpacity"]'), null);
  assert.equal(root.querySelector('[data-setting="decorations"]'), null);
  assert.equal(root.querySelector('[data-setting="characterSide"]'), null, 'character controls are absent without an effective portrait');
  const preview = root.querySelector('.dsh-preview');
  assert.equal(preview.getAttribute('data-dark'), 'true');
  assert.equal(preview.style['--sk-ink'], '#f5f2f3');
  assert.equal(preview.style['--sk-fill'], '#1c1c20');
  assert.equal(preview.style['--sk-brand'], '#4b91d1', 'basic preview ignores stored theme accent');
  assert.equal(preview.style['--sk-wallpaper-tint'], 'rgba(28,28,32,0)');
  assert.equal(preview.style['--sk-header-accent'], '#4b91d1');
  assert.equal(preview.style['--sk-header-fill'], '#1c1c20');
  assert.equal(root.querySelector('.dsh-preview-panel'), null, 'basic preview has no oversized center panel');
  assert.ok(root.querySelector('.dsh-preview-header'), 'basic preview retains a neutral native header silhouette');
  assert.ok(root.querySelector('.dsh-preview-sidebar'), 'the native sidebar silhouette remains visible in basic preview');
  assert.ok(root.querySelector('.dsh-preview-compose'), 'the native composer silhouette remains visible in basic preview');

  const modeSelect = root.querySelector('[data-setting="uiStyle"]');
  modeSelect.value = 'refined';
  await modeSelect.dispatch('change');
  root = container.firstElementChild;
  assert.equal(doc.activeElement.id, 'setting-uiStyle-dark', 'the style selector retains focus after its controls rerender');
  assert.ok(root.querySelector('[data-setting="accent"]'));
  assert.ok(root.querySelector('[data-setting="decorations"]'));
  assert.equal(root.querySelector('.dsh-preview-label').style.color, '#D88F9E');
  const opacity = root.querySelector('[data-setting="panelOpacity"]');
  assert.equal(opacity.getAttribute('min'), '0.82');
  assert.equal(opacity.value, '0.82');
  assert.equal(profile.settings.panelOpacity, .5, 'legacy values are displayed at the effective minimum without rewriting saved data');
  await root.querySelector('[data-action="save"]').dispatch('click');
  assert.equal(savedSettings.panelOpacity, .5, 'switching styles leaves the stored legacy opacity unchanged on save');
  dispose();
});

test('image cards use keyboard-accessible chooser buttons and reject a confirmed MIME/signature mismatch', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  const profile = preset();
  profile.light.backgroundId = 'saved-background';
  profile.dark.characterId = 'saved-character';
  let uploadCalls = 0;
  const dispose = mountEditor(container, {
    api: {
      state: async () => ({presets: [profile], activePresetId: null}),
      assetUrl: async (id) => `blob:${id}`,
      onState: () => () => {},
      upload: async () => { uploadCalls++; return {id: 'unused'}; },
    },
    standalone: true,
    getUiTheme: () => ({button: '#25364a', buttonText: '#fff'}),
  });
  await flush();
  let root = container.firstElementChild;
  await root.querySelector('[data-action="edit"]').dispatch('click');
  root = container.firstElementChild;
  await flush();
  assert.match(root.innerHTML, /支持 PNG、JPG、WebP，单张不超过 10 MiB/);
  assert.doesNotMatch(root.innerHTML, /Choose File|No file chosen/);
  const backgroundInput = root.querySelector('#upload-background-light');
  assert.equal(backgroundInput.hasAttribute('hidden'), true);
  assert.equal(backgroundInput.getAttribute('tabindex'), '-1');
  assert.equal(root.querySelector('[data-action="clear"][data-kind="background"]').textContent, '移除图片');
  assert.equal(root.querySelector('.dsh-upload-thumb img').src, 'blob:saved-background', 'an existing image is shown as the thumbnail');
  assert.equal(root.querySelector('[data-action="clear"][data-kind="character"]'), null);
  const chooseBackground = root.querySelector('[data-action="choose-upload"][data-kind="background"]');
  assert.equal(chooseBackground.getAttribute('type'), 'button');
  assert.equal(chooseBackground.textContent, '选择背景图片');
  await chooseBackground.dispatch('click');
  assert.equal(backgroundInput.clickCount, 1, 'the button opens the matching system file chooser');
  assert.equal(uploadCalls, 0, 'cancelling the chooser does not change the draft or upload');

  backgroundInput.files = [imageFile('wrong.png', 'image/png', [0xff, 0xd8, 0xff, 0xe0])];
  await backgroundInput.dispatch('change');
  root = container.firstElementChild;
  assert.match(root.querySelector('[data-upload-state="background"]').textContent, /文件后缀为 PNG，但实际内容是 JPEG，请改为 \.jpg 后重试。/);
  assert.equal(uploadCalls, 0, 'a confirmed MIME/signature mismatch is rejected before upload');
  assert.equal(doc.activeElement.dataset.kind, 'background', 'focus returns to the background chooser after validation fails');
  await flush();
  assert.equal(root.querySelector('.dsh-upload-thumb img').src, 'blob:saved-background', 'a failed replacement keeps the saved thumbnail');
  assert.equal(root.querySelector('[data-action="clear"][data-kind="background"]').disabled, false);
  assert.equal(backgroundInput.value, '', 'the input is cleared so the same file can be selected again');
  assert.equal(profile.light.backgroundId, 'saved-background', 'failed selection leaves saved preset data untouched');
  dispose();
});

test('image upload progress, thumbnails, and removal stay isolated by mode', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  const profile = preset();
  profile.light.backgroundId = 'saved-background';
  profile.dark.characterId = 'saved-character';
  let resolveUpload;
  let uploadedFile = null;
  let failNextUpload = false;
  const previousImage = globalThis.Image;
  const previousCreateObjectURL = URL.createObjectURL;
  const previousRevokeObjectURL = URL.revokeObjectURL;
  const revoked = [];
  URL.createObjectURL = () => 'blob:pending-image';
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class {
    naturalWidth = 64;
    naturalHeight = 48;
    onload = null;
    onerror = null;
    set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
    get src() { return this._src; }
  };
  try {
    const dispose = mountEditor(container, {
      api: {
        state: async () => ({presets: [profile], activePresetId: null}),
        assetUrl: async (id) => `blob:${id}`,
        onState: () => () => {},
        upload: (file) => {
          if (failNextUpload) { failNextUpload = false; throw new Error('Unsupported image content type or signature'); }
          uploadedFile = file;
          return new Promise((resolve) => { resolveUpload = resolve; });
        },
      },
      standalone: true,
      getUiTheme: () => ({button: '#25364a', buttonText: '#fff'}),
    });
    await flush();
    let root = container.firstElementChild;
    await root.querySelector('[data-action="edit"]').dispatch('click');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-upload-state="background"]').textContent, '已设置背景图片');
    await root.querySelector('[data-mode="dark"]').dispatch('click');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '已设置立绘图片');
    assert.equal(root.querySelector('[data-upload-card="character"] h4').textContent, '透明立绘');
    assert.equal(root.querySelector('[data-action="choose-upload"][data-kind="character"]').textContent, '选择立绘图片');
    assert.doesNotMatch(root.querySelector('.dsh-upload-limit').textContent, /透明|背景透明/);
    const input = root.querySelector('#upload-character-dark');
    const file = imageFile('立绘.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10]);
    input.files = [file];
    const pending = input.dispatch('change');
    await flush();
    await flush();
    root = container.firstElementChild;
    assert.equal(uploadedFile, file, 'the original File passes through the existing upload method');
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '正在上传：立绘.png');
    assert.equal(root.querySelector('[data-action="choose-upload"][data-kind="character"]').disabled, true, 'uploads cannot be started twice');
    assert.equal(root.querySelector('.dsh-upload-thumb img').src, 'blob:pending-image');
    resolveUpload({id: 'new-character'});
    await pending;
    await flush();
    root = container.firstElementChild;
    assert.match(root.querySelector('[data-upload-state="character"]').textContent, /立绘\.png：上传完成，保存皮肤后生效/);
    assert.equal(root.querySelector('[data-action="clear"][data-kind="character"]').textContent, '移除图片');
    assert.equal(doc.activeElement.dataset.action, 'choose-upload', 'focus returns to the chooser after upload');
    assert.equal(doc.activeElement.dataset.mode, 'dark');
    assert.ok(revoked.includes('blob:pending-image'), 'temporary object URLs are revoked after upload');
    assert.equal(profile.dark.characterId, 'saved-character', 'the selected filename and uploaded id do not mutate the saved preset');

    failNextUpload = true;
    const failedInput = root.querySelector('#upload-character-dark');
    failedInput.files = [imageFile('bad-response.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10])];
    await failedInput.dispatch('change');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '上传未成功，请检查图片格式或网络后重试。');
    assert.doesNotMatch(root.querySelector('[data-upload-state="character"]').textContent, /Unsupported|signature/);
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:new-character', 'a failed server replacement restores the previous draft thumbnail');
    assert.equal(root.querySelector('[data-action="clear"][data-kind="character"]').textContent, '移除图片', 'the previous draft asset id remains set after server failure');
    assert.equal(doc.activeElement.dataset.action, 'choose-upload', 'focus returns to the same chooser after server failure');
    assert.equal(doc.activeElement.dataset.mode, 'dark');

    await root.querySelector('[data-mode="light"]').dispatch('click');
    root = container.firstElementChild;
    assert.match(root.querySelector('[data-upload-state="background"]').textContent, /已设置背景图片/);
    await root.querySelector('[data-action="clear"][data-kind="background"]').dispatch('click');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-action="clear"][data-kind="background"]'), null);
    assert.equal(root.querySelector('[data-upload-state="background"]').textContent, '尚未选择背景图片');
    assert.equal(root.querySelector('[data-action="clear"][data-kind="character"]'), null, 'the other mode is not accidentally changed');
    assert.equal(doc.activeElement.dataset.action, 'choose-upload', 'focus returns to the chooser after image removal');
    assert.equal(doc.activeElement.dataset.mode, 'light');
    dispose();
  } finally {
    globalThis.Image = previousImage;
    URL.createObjectURL = previousCreateObjectURL;
    URL.revokeObjectURL = previousRevokeObjectURL;
  }
});

test('standalone skin workspace keeps its close control when initial state loading fails', async () => {
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    const doc = new FakeDocument();
    const container = makeContainer(doc);
    let closeCount = 0;
    let calls = 0, resolveRetry;
    const dispose = mountEditor(container, {
      standalone: true,
      onClose: () => { closeCount++; },
      api: {state: async () => { if (++calls === 1) throw new Error('offline'); return new Promise((resolve) => { resolveRetry = resolve; }); }, assetUrl: async () => '', onState: () => () => {}},
    });
    await flush();
    const root = container.firstElementChild;
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.ok(root.querySelector('[data-action="workspace-close"]'));
    assert.match(root.querySelector('.dsh-load-state').textContent, /读取皮肤失败/);
    const retryPromise = root.querySelector('[data-action="retry"]').dispatch('click');
    await flush();
    assert.equal(root.querySelector('[data-action="workspace-close"]').disabled, false, 'read-only retry does not block closing');
    await root.querySelector('[data-action="workspace-close"]').dispatch('click');
    assert.equal(closeCount, 1);
    dispose();
    resolveRetry({presets: [], activePresetId: null});
    await retryPromise;
  } finally { globalThis.requestAnimationFrame = previousFrame; }
});

test('dirty draft confirmation traps close, and a failed save retains the editable draft', async () => {
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    const doc = new FakeDocument();
    const container = makeContainer(doc);
    let closeCount = 0;
    let rejectUpdate;
    const api = {
      state: async () => ({presets: [preset()], activePresetId: null}),
      assetUrl: async () => '',
      onState: () => () => {},
      update: () => new Promise((_, reject) => { rejectUpdate = reject; }),
    };
    const dispose = mountEditor(container, {api, standalone: true, onClose: () => { closeCount++; }});
    await flush();
    let root = container.firstElementChild;
    await root.querySelector('[data-action="edit"]').dispatch('click');
    let name = root.querySelector('.dsh-name');
    name.focus();
    name.value = '尚未保存';
    await name.dispatch('input');
    const close = root.querySelector('[data-action="workspace-close"]');
    close.focus();
    await close.dispatch('click');
    assert.ok(root.querySelector('[role="alertdialog"]'));
    assert.equal(doc.activeElement.classList.contains('dsh-skin-discard-continue'), true);
    await root.querySelector('[data-action="continue-editing"]').dispatch('click');
    assert.equal(doc.activeElement.dataset.action, 'workspace-close');
    name = root.querySelector('.dsh-name');
    assert.equal(name.value, '尚未保存');

    const savePromise = root.querySelector('[data-action="save"]').dispatch('click');
    await flush();
    assert.equal(root.querySelector('[data-action="workspace-close"]').disabled, true);
    assert.equal(dispose.requestClose(), false, 'busy editor refuses the close request');
    rejectUpdate(new Error('offline'));
    await savePromise;
    root = container.firstElementChild;
    assert.equal(root.querySelector('.dsh-name').value, '尚未保存');
    assert.match(root.querySelector('.dsh-notice').textContent, /保存失败：offline/);
    assert.equal(root.querySelector('.dsh-name').disabled, false);
    assert.equal(root.querySelector('[data-action="workspace-close"]').disabled, false);
    assert.equal(closeCount, 0);

    await root.querySelector('[data-action="workspace-close"]').dispatch('click');
    assert.ok(root.querySelector('[role="alertdialog"]'));
    await root.querySelector('[data-action="discard-changes"]').dispatch('click');
    assert.equal(closeCount, 1);
    dispose();
  } finally { globalThis.requestAnimationFrame = previousFrame; }
});

test('settings launcher waits for a late shell.overlay declaration and mounts one editor instance', async () => {
  const source = (await readFile(new URL('../src/client/index.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '')
    .replace('export const inject =', 'const inject =')
    .replace('export function apply(', 'function apply(');
  let activeRunner = null;
  const React = {
    createElement: (type, props, ...children) => ({type, props: props || {}, children}),
    useState(initial) { return activeRunner.useState(initial); },
    useRef(initial) { return activeRunner.useRef(initial); },
    useCallback(callback, deps) { return activeRunner.useCallback(callback, deps); },
    useEffect(callback, deps) { return activeRunner.useEffect(callback, deps); },
  };
  class HookRunner {
    constructor(component) { this.component = component; this.hooks = []; this.index = 0; this.output = null; this.rendering = false; this.dirty = false; }
    useState(initial) {
      const index = this.index++;
      if (!this.hooks[index]) this.hooks[index] = {value: initial};
      return [this.hooks[index].value, (value) => { this.hooks[index].value = typeof value === 'function' ? value(this.hooks[index].value) : value; this.dirty = true; if (!this.rendering) this.render(); }];
    }
    useRef(initial) { const index = this.index++; if (!this.hooks[index]) this.hooks[index] = {value: {current: initial}}; return this.hooks[index].value; }
    useCallback(callback, deps) { const index = this.index++; const previous = this.hooks[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) this.hooks[index] = {value: callback, deps}; return this.hooks[index].value; }
    useEffect(callback, deps = []) {
      const index = this.index++;
      const previous = this.hooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        this.hooks[index] = {deps, cleanup: previous?.cleanup, pending: callback};
      }
    }
    attach(node) {
      if (!node || typeof node !== 'object') return;
      if (node.props?.ref) {
        const value = node.props.className === 'dsh-skin-workspace-host'
          ? {ownerDocument: fakeDocument, firstElementChild: null}
          : {dataset: {}, isConnected: true, disabled: false, tabIndex: 0, getClientRects: () => [{}], getAttribute: () => null, closest: () => null, focus() { fakeDocument.activeElement = this; }};
        node.props.ref.current = value;
      }
      node.children?.forEach((child) => this.attach(child));
    }
    render() {
      if (this.rendering) return this.output;
      this.rendering = true;
      let repeat = true;
      while (repeat) {
        this.index = 0;
        activeRunner = this;
        this.output = this.component();
        activeRunner = null;
        this.attach(this.output);
        for (const hook of this.hooks) if (hook?.pending) {
          const callback = hook.pending;
          hook.pending = null;
          hook.cleanup?.();
          hook.cleanup = callback();
        }
        repeat = this.dirty;
        this.dirty = false;
      }
      this.rendering = false;
      return this.output;
    }
  }
  const registrations = [];
  const delayed = new Map();
  let editorMounts = 0, activeEditors = 0, closeRequests = 0;
  let currentCleanup = null;
  let confirmationButtons = [];
  let chooserTabButton = null, dialogCloseButton = null;
  const fakeDocument = {
    activeElement: null,
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    removeEventListener(type) { this.listeners.delete(type); },
    querySelectorAll(selector) {
      if (selector === 'textarea,[contenteditable="true"]') return [hiddenChatInput, workspaceChatInput, chatInput];
      return [fallbackButton];
    },
  };
  const fallbackElement = ({visible = true, inWorkspace = false} = {}) => ({
    isConnected: true,
    disabled: false,
    tabIndex: 0,
    getClientRects: () => visible ? [{}] : [],
    getAttribute: () => null,
    closest: (selector) => selector === '.dsh-skin-workspace-host' && inWorkspace ? {} : null,
    focus() { fakeDocument.activeElement = this; },
  });
  const hiddenChatInput = fallbackElement({visible: false});
  const workspaceChatInput = fallbackElement({inWorkspace: true});
  const chatInput = fallbackElement();
  const fallbackButton = fallbackElement();
  const previousDocument = globalThis.document;
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.document = fakeDocument;
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    const mountEditorStub = (container, options) => {
      editorMounts++;
      activeEditors++;
      const closeButton = new FakeElement('button', fakeDocument);
      closeButton.className = 'dsh-skin-workspace-close';
      const chooseButton = new FakeElement('button', fakeDocument);
      chooserTabButton = chooseButton;
      dialogCloseButton = closeButton;
      const hiddenFileInput = new FakeElement('input', fakeDocument);
      hiddenFileInput.setAttribute('type', 'file');
      hiddenFileInput.setAttribute('hidden', '');
      hiddenFileInput.setAttribute('tabindex', '-1');
      const continueButton = {focus() { fakeDocument.activeElement = this; }};
      const discardButton = {focus() { fakeDocument.activeElement = this; }};
      confirmationButtons = [continueButton, discardButton];
      let confirming = false;
      const confirmScope = {
        querySelectorAll: () => [continueButton, discardButton],
        contains: (node) => node === continueButton || node === discardButton,
      };
      const dialog = new FakeElement('section', fakeDocument);
      dialog.append(closeButton, chooseButton, hiddenFileInput);
      dialog.querySelector = (selector) => selector === '.dsh-skin-workspace-close' ? closeButton : selector === '[role="alertdialog"]' && confirming ? confirmScope : null;
      container.firstElementChild = dialog;
      const cleanup = () => { activeEditors--; };
      cleanup.requestClose = () => {
        if (++closeRequests === 2) confirming = true;
        else options.onClose();
      };
      currentCleanup = cleanup;
      return cleanup;
    };
    const deps = {
      React,
      createClientApi: () => ({dispose() {}}),
      installRenderer: () => ({apply() {}, dispose() {}}),
      mountEditor: mountEditorStub,
    };
    const module = new Function(...Object.keys(deps), `${source}\nreturn {apply, inject};`)(...Object.values(deps));
    const ctx = {
      slots: {
        inject(name, callback) { delayed.set(name, callback); },
        register(definition, component) { registrations.push({definition, component}); return () => {}; },
      },
      effect() {},
    };
    module.apply(ctx);
    assert.ok(delayed.has('shell.overlay'));
    assert.ok(delayed.has('settings.section'));
    assert.equal(registrations.length, 0, 'entries have not registered before their slot owners declare them');

    delayed.get('settings.section')();
    const settings = registrations.find(({definition}) => definition.name === 'settings.section');
    const settingsRunner = new HookRunner(settings.component);
    const section = settingsRunner.render();
    const launcher = section.children.find((child) => child?.type === 'button');
    launcher.props.onClick();
    assert.equal(editorMounts, 0, 'open request waits while shell.overlay is not declared');

    delayed.get('shell.overlay')();
    const overlay = registrations.find(({definition}) => definition.name === 'shell.overlay');
    assert.equal(overlay.definition.id, 'personal-skins.editor');
    const overlayRunner = new HookRunner(overlay.component);
    overlayRunner.render();
    assert.equal(activeEditors, 1, 'the late overlay declaration consumes the pending open request');
    overlayRunner.render();
    assert.equal(editorMounts, 1, 'rerenders retain one editor instance');
    let chooserTabPrevented = false;
    fakeDocument.activeElement = chooserTabButton;
    fakeDocument.listeners.get('keydown')({key: 'Tab', shiftKey: false, preventDefault() { chooserTabPrevented = true; }, stopPropagation() {}});
    assert.equal(chooserTabPrevented, true, 'the visible chooser is the last tab stop when the following file input is hidden');
    assert.equal(fakeDocument.activeElement, dialogCloseButton, 'Tab wraps past the hidden file input to the first visible control');
    fakeDocument.listeners.get('keydown')({key: 'Escape', preventDefault() {}, stopPropagation() {}});
    assert.equal(activeEditors, 0, 'Escape closes and cleans up the single editor');
    assert.equal(fakeDocument.activeElement, launcher.props.ref.current, 'closing restores focus to the launcher');
    launcher.props.onClick();
    assert.equal(activeEditors, 1, 'a later open creates one fresh mounted editor');
    currentCleanup.requestClose();
    const keydown = fakeDocument.listeners.get('keydown');
    let prevented = false;
    fakeDocument.activeElement = confirmationButtons[0];
    keydown({key: 'Tab', shiftKey: true, preventDefault() { prevented = true; }, stopPropagation() {}});
    assert.equal(prevented, true);
    assert.equal(fakeDocument.activeElement, confirmationButtons[1], 'Shift+Tab wraps to the last control in the confirmation scope');
    prevented = false;
    keydown({key: 'Tab', shiftKey: false, preventDefault() { prevented = true; }, stopPropagation() {}});
    assert.equal(prevented, true);
    assert.equal(fakeDocument.activeElement, confirmationButtons[0], 'Tab wraps to the first control in the confirmation scope');
    currentCleanup.requestClose();
    assert.equal(activeEditors, 0);
    launcher.props.onClick();
    assert.equal(activeEditors, 1);
    launcher.props.ref.current.isConnected = false;
    currentCleanup.requestClose();
    assert.equal(activeEditors, 0);
    assert.equal(fakeDocument.activeElement, chatInput, 'a removed launcher falls back to a visible chat input outside the workspace');
  } finally {
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousFrame;
  }
});
