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
  get src() { return this.getAttribute('src') ?? undefined; }
  set src(value) { this.setAttribute('src', value); }
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
  get isConnected() { return this === this.ownerDocument.documentElement || this === this.ownerDocument.body || Boolean(this.parentElement?.isConnected); }
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

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; }
  observe(target, options) { this.targets.push({target, options}); }
  disconnect() { this.disconnected = true; }
  trigger(records) { if (!this.disconnected) this.callback(records); }
}

class FakeDocument {
  constructor({dark = false} = {}) {
    this.activeElement = null;
    this.listeners = new Map();
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.append(this.head, this.body);
    this.observers = [];
    this.mediaListeners = new Set();
    this.media = {
      matches: dark,
      addEventListener: (type, listener) => { if (type === 'change') this.mediaListeners.add(listener); },
      removeEventListener: (type, listener) => { if (type === 'change') this.mediaListeners.delete(listener); },
    };
    this.defaultView = {matchMedia: () => this.media};
    const doc = this;
    this.defaultView.MutationObserver = class extends FakeMutationObserver {
      constructor(callback) { super(callback); doc.observers.push(this); }
    };
    if (dark) this.setInitialTheme(true);
    else this.setInitialTheme(false);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter((candidate) => candidate !== listener)); }
  setInitialTheme(dark) {
    this.documentElement.className = dark ? 'dark' : 'light';
    this.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.media.matches = dark;
    if (dark) this.body.setAttribute('data-ds-dark-theme', '');
  }
  setTheme(dark, via = 'mutation') {
    if (via === 'media') {
      this.documentElement.removeAttribute('data-theme');
      this.documentElement.className = '';
      this.documentElement.style.colorScheme = '';
      this.body.removeAttribute('data-ds-dark-theme');
      this.media.matches = dark;
      for (const listener of this.mediaListeners) listener({matches: dark});
      return;
    }
    this.documentElement.className = dark ? 'dark' : 'light';
    this.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (dark) this.body.setAttribute('data-ds-dark-theme', '');
    else this.body.removeAttribute('data-ds-dark-theme');
    const records = [
      {type: 'attributes', target: this.documentElement, attributeName: 'class'},
      {type: 'attributes', target: this.documentElement, attributeName: 'data-theme'},
      {type: 'attributes', target: this.documentElement, attributeName: 'style'},
      {type: 'attributes', target: this.body, attributeName: 'data-ds-dark-theme'},
    ];
    for (const observer of this.observers) observer.trigger(records);
  }
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
  const file = new Blob([Uint8Array.from(signature)], {type});
  Object.defineProperty(file, 'name', {value: name});
  return file;
}

test('basic editor follows host theme changes without rerendering or dirtying the draft', async () => {
  const doc = new FakeDocument({dark: true});
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
    getUiTheme: (settings, dark) => ({button: settings.accent, buttonText: '#fff', accent: settings.accent, brand: settings.accent, composerFill: dark ? '#1c1c20' : settings.accent, toolbar: settings.accent, selected: settings.accent, wallpaperTint: dark ? 'rgba(28,28,32,0)' : `rgba(255,255,255,${settings.panelOpacity})`, line: settings.accent, ink: dark ? '#f5f2f3' : '#29272a', muted: dark ? '#b9b4bc' : '#535058', pageContent: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.92)', pageSidebar: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.90)', pageHeader: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.94)', pageMuted: '#535058', headerFill: dark ? '#1c1c20' : '#ffffff', headerInk: dark ? '#f5f2f3' : '#29272a', headerMuted: dark ? '#ded9df' : '#535058', headerAccent: dark ? '#4b91d1' : '#4b91d1'}),
  });
  await flush();
  let root = container.firstElementChild;
  assert.equal(root.querySelector('[data-action="rename"]'), null, 'name changes remain in the editor form');
  await root.querySelector('[data-action="edit"]').dispatch('click');
  root = container.firstElementChild;
  const preview = root.querySelector('.dsh-preview');
  assert.equal(preview.getAttribute('data-dark'), 'true', 'an editor opened under the host dark theme starts with a dark preview');
  assert.equal(preview.style['--sk-ink'], '#f5f2f3');
  assert.equal(preview.style['--sk-fill'], '#1c1c20');
  assert.equal(root.style['--sk-accent'], '#D88F9E', 'editor controls retain their own accent color');

  const nameInput = root.querySelector('[data-setting="name"]');
  const uiStyle = root.querySelector('[data-setting="uiStyle"]');
  assert.equal(uiStyle.id, 'setting-uiStyle', 'settings IDs no longer include a theme suffix');
  assert.equal(root.querySelector('[data-setting="backgroundX"]').id, 'setting-backgroundX');
  assert.equal(root.querySelector('[data-setting="decorations"]'), null, 'basic style controls remain hidden for legacy basic presets');
  doc.setTheme(false);
  await flush();
  assert.equal(preview.getAttribute('data-dark'), 'false', 'an html class/theme mutation changes the preview to light');
  assert.equal(preview.style['--sk-ink'], '#29272a');
  assert.equal(preview.style['--sk-fill'], 'rgba(255,255,255,0.92)');
  doc.setTheme(true, 'media');
  await flush();
  assert.equal(preview.getAttribute('data-dark'), 'true', 'a prefers-color-scheme change changes the preview back to dark');
  assert.equal(preview.style['--sk-ink'], '#f5f2f3');
  assert.equal(root.querySelector('[data-setting="name"]'), nameInput, 'theme changes do not rerender controls');
  assert.equal(root.querySelector('[data-setting="uiStyle"]'), uiStyle);
  assert.doesNotMatch(root.innerHTML, /setting-[\w]+-(?:light|dark)/, 'settings IDs remain stable across host theme changes');
  assert.doesNotMatch(root.innerHTML, /data-mode=/, 'the editor no longer renders a manual theme switch');
  assert.equal(profile.light.backgroundId, 'saved-background');
  assert.equal(profile.dark.backgroundId, null, 'following theme changes does not normalize or dirty the saved draft');

  assert.ok(root.querySelector('[data-setting="name"]'));
  assert.ok(root.querySelector('[data-setting="overlay"]'));
  assert.ok(root.querySelector('[data-setting="backgroundX"]'), 'light background settings remain available in dark mode via fallback');
  assert.equal(root.querySelector('[data-setting="accent"]'), null);
  assert.equal(root.querySelector('[data-setting="panelOpacity"]'), null);
  assert.equal(root.querySelector('[data-setting="decorations"]'), null);
  assert.equal(root.querySelector('[data-setting="characterSide"]'), null, 'character controls are absent without an effective portrait');
  assert.equal(preview.style['--sk-brand'], '#4b91d1', 'basic preview ignores stored theme accent');
  assert.equal(preview.style['--sk-wallpaper-tint'], 'rgba(28,28,32,0)');
  assert.equal(preview.style['--sk-header-accent'], '#4b91d1');
  assert.equal(preview.style['--sk-header-fill'], '#1c1c20');
  assert.equal(root.querySelector('.dsh-preview-panel'), null, 'basic preview has no oversized center panel');
  assert.ok(root.querySelector('.dsh-preview-header'), 'basic preview retains a neutral native header silhouette');
  assert.ok(root.querySelector('.dsh-preview-sidebar'), 'the native sidebar silhouette remains visible in basic preview');
  assert.ok(root.querySelector('.dsh-preview-compose'), 'the native composer silhouette remains visible in basic preview');

  uiStyle.value = 'refined';
  await uiStyle.dispatch('change');
  root = container.firstElementChild;
  assert.equal(doc.activeElement.id, 'setting-uiStyle', 'the style selector retains focus after its controls rerender');
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
  assert.equal(doc.mediaListeners.size, 0, 'disposing the editor removes the media query listener');
  assert.ok(doc.observers.every(observer => observer.disconnected), 'disposing the editor disconnects its host theme observers');
});

test('host theme changes update preview palette before a pending background lookup resolves', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  const profile = preset();
  profile.light.backgroundId = 'slow-background';
  let resolveAsset;
  const pendingAsset = new Promise(resolve => { resolveAsset = resolve; });
  const dispose = mountEditor(container, {
    api: {
      state: async () => ({presets: [profile], activePresetId: null}),
      assetUrl: async () => pendingAsset,
    },
    standalone: true,
    getUiTheme: (_settings, dark) => ({
      button: '#25364a', buttonText: '#fff', accent: '#D88F9E', brand: '#D88F9E',
      composerFill: dark ? '#29272e' : '#f8f5f6', toolbar: '#ece8eb', selected: '#e2dce8',
      wallpaperTint: dark ? 'rgba(28,28,32,0.12)' : 'rgba(255,255,255,0.12)',
      line: '#d8cbd1', ink: dark ? '#f5f2f3' : '#29272a', muted: dark ? '#b9b4bc' : '#535058',
      pageContent: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.92)',
      pageSidebar: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.90)',
      pageHeader: dark ? 'rgba(20,18,24,0.88)' : 'rgba(255,255,255,0.94)', pageMuted: '#535058',
      headerFill: dark ? '#1c1c20' : '#ffffff', headerInk: dark ? '#f5f2f3' : '#29272a',
      headerMuted: dark ? '#ded9df' : '#535058', headerAccent: '#4b91d1',
    }),
  });
  try {
    await flush();
    let root = container.firstElementChild;
    await root.querySelector('[data-action="edit"]').dispatch('click');
    root = container.firstElementChild;
    const preview = root.querySelector('.dsh-preview');
    assert.equal(preview.getAttribute('data-dark'), 'false');
    doc.setTheme(true);
    assert.equal(preview.getAttribute('data-dark'), 'true', 'host theme updates preview mode without waiting for the image');
    assert.equal(preview.style['--sk-ink'], '#f5f2f3');
    assert.equal(preview.style['--sk-header-fill'], '#1c1c20', 'basic preview uses its neutral dark header fill');
    resolveAsset('blob:slow-background');
    await flush();
    assert.equal(preview.getAttribute('data-dark'), 'true', 'resolving the old image request cannot restore the light palette');
    assert.equal(root.querySelector('.dsh-preview-bg').src, 'blob:slow-background');
  } finally { dispose(); }
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
  assert.match(root.innerHTML, /支持 PNG\/APNG、JPG、GIF、WebP，单张不超过 10 MiB/);
  assert.doesNotMatch(root.innerHTML, /Choose File|No file chosen/);
  const backgroundInput = root.querySelector('#upload-background');
  assert.equal(backgroundInput.hasAttribute('hidden'), true);
  assert.equal(backgroundInput.getAttribute('tabindex'), '-1');
  assert.equal(root.querySelector('[data-action="clear"][data-kind="background"]').textContent, '移除图片');
  assert.equal(root.querySelector('.dsh-upload-thumb img').src, 'blob:saved-background', 'an existing image is shown as the thumbnail');
  assert.ok(root.querySelector('[data-action="clear"][data-kind="character"]'), 'a dark-only legacy character is also available in light mode');
  const chooseBackground = root.querySelector('[data-action="choose-upload"][data-kind="background"]');
  assert.equal(chooseBackground.getAttribute('type'), 'button');
  assert.equal(chooseBackground.textContent, '选择背景图片或动图');
  assert.equal(backgroundInput.getAttribute('aria-label'), '选择背景图片或动图');
  assert.match(backgroundInput.getAttribute('accept'), /\.png/);
  assert.match(backgroundInput.getAttribute('accept'), /\.apng/);
  assert.match(backgroundInput.getAttribute('accept'), /\.jpg/);
  assert.match(backgroundInput.getAttribute('accept'), /\.jpeg/);
  assert.match(backgroundInput.getAttribute('accept'), /\.gif/);
  assert.match(backgroundInput.getAttribute('accept'), /\.webp/);
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

test('uploads normalize missing GIF MIME and APNG container-signature MIME without changing bytes', async () => {
  const doc = new FakeDocument(), container = makeContainer(doc), profile = preset();
  const uploaded = [], previews = [], previousImage = globalThis.Image;
  const previousCreateObjectURL = URL.createObjectURL, previousRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { previews.push(blob); return `blob:upload-${previews.length}`; };
  URL.revokeObjectURL = () => {};
  globalThis.Image = class {
    naturalWidth = 20;
    naturalHeight = 10;
    onload = null;
    onerror = null;
    set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  };
  const dispose = mountEditor(container, {standalone:true,api:{
    state:async()=>({presets:[profile],activePresetId:null}), assetUrl:async()=>'', onState:()=>()=>{},
    upload:async file=>{uploaded.push(file);return {id:`asset-${uploaded.length}`};},
  }});
  const bytesOf = async blob => [...new Uint8Array(await blob.arrayBuffer())];
  try {
    await flush();
    await container.firstElementChild.querySelector('[data-action="edit"]').dispatch('click');
    let root = container.firstElementChild;
    assert.match(root.querySelector('.dsh-upload-limit').textContent, /动图最多 300 帧，累计解码像素不超过 1\.2 亿/);
    assert.match(root.querySelector('#upload-background').getAttribute('accept'), /image\/gif/);
    assert.match(root.querySelector('#upload-background').getAttribute('accept'), /image\/apng/);

    const gifBytes = [71,73,70,56,55,97,1,0,1,0,128,0,0,0,0,0,255,255,255,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59];
    root.querySelector('#upload-background').files = [imageFile('animation.gif', '', gifBytes)];
    await root.querySelector('#upload-background').dispatch('change');
    root = container.firstElementChild;
    assert.equal(uploaded[0].type, 'image/gif', 'a valid GIF with empty MIME is uploaded with the canonical GIF MIME');
    assert.deepEqual(await bytesOf(uploaded[0]), gifBytes, 'MIME normalization preserves the GIF bytes');
    assert.equal(previews[0].type, 'image/gif', 'the GIF preview uses its canonical MIME');

    const apngContainerSignatureBytes = [137,80,78,71,13,10,26,10, 0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,0,0,0,0, 0,0,0,8,97,99,84,76,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0];
    root.querySelector('#upload-character').files = [imageFile('motion.apng', 'application/octet-stream', apngContainerSignatureBytes)];
    await root.querySelector('#upload-character').dispatch('change');
    assert.equal(uploaded[1].type, 'image/apng', 'an APNG container signature with octet-stream MIME is uploaded with APNG MIME');
    assert.deepEqual(await bytesOf(uploaded[1]), apngContainerSignatureBytes, 'MIME normalization preserves the APNG container-signature mock bytes');
    assert.equal(previews[1].type, 'image/apng', 'the APNG container-signature preview uses its canonical MIME');

    root = container.firstElementChild;
    root.querySelector('#upload-background').files = [imageFile('broken.gif', 'image/gif', [71,73,70,56,48,97])];
    await root.querySelector('#upload-background').dispatch('change');
    root = container.firstElementChild;
    assert.match(root.querySelector('[data-upload-state="background"]').textContent, /无法识别图片内容/);
    assert.equal(uploaded.length, 2, 'a damaged GIF is rejected before upload');

    root.querySelector('#upload-background').files = [imageFile('wrong.gif', 'image/png', gifBytes)];
    await root.querySelector('#upload-background').dispatch('change');
    root = container.firstElementChild;
    assert.match(root.querySelector('[data-upload-state="background"]').textContent, /文件声明的格式与实际图片内容不一致/);
    assert.equal(uploaded.length, 2, 'a valid GIF with a mismatched declared MIME is rejected');
  } finally {
    dispose();
    globalThis.Image = previousImage;
    URL.createObjectURL = previousCreateObjectURL;
    URL.revokeObjectURL = previousRevokeObjectURL;
  }
});

test('image upload, thumbnails, failed replacements, and removal share assets across host themes', async () => {
  const doc = new FakeDocument();
  const container = makeContainer(doc);
  const profile = preset();
  profile.light.backgroundId = 'saved-background';
  profile.dark.characterId = 'saved-character';
  let resolveUpload;
  let uploadedFile = null;
  let failNextUpload = false;
  let uploadFailureMessage = 'Unsupported image content type or signature';
  let savedPatch;
  const previousImage = globalThis.Image;
  const previousCreateObjectURL = URL.createObjectURL;
  const previousRevokeObjectURL = URL.revokeObjectURL;
  const revoked = [];
  let imageDecodes = 0, objectUrlCreations = 0;
  URL.createObjectURL = () => { objectUrlCreations++; return 'blob:pending-image'; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class {
    constructor() { imageDecodes++; }
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
        update: async (id, patch) => { savedPatch = patch; return {presets:[{...patch,id}],activePresetId:null}; },
        upload: (file) => {
          if (failNextUpload) { failNextUpload = false; throw new Error(uploadFailureMessage); }
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
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '已设置立绘图片', 'a legacy dark-only portrait is shared into light');
    assert.doesNotMatch(root.innerHTML, /浅色与深色共用/);
    assert.doesNotMatch(root.innerHTML, /data-mode=/, 'upload cards have no theme-dependent mode marker');
    assert.equal(root.querySelector('#upload-background').getAttribute('data-upload'), 'background');
    assert.equal(root.querySelector('[data-upload-card="background"]').getAttribute('data-mode'), null);
    doc.setTheme(true);
    await flush();
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '已设置立绘图片');
    assert.equal(root.querySelector('[data-upload-card="background"] .dsh-upload-thumb img').src, 'blob:saved-background', 'dark mode shows the shared background thumbnail');
    assert.equal(root.querySelector('[data-upload-card="character"] h4').textContent, '透明立绘');
    assert.equal(root.querySelector('[data-action="choose-upload"][data-kind="character"]').textContent, '选择立绘图片或动图');
    assert.doesNotMatch(root.querySelector('.dsh-upload-limit').textContent, /透明|背景透明/);
    const input = root.querySelector('#upload-character');
    const file = imageFile('立绘.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10]);
    input.files = [file];
    const pending = input.dispatch('change');
    await flush();
    await flush();
    root = container.firstElementChild;
    assert.equal(uploadedFile, file, 'the original File passes through the existing upload method');
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '正在上传：立绘.png');
    assert.equal(root.querySelector('[data-action="choose-upload"][data-kind="character"]').disabled, true, 'uploads cannot be started twice');
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:saved-character', 'the current draft image remains while the server checks the upload');
    assert.equal(objectUrlCreations, 0, 'no temporary preview URL is created before the server accepts the upload');
    assert.equal(imageDecodes, 0, 'the image is not decoded before the server accepts the upload');
    resolveUpload({id: 'new-character'});
    await pending;
    await flush();
    root = container.firstElementChild;
    assert.equal(objectUrlCreations, 1, 'the preview URL is created after server acceptance');
    assert.equal(imageDecodes, 1, 'image decoding starts after server acceptance');
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:new-character', 'the accepted upload replaces the draft image after decoding');
    assert.match(root.querySelector('[data-upload-state="character"]').textContent, /立绘\.png：上传完成，保存皮肤后生效/);
    assert.equal(root.querySelector('[data-action="clear"][data-kind="character"]').textContent, '移除图片');
    assert.equal(doc.activeElement.dataset.action, 'choose-upload', 'focus returns to the chooser after upload');
    assert.equal(doc.activeElement.dataset.kind, 'character');
    assert.ok(revoked.includes('blob:pending-image'), 'temporary object URLs are revoked after upload');
    assert.equal(profile.dark.characterId, 'saved-character', 'the selected filename and uploaded id do not mutate the saved preset');

    failNextUpload = true;
    const failedInput = root.querySelector('#upload-character');
    failedInput.files = [imageFile('bad-response.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10])];
    await failedInput.dispatch('change');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, 'Unsupported image content type or signature', 'server validation details remain visible when upload fails');
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:new-character', 'a failed server replacement restores the previous draft thumbnail');
    assert.equal(objectUrlCreations, 1, 'a rejected server upload does not create a preview URL');
    assert.equal(imageDecodes, 1, 'a rejected server upload does not decode the image');
    assert.equal(root.querySelector('[data-action="clear"][data-kind="character"]').textContent, '移除图片', 'the previous draft asset id remains set after server failure');
    assert.equal(doc.activeElement.dataset.action, 'choose-upload', 'focus returns to the same chooser after server failure');
    assert.equal(doc.activeElement.dataset.kind, 'character');

    failNextUpload = true;
    uploadFailureMessage = 'Animation exceeds 300 frames';
    root.querySelector('#upload-character').files = [imageFile('too-many-frames.gif', 'image/gif', [71,73,70,56,57,97])];
    await root.querySelector('#upload-character').dispatch('change');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '动图帧数不能超过 300 帧。');
    assert.equal(objectUrlCreations, 1, 'frame-budget rejection happens before preview creation');
    assert.equal(imageDecodes, 1, 'frame-budget rejection happens before image decoding');
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:new-character', 'frame-budget rejection preserves the draft image');

    failNextUpload = true;
    uploadFailureMessage = 'Animation exceeds 120 million decoded pixels';
    root.querySelector('#upload-character').files = [imageFile('too-large-animation.gif', 'image/gif', [71,73,70,56,57,97])];
    await root.querySelector('#upload-character').dispatch('change');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-upload-state="character"]').textContent, '动图累计解码像素不能超过 1.2 亿。');
    assert.equal(objectUrlCreations, 1, 'decoded-pixel-budget rejection happens before preview creation');
    assert.equal(imageDecodes, 1, 'decoded-pixel-budget rejection happens before image decoding');
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:new-character', 'decoded-pixel-budget rejection preserves the draft image');

    doc.setTheme(false, 'media');
    await flush();
    assert.match(root.querySelector('[data-upload-state="background"]').textContent, /已设置背景图片/);
    await flush();
    assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src, 'blob:new-character', 'replacement from dark mode also appears in light');
    await root.querySelector('[data-action="clear"][data-kind="background"]').dispatch('click');
    root = container.firstElementChild;
    assert.equal(root.querySelector('[data-action="clear"][data-kind="background"]'), null);
    assert.equal(root.querySelector('[data-upload-state="background"]').textContent, '尚未选择背景图片');
    assert.ok(root.querySelector('[data-action="clear"][data-kind="character"]'), 'removing the background preserves the shared character');
    assert.equal(doc.activeElement.dataset.action, 'choose-upload', 'focus returns to the chooser after image removal');
    assert.equal(doc.activeElement.dataset.kind, 'background');
    doc.setTheme(true);
    await flush();
    assert.equal(root.querySelector('[data-upload-state="background"]').textContent, '尚未选择背景图片', 'removal clears both modes');
    assert.equal(root.querySelector('.dsh-preview-bg').src, undefined, 'removed background no longer falls back to another mode');
    await root.querySelector('[data-action="save"]').dispatch('click');
    assert.equal(savedPatch.light.backgroundId, null);
    assert.equal(savedPatch.dark.backgroundId, null);
    assert.equal(savedPatch.light.characterId, 'new-character');
    assert.equal(savedPatch.dark.characterId, 'new-character');
    dispose();
  } finally {
    globalThis.Image = previousImage;
    URL.createObjectURL = previousCreateObjectURL;
    URL.revokeObjectURL = previousRevokeObjectURL;
  }
});

test('legacy image conflicts preserve both originals until an explicit choice and block saving unresolved assets', async () => {
  const doc = new FakeDocument(), container = makeContainer(doc), original = preset();
  original.light = {backgroundId:'light-background',characterId:'light-character'};
  original.dark = {backgroundId:'dark-background',characterId:'dark-character'};
  let updates = 0, saved;
  const dispose = mountEditor(container, {standalone:true,api:{
    state:async()=>({presets:[original],activePresetId:null}), assetUrl:async id=>`blob:${id}`,
    update:async(id,patch)=>{updates++;saved=patch;return {presets:[{...patch,id}],activePresetId:null};},
  }});
  await flush();
  const root = container.firstElementChild;
  await root.querySelector('[data-action="edit"]').dispatch('click');
  await flush();
  assert.equal(root.querySelectorAll('.dsh-image-conflict').length,2);
  assert.deepEqual(root.querySelectorAll('[data-legacy-image]').map(image=>image.src), ['blob:light-background','blob:dark-background','blob:light-character','blob:dark-character']);
  await root.querySelector('[data-action="save"]').dispatch('click');
  assert.equal(updates,0,'conflicting images cannot be silently overwritten by save');
  assert.match(root.querySelector('.dsh-notice').textContent,/请先选择要保留的图片/);
  await root.querySelector('[data-action="retain-image"][data-kind="background"][data-source="dark"]').dispatch('click');
  await flush();
  assert.equal(root.querySelector('[data-upload-card="background"] .dsh-upload-thumb img').src,'blob:dark-background');
  await root.querySelector('[data-action="save"]').dispatch('click');
  assert.equal(updates,0,'the remaining character conflict also needs an explicit choice');
  await root.querySelector('[data-action="retain-image"][data-kind="character"][data-source="light"]').dispatch('click');
  doc.setTheme(true);
  await flush();
  assert.equal(root.querySelectorAll('.dsh-image-conflict').length,0);
  assert.equal(root.querySelector('[data-upload-card="character"] .dsh-upload-thumb img').src,'blob:light-character');
  assert.equal(original.light.backgroundId,'light-background','editing preserves the saved originals');
  assert.equal(original.dark.characterId,'dark-character');
  await root.querySelector('[data-action="save"]').dispatch('click');
  assert.equal(updates,1);
  assert.deepEqual(saved.light,{backgroundId:'dark-background',characterId:'light-character'});
  assert.deepEqual(saved.dark,saved.light);
  dispose();
});

test('opening a one-sided legacy image shows both previews without creating an unsaved edit', async () => {
  const doc = new FakeDocument(), container = makeContainer(doc), original = preset();
  original.dark.backgroundId = 'dark-only';
  const dispose = mountEditor(container,{standalone:true,api:{state:async()=>({presets:[original],activePresetId:null}),assetUrl:async id=>`blob:${id}`}});
  await flush();
  const root=container.firstElementChild;
  await root.querySelector('[data-action="edit"]').dispatch('click');
  await flush();
  assert.equal(root.querySelector('.dsh-preview-bg').src,'blob:dark-only');
  assert.equal(root.querySelector('[data-upload-card="background"] .dsh-upload-thumb img').src,'blob:dark-only');
  doc.setTheme(true);
  await flush();
  assert.equal(root.querySelector('.dsh-preview-bg').src,'blob:dark-only');
  assert.equal(root.querySelector('[data-upload-state="background"]').textContent,'已设置背景图片');
  await root.querySelector('[data-action="cancel"]').dispatch('click');
  assert.equal(root.querySelector('[role="alertdialog"]'),null,'a preview mode change alone does not dirty the draft');
  assert.equal(root.querySelector('.dsh-editor'),null);
  assert.equal(original.light.backgroundId,null,'automatic draft normalization does not mutate the saved record');
  dispose();
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
