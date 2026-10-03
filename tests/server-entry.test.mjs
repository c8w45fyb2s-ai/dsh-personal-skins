import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveHarnessHome } from '../src/server/index.js';

test('harness home follows $DSH_HOME then ~/.dsh', () => {
  assert.equal(resolveHarnessHome({ DSH_HOME: '/tmp/harness-home' }), '/tmp/harness-home');
  assert.equal(resolveHarnessHome({}), join(homedir(), '.dsh'));
  assert.equal(resolveHarnessHome({ DSH_HOME: '   ' }), join(homedir(), '.dsh'));
});

test('harness home expands a tilde prefix like the host does', () => {
  assert.equal(resolveHarnessHome({ DSH_HOME: '~' }), homedir());
  assert.equal(resolveHarnessHome({ DSH_HOME: join('~', 'custom') }), join(homedir(), 'custom'));
});
