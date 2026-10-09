/** Shared, dependency-free preset model and validation. */
import { ASSET_ID_RE } from './assets.js';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  accent: '#D88F9E', backgroundX: 50, backgroundY: 50, backgroundScale: 100,
  blur: 0, overlay: 0.25, panelOpacity: 0.85, characterSide: 'right',
  characterSize: 35, characterOpacity: 1, characterMirror: false,
  uiStyle: 'refined', decorations: true,
});

export function createDefaultProfile() {
  return { schemaVersion: SCHEMA_VERSION, activePresetId: null, presets: [] };
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function bounded(value, path, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path, `expected a number from ${min} to ${max}`);
  return value;
}

/** Validate a complete profile. Unknown properties are discarded; malformed known fields fail. */
export function validateProfile(input) {
  if (!plainObject(input)) fail('profile', 'expected an object');
  if (input.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion', `expected ${SCHEMA_VERSION}`);
  if (!Array.isArray(input.presets) || input.presets.length > 200) fail('presets', 'expected an array with at most 200 entries');
  const ids = new Set();
  const presets = input.presets.map((p, i) => {
    const path = `presets[${i}]`;
    if (!plainObject(p)) fail(path, 'expected an object');
    if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)) fail(`${path}.id`, 'invalid id');
    if (ids.has(p.id)) fail(`${path}.id`, 'duplicate id');
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100) fail(`${path}.name`, 'expected 1 to 100 characters');
    const mode = (v, modePath) => {
      if (!plainObject(v)) fail(modePath, 'expected an object');
      for (const key of ['backgroundId', 'characterId']) {
        if (v[key] !== null && (typeof v[key] !== 'string' || !ASSET_ID_RE.test(v[key]))) fail(`${modePath}.${key}`, 'invalid asset id');
      }
      return { backgroundId: v.backgroundId, characterId: v.characterId };
    };
    if (!plainObject(p.settings)) fail(`${path}.settings`, 'expected an object');
    const s = p.settings;
    if (typeof s.accent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.accent)) fail(`${path}.settings.accent`, 'expected #RRGGBB');
    if (s.characterSide !== 'left' && s.characterSide !== 'right') fail(`${path}.settings.characterSide`, 'expected left or right');
    if (typeof s.characterMirror !== 'boolean') fail(`${path}.settings.characterMirror`, 'expected boolean');
    const settings = {
      accent: s.accent.toUpperCase(),
      backgroundX: bounded(s.backgroundX, `${path}.settings.backgroundX`, 0, 100),
      backgroundY: bounded(s.backgroundY, `${path}.settings.backgroundY`, 0, 100),
      backgroundScale: bounded(s.backgroundScale, `${path}.settings.backgroundScale`, 100, 200),
      blur: bounded(s.blur, `${path}.settings.blur`, 0, 20),
      overlay: bounded(s.overlay, `${path}.settings.overlay`, 0, 0.9),
      panelOpacity: bounded(s.panelOpacity, `${path}.settings.panelOpacity`, 0.3, 1),
      characterSide: s.characterSide,
      characterSize: bounded(s.characterSize, `${path}.settings.characterSize`, 10, 60),
      characterOpacity: bounded(s.characterOpacity, `${path}.settings.characterOpacity`, 0, 1),
      characterMirror: s.characterMirror,
      uiStyle: s.uiStyle === undefined ? DEFAULT_SETTINGS.uiStyle : s.uiStyle,
      decorations: s.decorations === undefined ? DEFAULT_SETTINGS.decorations : s.decorations,
    };
    if (settings.uiStyle !== 'refined' && settings.uiStyle !== 'basic') fail(`${path}.settings.uiStyle`, 'expected refined or basic');
    if (typeof settings.decorations !== 'boolean') fail(`${path}.settings.decorations`, 'expected boolean');
    const light = mode(p.light, `${path}.light`), dark = mode(p.dark, `${path}.dark`);
    // A single legacy image becomes shared. Keep two different existing images
    // until the user chooses which one to retain in the editor.
    for (const key of ['backgroundId', 'characterId']) {
      if (!light[key]) light[key] = dark[key];
      if (!dark[key]) dark[key] = light[key];
    }
    return { id: p.id, name: p.name.trim(), light, dark, settings };
  });
  const activePresetId = input.activePresetId;
  if (activePresetId !== null && (typeof activePresetId !== 'string' || !ids.has(activePresetId))) fail('activePresetId', 'must be null or an existing preset id');
  return { schemaVersion: SCHEMA_VERSION, activePresetId, presets };
}

export function createPresetRecord(name, id) {
  const mode = () => ({ backgroundId: null, characterId: null });
  return { id, name, light: mode(), dark: mode(), settings: { ...DEFAULT_SETTINGS } };
}
