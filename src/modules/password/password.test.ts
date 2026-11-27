import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePassword, rotatePassword, rotationReason, parsePolicy, checkPassword, PasswordChangeBlockedError } from './public.js';
import { openSession } from '../session/public.js';
import { listAccounts, setPendingPassword, accountId } from '../accounts/public.js';
import { runDoctor, cachedReports } from '../health/public.js';
import { startApp, dayFrom } from '../../../test/fake-meroshare/app.js';
import type { FakeUser } from '../../../test/fake-meroshare/server.js';

const NOW = new Date(2026, 10, 27, 10);
const u = (over: Partial<FakeUser> = {}): FakeUser => ({ dpId: 1, username: 'u1', password: 'old-Pass1!', name: 'Ram', ...over });
const changes = (app: Awaited<ReturnType<typeof startApp>>) => app.fake.count('POST', '/meroShare/changePassword/');

test('change success: the new password is stored, pending cleared, a notice sent', async () => {
  const app = await startApp({ users: [u({ flags: { passwordExpired: true } })], email: true });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    assert.deepEqual(await changePassword(app.ctx, s, 'New-Pass2!'), { status: 'changed' });
    const a = listAccounts(app.ctx)[0];
    assert.equal(a.password, 'New-Pass2!');
    assert.equal(a.pendingPassword, '');
    assert.equal(app.fake.users.get('u1')!.password, 'New-Pass2!');
    assert.equal(app.emails[0].subject, '[IPO CLI] MeroShare password changed');
    assert.ok(!app.emails[0].text.includes('New-Pass2!'));
  } finally {
    await app.close();
  }
});

test('change refused (4xx): old password kept, pending cleared, sent once', async () => {
  const app = await startApp({ users: [u({ changePassword: 'reject' })] });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    const out = await changePassword(app.ctx, s, 'New-Pass2!');
    assert.equal(out.status, 'rejected');
    const a = listAccounts(app.ctx)[0];
    assert.equal(a.password, 'old-Pass1!');
    assert.equal(a.pendingPassword, '');
    assert.equal(changes(app), 1);
  } finally {
    await app.close();
  }
});

test('no clear answer (5xx after the change): pending kept, never retried, the next login settles it', async () => {
  const app = await startApp({ users: [u({ changePassword: 'drop' })] });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    const out = await changePassword(app.ctx, s, 'New-Pass2!');
    assert.equal(out.status, 'unknown');
    assert.equal(changes(app), 1);
    assert.equal(listAccounts(app.ctx)[0].pendingPassword, 'New-Pass2!');
    const s2 = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    assert.equal(s2.recoveredPending, true);
    assert.equal(listAccounts(app.ctx)[0].password, 'New-Pass2!');
    assert.equal(listAccounts(app.ctx)[0].pendingPassword, '');
  } finally {
    await app.close();
  }
});

test('crash between the pending write and the change: the next login keeps the old password', async () => {
  const app = await startApp({ users: [u()] });
  try {
    // the process wrote pending and died before the request left
    setPendingPassword(app.ctx, accountId(listAccounts(app.ctx)[0]), 'Never-Sent3!');
    await openSession(app.ctx, listAccounts(app.ctx)[0]);
    const a = listAccounts(app.ctx)[0];
    assert.equal(a.password, 'old-Pass1!');
    assert.equal(a.pendingPassword, '');
    assert.equal(changes(app), 0);
  } finally {
    await app.close();
  }
});

test('no change is sent when something other than the password blocks', async () => {
  const app = await startApp({ users: [u({ flags: { accountExpired: true } })] });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    await assert.rejects(changePassword(app.ctx, s, 'New-Pass2!'), PasswordChangeBlockedError);
    assert.equal(changes(app), 0);
    assert.equal(listAccounts(app.ctx)[0].pendingPassword, '');
  } finally {
    await app.close();
  }
});

test('rotation: a generated password that meets the server rules', async () => {
  const app = await startApp({ users: [u()], policy: { minLength: 12, upperCase: 2, lowerCase: 2, digit: 2, specialCharacter: 1 } });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    assert.equal((await rotatePassword(app.ctx, s)).status, 'changed');
    const pw = listAccounts(app.ctx)[0].password;
    assert.notEqual(pw, 'old-Pass1!');
    assert.ok(pw.length >= 12);
  } finally {
    await app.close();
  }
});

test('rotation reasons: a flag, or expiry within 7 days', async () => {
  const app = await startApp({ users: [u({ ownDetail: { passwordExpiryDate: dayFrom(NOW, 7) } }), u({ username: 'u2', ownDetail: { passwordExpiryDate: dayFrom(NOW, 8) } }), u({ username: 'u3', flags: { passwordPolicyChanged: true } })], now: NOW });
  try {
    await runDoctor(app.ctx);
    const [a, b, c] = cachedReports(app.ctx);
    assert.match(rotationReason(a, NOW)!, /expires/);
    assert.equal(rotationReason(b, NOW), null);
    assert.equal(rotationReason(c, NOW), 'password rules changed');
  } finally {
    await app.close();
  }
});

test('policy: read by key names, fallback when absent; check names the gaps', () => {
  assert.deepEqual(parsePolicy({ object: { minPasswordLength: 10, upperCaseCount: 2 } }).policy.minLength, 10);
  assert.equal(parsePolicy({}).fromServer, false);
  const p = parsePolicy({}).policy;
  assert.ok(checkPassword(p, 'short').length > 0);
  assert.deepEqual(checkPassword(p, 'Good-Pass1'), []);
  assert.ok(checkPassword(p, 'Good-Pass1', 'Good-Pass1').length > 0);
});
