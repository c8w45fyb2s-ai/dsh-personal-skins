import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImage } from '../src/server/media.js';
import { GIF, APNG, APNG_POSTER, WEBP, WEBP_LOSSY, STATIC_WEBP } from './fixtures/animated-images.mjs';
import { crc32 } from './fixtures/png.mjs';

// Structural boundary cases use tiny compressed subframes on a larger canvas.
function gif(frames, width=8, height=8) {
  const header=Buffer.from('47494638396108000800800000000000ffffff','hex');
  header.writeUInt16LE(width,6); header.writeUInt16LE(height,8);
  const frame=Buffer.from('21f904000a0000002c0000000001000100000202440100','hex');
  return Buffer.concat([header,...Array.from({length:frames},()=>frame),Buffer.from([0x3b])]);
}
function pngChunks(bytes) {
  const chunks=[];
  for(let off=8;off<bytes.length;) {
    const len=bytes.readUInt32BE(off); chunks.push({type:bytes.toString('ascii',off+4,off+8),off,len}); off+=12+len;
  }
  return chunks;
}
function riffChunks(bytes) {
  const chunks=[];
  for(let off=12;off<bytes.length;) {
    const len=bytes.readUInt32LE(off+4); chunks.push({type:bytes.toString('ascii',off,off+4),off,len}); off+=8+len+(len&1);
  }
  return chunks;
}
function repairPng(bytes) {
  for(const {off,len} of pngChunks(bytes)) bytes.writeUInt32BE(crc32(bytes.subarray(off+4,off+8+len)),off+8+len);
  return bytes;
}
function mutate(bytes, fn) {
  const copy=Buffer.from(bytes); fn(copy);
  return copy[0]===137?repairPng(copy):copy;
}

test('real GIF, APNG and WebP report animation metadata; static WebP stays static',()=>{
  for(const bytes of [GIF,APNG,WEBP,WEBP_LOSSY]) {
    const info=inspectImage(bytes);
    assert.equal(info.animated,true); assert.equal(info.frameCount,3);
    assert.equal(info.width,8); assert.equal(info.height,8); assert.equal(info.durationMs,720);
  }
  assert.equal(inspectImage(APNG_POSTER).frameCount,2);
  assert.equal(inspectImage(APNG_POSTER).durationMs,560);
  assert.equal(inspectImage(STATIC_WEBP).animated,false);
  assert.equal(inspectImage(STATIC_WEBP).frameCount,1);
  const gif87=mutate(gif(1),b=>b.write('GIF87a'));
  assert.equal(inspectImage(gif87).mime,'image/gif');
});

test('animation limits count full composited canvases and bound even tiny frames',()=>{
  assert.equal(inspectImage(gif(300,1000,400)).frameCount,300,'120 million canvas pixels at the boundary');
  assert.throws(()=>inspectImage(gif(301)),/300 frames/);
  assert.throws(()=>inspectImage(gif(300,1001,400)),/120 million decoded pixels/);
  assert.throws(()=>inspectImage(gif(1,10000,4001)),/40 megapixels/);
  const acTL=pngChunks(APNG).find(c=>c.type==='acTL');
  assert.throws(()=>inspectImage(mutate(APNG,b=>b.writeUInt32BE(301,acTL.off+8))),/300 frames/);
  assert.throws(()=>inspectImage(mutate(APNG,b=>{b.writeUInt32BE(10000,16);b.writeUInt32BE(4001,20)})),/40 megapixels/);
  // Three frames on a 40M canvas fit; the excluded default image needs a fourth canvas.
  const expanded=mutate(APNG_POSTER,b=>{b.writeUInt32BE(10000,16);b.writeUInt32BE(4000,20)});
  const chunks=pngChunks(expanded), control=chunks.find(c=>c.type==='acTL'), fctl=chunks.find(c=>c.type==='fcTL'), fdat=chunks.find(c=>c.type==='fdAT');
  expanded.writeUInt32BE(3,control.off+8);
  const extraControl=Buffer.from(expanded.subarray(fctl.off,fctl.off+12+fctl.len)); extraControl.writeUInt32BE(4,8);
  const extraData=Buffer.from(expanded.subarray(fdat.off,fdat.off+12+fdat.len)); extraData.writeUInt32BE(5,8);
  const end=chunks.at(-1).off;
  assert.throws(()=>inspectImage(repairPng(Buffer.concat([expanded.subarray(0,end),extraControl,extraData,expanded.subarray(end)]))),/120 million decoded pixels/);

  const webpHeader=riffChunks(WEBP).find(c=>c.type==='VP8X');
  assert.throws(()=>inspectImage(mutate(WEBP,b=>{b.writeUIntLE(9999,webpHeader.off+12,3);b.writeUIntLE(4000,webpHeader.off+15,3)})),/40 megapixels/);
  const parts=riffChunks(WEBP), frame=parts.find(c=>c.type==='ANMF');
  const head=WEBP.subarray(0,frame.off), raw=WEBP.subarray(frame.off,frame.off+8+frame.len+(frame.len&1));
  const excessive=Buffer.concat([head,...Array.from({length:301},()=>raw)]); excessive.writeUInt32LE(excessive.length-8,4);
  assert.throws(()=>inspectImage(excessive),/300 frames/);
});

test('truncated containers, inconsistent controls and out-of-bounds frames are rejected',()=>{
  for(const bytes of [GIF,APNG,WEBP,STATIC_WEBP]) {
    for(let n=1;n<=Math.min(bytes.length,16);n++) assert.throws(()=>inspectImage(bytes.subarray(0,-n)),{name:'TypeError'});
  }
  assert.throws(()=>inspectImage(Buffer.concat([GIF,Buffer.from([0])])),/GIF/);
  assert.throws(()=>inspectImage(Buffer.from('GIF89a')),/GIF/);
  assert.throws(()=>inspectImage(mutate(gif(2),b=>b.writeUInt16LE(9,32))),/frame outside canvas/);
  const chunks=pngChunks(APNG), control=chunks.find(c=>c.type==='acTL'), frames=chunks.filter(c=>c.type==='fcTL');
  assert.throws(()=>inspectImage(mutate(APNG,b=>b.writeUInt32BE(2,control.off+8))),/frame count/);
  assert.throws(()=>inspectImage(mutate(APNG,b=>b.writeUInt32BE(99,frames[1].off+8))),/sequence/);
  assert.throws(()=>inspectImage(mutate(APNG,b=>b.writeUInt32BE(9,frames[1].off+12))),/frame outside canvas/);
  const parts=riffChunks(WEBP), frame=parts.find(c=>c.type==='ANMF'), anim=parts.find(c=>c.type==='ANIM');
  assert.throws(()=>inspectImage(mutate(WEBP,b=>b.writeUIntLE(20,frame.off+8,3))),/frame outside canvas/);
  assert.throws(()=>inspectImage(mutate(WEBP,b=>b.write('JUNK',anim.off))),/without animation control/);
  assert.throws(()=>inspectImage(mutate(WEBP,b=>b.writeUInt32LE(0xffffffff,frame.off+4))),/chunk boundaries/);
  const badCrc=Buffer.from(APNG), image=chunks.find(c=>c.type==='IDAT'); badCrc[image.off+8+image.len]^=1;
  assert.throws(()=>inspectImage(badCrc),/CRC/);
  for(const bytes of [GIF,WEBP]) assert.throws(()=>inspectImage(mutate(bytes,b=>{b[0]|=0x80})),/Unsupported image/);
});

test('GIF plain-text graphics also consume the animation budget',()=>{
  const sample=gif(1), text=Buffer.from('21010c000000000100010001010001016100','hex');
  assert.equal(inspectImage(Buffer.concat([sample.subarray(0,-1),text,Buffer.from([0x3b])])).frameCount,1);
  assert.throws(()=>inspectImage(Buffer.concat([sample.subarray(0,-1),...Array.from({length:300},()=>text),Buffer.from([0x3b])])),/300 frames/);
});
