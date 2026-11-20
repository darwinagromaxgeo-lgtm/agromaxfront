import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadTs } from './helpers/loadTs.mjs';

const { restoreSession } = loadTs(fileURLToPath(new URL('../src/modules/auth/services/restoreSession.ts', import.meta.url)));
const user = { id: 'admin-test', role: 'ADMIN' };
const branches = [{ id: 'sausal', name: 'Sausal' }];

test('temporary network and backend errors preserve the recoverable session state', async () => {
  for (const error of [Error('Network Error'), { response: { status: 500 } }, { response: { status: 502 } }, { response: { status: 503 } }]) {
    assert.deepEqual(await restoreSession(async () => { throw error; }, async () => branches), { status: 'UNAVAILABLE' });
    assert.deepEqual(await restoreSession(async () => user, async () => { throw error; }), { status: 'UNAVAILABLE' });
  }
});

test('an invalid credential or unavailable account expires the session and does not load branch data', async () => {
  const fail = async () => { throw Error('Branch lookup must not run'); };
  assert.deepEqual(await restoreSession(async () => null, fail), { status: 'EXPIRED' });
  assert.deepEqual(await restoreSession(async () => { throw { response: { status: 401 } }; }, fail), { status: 'EXPIRED' });
  assert.deepEqual(await restoreSession(async () => user, async () => { throw { response: { status: 401 } }; }), { status: 'EXPIRED' });
});

test('retrying after a temporary failure restores the account and its branch access', async () => {
  let available = false;
  const loadUser = async () => { if (!available) throw { response: { status: 503 } }; return user; };
  assert.equal((await restoreSession(loadUser, async () => branches)).status, 'UNAVAILABLE');
  available = true;
  assert.deepEqual(await restoreSession(loadUser, async () => branches), { status: 'AUTHENTICATED', user, branches });
});
