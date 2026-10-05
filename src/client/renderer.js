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
const READABILITY_VARS = ['fill', 'ink', 'muted', 'hover', 'selected', 'border'].map(key => `--dsh-skin-page-${key}`);

const CSS = `
html[${SURFACE_ATTRIBUTE}] body {
  ${BASE_TOKEN}: transparent !important;
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
  const theme = (html.getAttribute('data-theme') || '').toLowerCase();
  if (theme === 'dark' || theme === 'light') return theme === 'dark';
  if (html.classList.contains('dark')) return true;
  if (html.classList.contains('light')) return false;
  const colorScheme = (html.style.colorScheme || '').toLowerCase();
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
    accent, brand: `#${brandRgb.map(v=>v.toString(16).padStart(2,'0')).join('')}`, button, buttonHover, hover:`rgba(${rgb.join(',')},.12)`, buttonText:'#FFFFFF',
  };
}

export function installRenderer({
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

  function applyReadability(theme) {
    for (const key of ['fill', 'ink', 'muted', 'hover', 'selected', 'border']) {
      const name = `--dsh-skin-page-${key}`;
      const value = theme[`page${key[0].toUpperCase()}${key.slice(1)}`];
      setStyleValue(html, name, value);
      writtenReadabilityVars.set(name, value);
    }
  }

  function releaseReadability() {
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
    applyReadability(palette);
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

export { BASE_SELECTORS };
installRenderer.getUiTheme = getUiTheme;
