import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientApi } from '../src/client/api.js';

function recordingFetch(calls) {
  return async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ schemaVersion: 1, activePresetId: null, presets: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

test('client requests stay carrier-relative and carry the write token', async () => {
  const calls = [];
  const api = createClientApi({ fetch: recordingFetch(calls) });

  await api.state();
  assert.equal(calls[0].url, 'api/personal-skins/state');
  assert.ok(!calls[0].url.startsWith('/'), 'a leading slash would bypass the host mount point');
  assert.equal(calls[0].init.method, 'GET');

  await api.create('demo');
  assert.equal(calls[1].url, 'api/personal-skins/command');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.get('x-dsh-personal-skins'), '1');
  assert.equal(calls[1].init.headers.get('content-type'), 'application/json');
  api.dispose();
});

test('image upload posts the raw bytes to the relative route', async () => {
  const calls = [];
  const api = createClientApi({ fetch: recordingFetch(calls) });

  await api.upload(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
  assert.equal(calls[0].url, 'api/personal-skins/upload');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.get('content-type'), 'image/png');
  assert.equal(calls[0].init.headers.get('x-dsh-personal-skins'), '1');
  api.dispose();
});
