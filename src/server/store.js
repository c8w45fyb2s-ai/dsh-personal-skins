import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, lstat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultProfile, createPresetRecord, DEFAULT_SETTINGS, validateProfile } from '../shared/model.js';
import { ASSET_ID_RE } from '../shared/assets.js';
import { inspectImage } from './media.js';

async function safeFile(pathname) {
  try { const s = await lstat(pathname); return s.isFile() && !s.isSymbolicLink(); }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

/**
 * Create a store confined to the caller-supplied profile directory.
 * Every profile mutation resolves to the complete persisted profile.
 * @param {string} directory Caller-selected per-profile storage directory.
 * @returns {{read:()=>Promise<object>, createPreset:(name:string)=>Promise<object>, updatePreset:(id:string,patch:object)=>Promise<object>, duplicatePreset:(id:string,name?:string)=>Promise<object>, deletePreset:(id:string)=>Promise<object>, activatePreset:(id:string|null)=>Promise<object>, importAsset:(bytes:Buffer|Uint8Array)=>Promise<{id:string,mime:string,size:number,width:number,height:number,animated:boolean,frameCount:number,durationMs:number}>, readAsset:(id:string)=>Promise<Buffer>}}
 */
export function createStore(directory) {
  if (typeof directory !== 'string' || !directory) throw new TypeError('directory is required');
  const root = path.resolve(directory), assetsDir = path.join(root, 'assets'), profileFile = path.join(root, 'profile.json');
  let writes = Promise.resolve();
  const serial = fn => { const task = writes.then(fn); writes = task.catch(() => {}); return task; };
  async function ensure() {
    await mkdir(assetsDir, { recursive: true });
    const stat = await lstat(assetsDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Assets path is not a regular directory');
  }
  async function load() {
    await ensure();
    let profileStat;
    try { profileStat = await lstat(profileFile); }
    catch (e) { if (e.code === 'ENOENT') return createDefaultProfile(); throw e; }
    if (!profileStat.isFile() || profileStat.isSymbolicLink()) throw new Error('Profile path is not a regular file');
    if (profileStat.size > 1024 * 1024) throw new RangeError('Profile file exceeds 1 MiB');
    let data;
    try { data = JSON.parse(await readFile(profileFile, 'utf8')); }
    catch (e) { throw new Error(`Cannot read profile JSON: ${e.message}`, { cause: e }); }
    return validateProfile(data);
  }
  async function save(profile) {
    const clean = validateProfile(profile); await ensure();
    for (const preset of clean.presets) for (const mode of [preset.light, preset.dark]) {
      for (const id of [mode.backgroundId, mode.characterId]) if (id && !await safeFile(path.join(assetsDir, id))) throw new RangeError(`Referenced asset not found: ${id}`);
    }
    const tmp = path.join(root, `.profile-${randomUUID()}.tmp`);
    try {
      const fh = await open(tmp, 'wx', 0o600);
      try { await fh.writeFile(`${JSON.stringify(clean, null, 2)}\n`, 'utf8'); await fh.sync(); }
      finally { await fh.close(); }
      await rename(tmp, profileFile);
    } catch (e) { await unlink(tmp).catch(() => {}); throw e; }
    return clean;
  }
  async function mutate(fn) { return serial(async () => { const next = await fn(await load()); return save(next); }); }

  return {
    read: () => serial(load),
    createPreset(name) {
      return mutate(p => {
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new TypeError('name must contain 1 to 100 characters');
        if (p.presets.length >= 200) throw new RangeError('preset limit reached');
        const item = createPresetRecord(name.trim(), randomUUID()); p.presets.push(item); return p;
      });
    },
    updatePreset(id, patch) {
      return mutate(p => {
        const item = p.presets.find(x => x.id === id); if (!item) throw new RangeError('preset not found');
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('patch must be an object');
        const allowed = ['name', 'light', 'dark', 'settings'];
        for (const key of allowed) if (Object.hasOwn(patch, key)) {
          if (key === 'name') item.name = patch.name;
          else if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) item[key] = { ...item[key], ...patch[key] };
          else throw new TypeError(`${key} patch must be an object`);
        }
        for (const key of ['backgroundId', 'characterId']) {
          const lightChanged = patch.light && Object.hasOwn(patch.light, key);
          const darkChanged = patch.dark && Object.hasOwn(patch.dark, key);
          if (lightChanged && darkChanged && patch.light[key] !== patch.dark[key]) {
            throw new TypeError(`${key}: choose one image for both modes`);
          }
          if (lightChanged || darkChanged) {
            const assetId = lightChanged ? patch.light[key] : patch.dark[key];
            item.light[key] = assetId;
            item.dark[key] = assetId;
          }
        }
        return p;
      });
    },
    duplicatePreset(id, name) {
      return mutate(p => {
        const source = p.presets.find(x => x.id === id); if (!source) throw new RangeError('preset not found');
        if (p.presets.length >= 200) throw new RangeError('preset limit reached');
        const copy = structuredClone(source); copy.id = randomUUID();
        copy.name = name === undefined ? `${source.name.slice(0, 95).trimEnd()} copy` : name;
        p.presets.push(copy); return p;
      });
    },
    deletePreset(id) {
      return mutate(p => {
        const n = p.presets.findIndex(x => x.id === id); if (n < 0) throw new RangeError('preset not found');
        p.presets.splice(n, 1); if (p.activePresetId === id) p.activePresetId = null; return p;
      });
    },
    activatePreset(id) {
      return mutate(p => {
        if (id !== null && !p.presets.some(x => x.id === id)) throw new RangeError('preset not found');
        p.activePresetId = id; return p;
      });
    },
    importAsset(input) {
      return serial(async () => {
        const buf = Buffer.isBuffer(input) ? input : input instanceof Uint8Array ? Buffer.from(input) : null;
        const info = inspectImage(buf);
        const id = `${createHash('sha256').update(buf).digest('hex')}.${info.ext}`;
        await ensure();
        const dest = path.join(assetsDir, id);
        if (!await safeFile(dest)) {
          const tmp = path.join(assetsDir, `.${randomUUID()}.tmp`);
          try { await writeFile(tmp, buf, { flag: 'wx', mode: 0o600 }); await rename(tmp, dest); }
          catch (e) { await unlink(tmp).catch(() => {}); throw e; }
        }
        const { ext, ...metadata } = info;
        return { id, ...metadata, size: buf.length };
      });
    },
    readAsset(id) {
      return serial(async () => {
        if (typeof id !== 'string' || !ASSET_ID_RE.test(id)) throw new TypeError('invalid asset id');
        const pathname = path.join(assetsDir, id);
        if (!await safeFile(pathname)) throw new RangeError('asset not found');
        return readFile(pathname);
      });
    },
  };
}

export { DEFAULT_SETTINGS };
