import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/server/store.js';
import { createDefaultProfile, DEFAULT_SETTINGS, validateProfile } from '../src/shared/model.js';
import { GIF, APNG, APNG_POSTER, WEBP, WEBP_LOSSY, STATIC_WEBP } from './fixtures/animated-images.mjs';
import { png } from './fixtures/png.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, store: createStore(dir) };
}
function jpeg(w=1,h=1) {
  const sof=Buffer.alloc(19);sof.set([0xff,0xc0,0,17,8]);sof.writeUInt16BE(h,5);sof.writeUInt16BE(w,7);sof[9]=3;
  return Buffer.concat([Buffer.from([0xff,0xd8]),sof,Buffer.from([0xff,0xd9])]);
}
function webp() { return Buffer.from(STATIC_WEBP); }

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

test('profile validation shares one-sided image references while retaining explicit mode differences',()=>{
  const profile=createDefaultProfile();
  // Start from a complete valid preset record without depending on random IDs.
  const base={id:'images',name:'Images',light:{backgroundId:null,characterId:null},dark:{backgroundId:null,characterId:null},settings:{...DEFAULT_SETTINGS}};
  profile.presets=[base];
  const lightBackground='a'.repeat(64)+'.png';
  const darkCharacter='b'.repeat(64)+'.webp';
  base.light.backgroundId=lightBackground;
  base.dark.characterId=darkCharacter;
  let normalized=validateProfile(profile).presets[0];
  assert.equal(normalized.light.backgroundId,lightBackground);
  assert.equal(normalized.dark.backgroundId,lightBackground,'a light-only background is shared into dark mode');
  assert.equal(normalized.light.characterId,darkCharacter,'a dark-only character is shared into light mode');
  assert.equal(normalized.dark.characterId,darkCharacter);

  base.dark.backgroundId='c'.repeat(64)+'.jpg';
  base.light.characterId='d'.repeat(64)+'.png';
  normalized=validateProfile(profile).presets[0];
  assert.equal(normalized.light.backgroundId,lightBackground);
  assert.equal(normalized.dark.backgroundId,'c'.repeat(64)+'.jpg','two explicit nonnull background IDs remain distinct');
  assert.equal(normalized.light.characterId,'d'.repeat(64)+'.png','two explicit nonnull character IDs remain distinct');
  assert.equal(normalized.dark.characterId,darkCharacter);
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

test('single-mode image updates share each explicit field, null removes both, and conflicts do not save',async t=>{
  const {dir,store}=await fixture(t);
  const background=await store.importAsset(png(2,1));
  const portrait=await store.importAsset(png(3,1));
  const otherBackground=await store.importAsset(jpeg(1,2));
  const preset=(await store.createPreset('Shared images')).presets[0];

  let state=await store.updatePreset(preset.id,{light:{backgroundId:background.id,characterId:portrait.id}});
  assert.equal(state.presets[0].light.backgroundId,background.id);
  assert.equal(state.presets[0].dark.backgroundId,background.id,'a background upload in either mode is shared');
  assert.equal(state.presets[0].light.characterId,portrait.id);
  assert.equal(state.presets[0].dark.characterId,portrait.id,'a character upload in either mode is shared');

  state=await store.updatePreset(preset.id,{dark:{backgroundId:null,characterId:null}});
  assert.equal(state.presets[0].light.backgroundId,null,'removing the background clears both modes');
  assert.equal(state.presets[0].dark.backgroundId,null);
  assert.equal(state.presets[0].light.characterId,null,'removing the character clears both modes');
  assert.equal(state.presets[0].dark.characterId,null);

  state=await store.updatePreset(preset.id,{dark:{backgroundId:background.id}});
  assert.equal(state.presets[0].light.backgroundId,background.id);
  const file=path.join(dir,'profile.json');
  const before=await readFile(file,'utf8');
  await assert.rejects(store.updatePreset(preset.id,{
    light:{backgroundId:background.id},
    dark:{backgroundId:otherBackground.id},
  }));
  assert.equal(await readFile(file,'utf8'),before,'a conflicting dual-mode patch is rejected before persistence');
  assert.deepEqual(await store.read(),state,'the rejected patch leaves the stored profile unchanged');
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

test('real animations retain original bytes and persist background and character through a fresh store', async t => {
  const {dir,store}=await fixture(t);
  for (const [bytes,mime,ext,frames] of [[GIF,'image/gif','gif',3],[APNG,'image/png','png',3],[APNG_POSTER,'image/png','png',2],[WEBP,'image/webp','webp',3],[WEBP_LOSSY,'image/webp','webp',3]]) {
    const asset=await store.importAsset(bytes);
    assert.equal(asset.mime,mime); assert.ok(asset.id.endsWith('.'+ext));
    assert.equal(asset.width,8); assert.equal(asset.height,8);
    assert.equal(asset.animated,true); assert.equal(asset.frameCount,frames);
    assert.equal(asset.durationMs,frames===2?560:720);
    assert.deepEqual(await store.importAsset(bytes),asset,'deduplication preserves animation metadata');
    const p=(await store.createPreset(ext)).presets.at(-1);
    await store.updatePreset(p.id,{light:{backgroundId:asset.id,characterId:asset.id}});
    await store.activatePreset(p.id);
    const restarted=createStore(dir), profile=await restarted.read();
    assert.equal(profile.activePresetId,p.id);
    const saved=profile.presets.find(item=>item.id===p.id);
    assert.equal(saved.light.backgroundId,asset.id); assert.equal(saved.dark.characterId,asset.id);
    assert.deepEqual(await restarted.readAsset(asset.id),bytes,'frame timing, transparency and loop bytes are not transcoded');
    await restarted.activatePreset(null);
    assert.equal((await restarted.read()).activePresetId,null);
  }
});
