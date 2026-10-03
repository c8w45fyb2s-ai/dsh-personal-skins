import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, lstat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultProfile, createPresetRecord, DEFAULT_SETTINGS, validateProfile } from '../shared/model.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const ID_RE = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/;

function dimensions(buf) {
  if (buf.length >= 45 && buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    let off = 8, width, height, hasData = false, ended = false;
    while (off + 12 <= buf.length) {
      const length = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
      if (off + 12 + length > buf.length) throw new TypeError('Invalid PNG chunk boundaries');
      if (off === 8 && (length !== 13 || type !== 'IHDR')) throw new TypeError('Invalid PNG header');
      if (type === 'IHDR') { width = buf.readUInt32BE(off + 8); height = buf.readUInt32BE(off + 12); }
      if (type === 'IDAT') hasData = true;
      off += 12 + length;
      if (type === 'IEND') { if (length !== 0) throw new TypeError('Invalid PNG end chunk'); ended = true; break; }
    }
    if (!ended || !hasData || off !== buf.length || !width || !height) throw new TypeError('Invalid or truncated PNG image');
    return { mime: 'image/png', ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    if (buf.readUInt32LE(4) !== buf.length - 8) throw new TypeError('Invalid WebP RIFF size');
    let off = 12;
    while (off + 8 <= buf.length) {
      const kind = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4), d = off + 8;
      if (d + len > buf.length) break;
      if (kind === 'VP8X' && len >= 10) return { mime: 'image/webp', ext: 'webp', width: 1 + buf.readUIntLE(d + 4, 3), height: 1 + buf.readUIntLE(d + 7, 3) };
      if (kind === 'VP8 ' && len >= 10 && buf[d + 3] === 0x9d && buf[d + 4] === 0x01 && buf[d + 5] === 0x2a) return { mime: 'image/webp', ext: 'webp', width: buf.readUInt16LE(d + 6) & 0x3fff, height: buf.readUInt16LE(d + 8) & 0x3fff };
      if (kind === 'VP8L' && len >= 5 && buf[d] === 0x2f) return { mime: 'image/webp', ext: 'webp', width: 1 + buf[d + 1] + ((buf[d + 2] & 0x3f) << 8), height: 1 + (buf[d + 2] >> 6) + (buf[d + 3] << 2) + ((buf[d + 4] & 0x0f) << 10) };
      off = d + len + (len & 1);
    }
    throw new TypeError('Invalid or unsupported WebP image');
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) throw new TypeError('Invalid or truncated JPEG image');
    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      while (buf[i] === 0xff) i++;
      const marker = buf[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      if ([0xd8,0x01,0xd0,0xd1,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7].includes(marker)) continue;
      if (i + 2 > buf.length) break;
      const length = buf.readUInt16BE(i);
      if (length < 2 || i + length > buf.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) return { mime: 'image/jpeg', ext: 'jpg', height: buf.readUInt16BE(i + 3), width: buf.readUInt16BE(i + 5) };
      i += length;
    }
    throw new TypeError('Invalid or unsupported JPEG image');
  }
  throw new TypeError('Unsupported image format; use JPEG, PNG, or WebP');
}

async function safeFile(pathname) {
  try { const s = await lstat(pathname); return s.isFile() && !s.isSymbolicLink(); }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

/**
 * Create a store confined to the caller-supplied profile directory.
 * Every profile mutation resolves to the complete persisted profile.
 * @param {string} directory Caller-selected per-profile storage directory.
 * @returns {{read:()=>Promise<object>, createPreset:(name:string)=>Promise<object>, updatePreset:(id:string,patch:object)=>Promise<object>, duplicatePreset:(id:string,name?:string)=>Promise<object>, deletePreset:(id:string)=>Promise<object>, activatePreset:(id:string|null)=>Promise<object>, importAsset:(bytes:Buffer|Uint8Array)=>Promise<{id:string,mime:string,size:number}>, readAsset:(id:string)=>Promise<Buffer>}}
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
        if (!buf || buf.length === 0) throw new TypeError('asset must be a non-empty byte buffer');
        if (buf.length > MAX_BYTES) throw new RangeError('asset exceeds 10 MiB');
        const info = dimensions(buf);
        if (!info.width || !info.height || !Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height)) throw new TypeError('Invalid image dimensions');
        if (info.width * info.height > MAX_PIXELS) throw new RangeError('image exceeds 40 megapixels');
        const id = `${createHash('sha256').update(buf).digest('hex')}.${info.ext}`;
        await ensure();
        const dest = path.join(assetsDir, id);
        if (!await safeFile(dest)) {
          const tmp = path.join(assetsDir, `.${randomUUID()}.tmp`);
          try { await writeFile(tmp, buf, { flag: 'wx', mode: 0o600 }); await rename(tmp, dest); }
          catch (e) { await unlink(tmp).catch(() => {}); throw e; }
        }
        return { id, mime: info.mime, size: buf.length };
      });
    },
    readAsset(id) {
      return serial(async () => {
        if (typeof id !== 'string' || !ID_RE.test(id)) throw new TypeError('invalid asset id');
        const pathname = path.join(assetsDir, id);
        if (!await safeFile(pathname)) throw new RangeError('asset not found');
        return readFile(pathname);
      });
    },
  };
}

export { DEFAULT_SETTINGS };
