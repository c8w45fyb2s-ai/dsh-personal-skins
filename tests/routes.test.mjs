import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/server/store.js';
import { createFetchRoutes, createRouter } from '../src/server/routes.js';
import { GIF, APNG, WEBP } from './fixtures/animated-images.mjs';
import { png } from './fixtures/png.mjs';
async function fixture(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'dsh-route-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const handler=createRouter({store:createStore(dir)});
  const call=async(route,init={})=>{
    const req=Readable.from(init.body===undefined?[]:[Buffer.isBuffer(init.body)?init.body:Buffer.from(String(init.body))]);
    req.headers=Object.fromEntries(Object.entries(init.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
    req.headers.host ||= '127.0.0.1:4567';req.method=init.method||'GET';req.url=route;req.socket={remoteAddress:'127.0.0.1'};
    let status=0,headers={},body=Buffer.alloc(0);
    const res={headersSent:false,writeHead(s,h){status=s;headers=h;this.headersSent=true;return this;},end(data){if(data)body=Buffer.isBuffer(data)?data:Buffer.from(String(data));}};
    await handler(req,res);
    return {status,headers:{get:name=>Object.entries(headers).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1]??null},json:async()=>JSON.parse(body.toString()),arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)};
  };
  const writeHeaders={'X-DSH-Personal-Skins':'1','Content-Type':'application/json'};
  return {call,writeHeaders,store:createStore(dir)};
}
const json=async response=>response.json();

test('exact Fetch routes expose state, command lifecycle, upload, and asset read',async t=>{
  const {store}=await fixture(t), routes=createFetchRoutes({store});
  assert.deepEqual(routes.map(x=>[x.path,x.methods[0]]),[
    ['/api/personal-skins/state','GET'],['/api/personal-skins/command','POST'],['/api/personal-skins/upload','POST'],['/api/personal-skins/asset','GET'],
  ]);
  const invoke=(path,method='GET',body,headers={})=>routes.find(r=>r.path===path.split('?',1)[0]&&r.methods.includes(method)).fetch(new Request(`http://dsh.local${path}`,{method,headers:{...(method==='POST'?{'X-DSH-Personal-Skins':'1'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),...(body===undefined?{}:{duplex:'half'})}));
  assert.equal((await invoke('/api/personal-skins/state')).status,200);
  const h={'Content-Type':'application/json'};
  const created=await json(await invoke('/api/personal-skins/command','POST',{action:'create',name:'Local'},h));
  const id=created.presets[0].id;
  const changed=await json(await invoke('/api/personal-skins/command','POST',{action:'update',id,patch:{settings:{blur:4}}},h));
  assert.equal(changed.presets[0].settings.blur,4);
  const copy=await json(await invoke('/api/personal-skins/command','POST',{action:'duplicate',id},h));
  assert.equal(copy.presets.length,2);
  const active=await json(await invoke('/api/personal-skins/command','POST',{action:'activate',id},h));
  assert.equal(active.activePresetId,id);
  const deleted=await json(await invoke('/api/personal-skins/command','POST',{action:'remove',id},h));
  assert.equal(deleted.activePresetId,null);
  const uploaded=await invoke('/api/personal-skins/upload','POST',png(),{'Content-Type':'image/png'});
  assert.equal(uploaded.status,201);
  const asset=await uploaded.json();
  const fetched=await invoke(`/api/personal-skins/asset?id=${asset.id}`);
  assert.equal(fetched.status,200);assert.equal(fetched.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),png());
});

test('Node preview adapter enforces loopback, same-origin, CSRF marker, and traversal checks',async t=>{
  const {call}=await fixture(t);
  assert.equal((await call('/api/personal-skins/state')).status,200);
  assert.equal((await call('/api/personal-skins/state',{headers:{Origin:'http://evil.example'}})).status,403);
  assert.equal((await call('/api/personal-skins/state',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await call('/api/personal-skins/command',{method:'POST',headers:{Origin:'http://127.0.0.1'},body:'{}'})).status,403);
  assert.equal((await call('/api/personal-skins/state',{headers:{Origin:'dsh-app://app'}})).status,200);
  assert.equal((await call('/api/personal-skins/../state')).status,400);
  assert.equal((await call('/api/personal-skins/%2e%2e/state')).status,400);
  const outside=await call('/api/personal-skins/state',{headers:{Host:'evil.example'}});
  assert.equal(outside.status,403);
});

test('rejects malformed payloads, content type/signature mismatch, oversized uploads, and missing assets',async t=>{
  const {call,writeHeaders}=await fixture(t);
  assert.equal((await call('/api/personal-skins/command',{method:'POST',headers:{'X-DSH-Personal-Skins':'1','Content-Type':'text/plain'},body:'x'})).status,400);
  assert.equal((await call('/api/personal-skins/command',{method:'POST',headers:writeHeaders,body:'{bad'})).status,400);
  assert.equal((await call('/api/personal-skins/upload',{method:'POST',headers:{'X-DSH-Personal-Skins':'1','Content-Type':'image/jpeg'},body:png()})).status,400);
  assert.equal((await call('/api/personal-skins/upload',{method:'POST',headers:{'X-DSH-Personal-Skins':'1','Content-Type':'application/octet-stream'},body:png()})).status,400);
  const huge=Buffer.alloc(10*1024*1024+1);
  assert.equal((await call('/api/personal-skins/upload',{method:'POST',headers:{'X-DSH-Personal-Skins':'1','Content-Type':'image/png'},body:huge})).status,413);
  assert.equal((await call('/api/personal-skins/asset?id='+'f'.repeat(64)+'.png')).status,404);
  assert.equal((await call('/api/personal-skins/stateX')).status,404);
});

test('animation upload and retrieval preserve all frames with canonical content types',async t=>{
  const {call}=await fixture(t);
  for(const [bytes,mime,canonical] of [[GIF,'image/gif','image/gif'],[APNG,'image/apng','image/png'],[APNG,'image/png','image/png'],[WEBP,'image/webp','image/webp']]) {
    const upload=await call('/api/personal-skins/upload',{method:'POST',headers:{'X-DSH-Personal-Skins':'1','Content-Type':mime},body:bytes});
    assert.equal(upload.status,201);
    const asset=await upload.json(); assert.equal(asset.animated,true); assert.equal(asset.frameCount,3);
    const fetched=await call(`/api/personal-skins/asset?id=${asset.id}`);
    assert.equal(fetched.status,200); assert.equal(fetched.headers.get('content-type'),canonical);
    assert.equal(fetched.headers.get('x-content-type-options'),'nosniff');
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),bytes);
  }
  for(const [bytes,mime] of [[GIF,'image/png'],[APNG,'image/gif'],[WEBP,'image/apng'],[GIF.subarray(0,-1),'image/gif'],[APNG.subarray(0,-1),'image/apng'],[WEBP.subarray(0,-1),'image/webp']]) {
    assert.equal((await call('/api/personal-skins/upload',{method:'POST',headers:{'X-DSH-Personal-Skins':'1','Content-Type':mime},body:bytes})).status,400);
  }
});
