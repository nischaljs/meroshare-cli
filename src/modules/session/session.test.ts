import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags, blockingReasons, openSession, LoginError } from './public.js';
import { listAccounts, setPendingPassword, accountId } from '../accounts/public.js';
import { startApp } from '../../../test/fake-meroshare/app.js';

test('flags: true, "true", 1 and "Y" are set; anything missing is false', () => {
  const f = parseFlags({ passwordExpired: 'true', accountExpired: 1, dematExpired: 'Y', changePassword: false, other: true });
  assert.equal(f.passwordExpired, true);
  assert.equal(f.accountExpired, true);
  assert.equal(f.dematExpired, true);
  assert.equal(f.changePassword, false);
  assert.equal(f.isTransactionPINNotSetBefore, false);
  assert.deepEqual(parseFlags(null), parseFlags({}));
});

test('every flag blocks except passwordPolicyChanged', () => {
  const all = parseFlags({
    passwordExpired: true, passwordPolicyChanged: true, changePassword: true, accountExpired: true,
    dematExpired: true, isTransactionPINNotSetBefore: true, isTransactionPINReset: true,
  });
  const flags = blockingReasons(all).map((b) => b.flag);
  assert.equal(flags.length, 6);
  assert.ok(!flags.includes('passwordPolicyChanged'));
  assert.deepEqual(blockingReasons(parseFlags({ passwordPolicyChanged: true })), []);
  assert.deepEqual(blockingReasons(parseFlags({ isTransactionPINNotSetBefore: true }))[0].fix, 'pin');
});

test('a healthy login opens a session with the token from the header', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p1', name: 'Ram' }] });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    assert.match(s.token, /^tok-u1-/);
    assert.equal(s.name, 'Ram');
    assert.deepEqual(s.blocked, []);
  } finally {
    await app.close();
  }
});

test('a refused password with no pending one is a LoginError, sent once', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p1' }] });
  try {
    app.fake.users.get('u1')!.password = 'changed-elsewhere';
    await assert.rejects(openSession(app.ctx, listAccounts(app.ctx)[0]), LoginError);
    assert.equal(app.fake.count('POST', '/meroShare/auth/'), 1);
  } finally {
    await app.close();
  }
});

test('pending password: kept when it is the live one, dropped when the stored one still works', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p1' }] });
  try {
    const id = accountId(listAccounts(app.ctx)[0]);
    setPendingPassword(app.ctx, id, 'p2');
    app.fake.users.get('u1')!.password = 'p2';
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    assert.equal(s.recoveredPending, true);
    assert.equal(listAccounts(app.ctx)[0].password, 'p2');
    assert.equal(listAccounts(app.ctx)[0].pendingPassword, '');

    setPendingPassword(app.ctx, id, 'p3');
    const s2 = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    assert.equal(s2.recoveredPending, false);
    assert.equal(listAccounts(app.ctx)[0].password, 'p2');
    assert.equal(listAccounts(app.ctx)[0].pendingPassword, '');
  } finally {
    await app.close();
  }
});
