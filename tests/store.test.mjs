import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/server/store.js';
import { createDefaultProfile, validateProfile } from '../src/shared/model.js';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, store: createStore(dir) };
}
// Small structurally complete PNG. Pixel bytes and CRCs are intentionally irrelevant to header validation.
function png(w=1,h=1) {
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const chunk=(type,data)=>{const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length,0);b.write(type,4);data.copy(b,8);return b;};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  return Buffer.concat([sig,chunk('IHDR',ih),chunk('IDAT',Buffer.from([0])),chunk('IEND',Buffer.alloc(0))]);
}
function jpeg(w=1,h=1) {
  const sof=Buffer.alloc(19);sof.set([0xff,0xc0,0,17,8]);sof.writeUInt16BE(h,5);sof.writeUInt16BE(w,7);sof[9]=3;
  return Buffer.concat([Buffer.from([0xff,0xd8]),sof,Buffer.from([0xff,0xd9])]);
}
function webp(w=1,h=1) {
  const b=Buffer.alloc(30);b.write('RIFF',0);b.writeUInt32LE(22,4);b.write('WEBP',8);b.write('VP8X',12);b.writeUInt32LE(10,16);
  b.writeUIntLE(w-1,24,3);b.writeUIntLE(h-1,27,3);return b;
}

test('profile defaults, preset lifecycle, atomic persistence, and copied settings', async t => {
  const {store}=await fixture(t);
  assert.deepEqual(await store.read(), createDefaultProfile());
  const first=(await store.createPreset('  Night  ')).presets[0];
  assert.equal(first.name,'Night');
  assert.equal(first.settings.accent,'#D88F9E');
  const changed=await store.updatePreset(first.id,{settings:{blur:8,extra:'discard'},unknown:'discard'});
  assert.equal(changed.presets[0].settings.blur,8);
  assert.equal('extra' in changed.presets[0].settings,false);
  const copy=(await store.duplicatePreset(first.id)).presets[1];
  assert.equal(copy.settings.blur,8); assert.notEqual(copy.id,first.id);
  await store.activatePreset(first.id);
  const deleted=await store.deletePreset(first.id);
  assert.equal(deleted.activePresetId,null);
  assert.deepEqual(await store.read(),deleted);
  const long=(await store.createPreset('x'.repeat(100))).presets.at(-1);
  assert.equal((await store.duplicatePreset(long.id)).presets.at(-1).name.length,100);
});

test('validates ranges, rejects corrupt profile without overwriting it', async t => {
  const {dir,store}=await fixture(t);
  const p=createDefaultProfile();p.presets=[{id:'a',name:'x',light:{backgroundId:null,characterId:null},dark:{backgroundId:null,characterId:null},settings:{accent:'#fff',backgroundX:50}}];
  assert.throws(()=>validateProfile(p),/accent/);
  const corrupt='{bad json';await writeFile(path.join(dir,'profile.json'),corrupt);
  await assert.rejects(store.read(),/Cannot read profile JSON/);
  assert.equal(await readFile(path.join(dir,'profile.json'),'utf8'),corrupt);
});

test('legacy profiles default UI options and persist validated choices', async t => {
  const {dir, store}=await fixture(t);
  const legacy=createDefaultProfile();
  const preset=(await store.createPreset('Legacy')).presets[0];
  delete preset.settings.uiStyle;
  delete preset.settings.decorations;
  legacy.presets=[preset];
  await writeFile(path.join(dir,'profile.json'),JSON.stringify(legacy));
  assert.equal((await store.read()).presets[0].settings.uiStyle,'refined');
  assert.equal((await store.read()).presets[0].settings.decorations,true);
  await store.updatePreset(preset.id,{settings:{uiStyle:'basic',decorations:false}});
  const reread=await store.read();
  assert.equal(reread.presets[0].settings.uiStyle,'basic');
  assert.equal(reread.presets[0].settings.decorations,false);
  await assert.rejects(store.updatePreset(preset.id,{settings:{uiStyle:'fancy'}}),/uiStyle/);
  await assert.rejects(store.updatePreset(preset.id,{settings:{decorations:'yes'}}),/decorations/);
});

test('imports content-addressed image, rejects malformed/oversize data and prevents dangling refs', async t => {
  const {store}=await fixture(t);
  const image=png();const asset=await store.importAsset(image);
  assert.equal(asset.mime,'image/png');assert.equal(asset.size,image.length);
  assert.deepEqual(await store.readAsset(asset.id),image);
  const preset=(await store.createPreset('Image')).presets[0];
  await assert.rejects(store.updatePreset(preset.id,{light:{backgroundId:'f'.repeat(64)+'.png'}}),/Referenced asset not found/);
  await assert.rejects(store.importAsset(Buffer.from('not png')),/Unsupported image/);
  await assert.rejects(store.importAsset(Buffer.alloc(10*1024*1024+1)),/10 MiB/);
  await assert.rejects(store.readAsset('../profile.json'),/invalid asset id/);
  assert.equal((await readdir(path.join((await import('node:os')).tmpdir()))).includes('profile.json'),false);
});

test('recognizes JPEG, PNG and WebP bytes and preserves shared assets after preset deletion', async t => {
  const {store}=await fixture(t);
  for (const [bytes,mime,ext] of [[png(),'image/png','.png'],[jpeg(),'image/jpeg','.jpg'],[webp(),'image/webp','.webp']]) {
    const first=await store.importAsset(bytes), again=await store.importAsset(bytes);
    assert.equal(first.mime,mime);assert.ok(first.id.endsWith(ext));assert.deepEqual(again,first);
  }
  const asset=await store.importAsset(png());
  const p=(await store.createPreset('Shared')).presets[0];
  await store.updatePreset(p.id,{light:{backgroundId:asset.id}});
  await store.deletePreset(p.id);
  assert.deepEqual(await store.readAsset(asset.id),png());
});

test('rejects truncated containers and images beyond the pixel limit', async t => {
  const {store}=await fixture(t);
  const truncatedPng=png().subarray(0,-4);
  await assert.rejects(store.importAsset(truncatedPng),/PNG chunk boundaries|truncated PNG/);
  await assert.rejects(store.importAsset(jpeg().subarray(0,-2)),/truncated JPEG/);
  const badWebp=webp();badWebp.writeUInt32LE(21,4);
  await assert.rejects(store.importAsset(badWebp),/RIFF size/);
  await assert.rejects(store.importAsset(png(10001,4000)),/40 megapixels/);
  assert.equal((await store.importAsset(png(10000,4000))).mime,'image/png');
});

test('serial concurrent mutations retain every preset', async t => {
  const {store}=await fixture(t);
  await Promise.all(Array.from({length:12},(_,i)=>store.createPreset(`p${i}`)));
  assert.equal((await store.read()).presets.length,12);
});
