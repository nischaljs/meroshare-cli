import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDoctor, expiryBanner, dueReminders, markRemindersSent, findingsFor, toDay, daysLeft, cachedReports, type HealthSnapshot } from './public.js';
import { noFlags } from '../session/public.js';
import { startApp, dayFrom } from '../../../test/fake-meroshare/app.js';
import type { FakeUser } from '../../../test/fake-meroshare/server.js';

const NOW = new Date(2026, 10, 27, 10, 0, 0);
const far = { passwordExpiryDate: dayFrom(NOW, 200), expiredDate: dayFrom(NOW, 300), dematExpiryDate: dayFrom(NOW, 400) };

function snap(over: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    name: 'A', checkedAt: NOW.toISOString(), passwordExpiry: null, meroshareExpiry: null, dematExpiry: null,
    flags: noFlags(), pin: 'set', bankLinked: true, error: null, ...over,
  };
}

async function doctorOne(u: Partial<FakeUser>) {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p1', name: 'Ram', ownDetail: far, ...u }], now: NOW });
  try {
    const [r] = await runDoctor(app.ctx);
    return { r, app, ownDetailCalls: app.fake.count('GET', '/meroShare/ownDetail/') };
  } finally {
    await app.close();
  }
}

test('healthy: ok, no fix, details read', async () => {
  const { r, ownDetailCalls } = await doctorOne({});
  assert.equal(r.status, 'ok');
  assert.equal(r.fix, null);
  assert.equal(r.snapshot.passwordExpiry, far.passwordExpiryDate);
  assert.equal(ownDetailCalls, 1);
});

for (const [name, flags, fix] of [
  ['password expired', { passwordExpired: true }, 'ipo fix Ram'],
  ['account expired', { accountExpired: true }, 'ipo fix Ram'],
  ['demat expired', { dematExpired: true }, 'ipo fix Ram'],
  ['PIN not set', { isTransactionPINNotSetBefore: true }, 'ipo fix Ram'],
] as const) {
  test(`${name}: blocked from the login flags, no further call`, async () => {
    const { r, ownDetailCalls } = await doctorOne({ flags });
    assert.equal(r.status, 'blocked');
    assert.equal(r.fix, fix);
    assert.equal(ownDetailCalls, 0);
  });
}

test('PIN not set records the PIN state', async () => {
  const { r } = await doctorOne({ flags: { isTransactionPINNotSetBefore: true } });
  assert.equal(r.snapshot.pin, 'not set');
  assert.equal(r.findings[0].fix, 'pin');
});

test('401 Role Not Authorized after login: blocked, pointing at the account', async () => {
  const { r } = await doctorOne({ ownDetail: 'roleNotAuthorized' });
  assert.equal(r.status, 'blocked');
  assert.match(r.findings[0].message, /Role Not Authorized/);
});

test('passwordPolicyChanged alone warns, does not block', async () => {
  const { r } = await doctorOne({ flags: { passwordPolicyChanged: true } });
  assert.equal(r.status, 'warn');
});

test('health days: expired, urgent within 7, warn within 30, nothing beyond', () => {
  const sev = (d: number) => findingsFor(snap({ meroshareExpiry: dayFrom(NOW, d) }), NOW)[0]?.severity ?? 'none';
  assert.equal(sev(-1), 'urgent'); // a computed date warns; only MeroShare blocks
  assert.equal(sev(0), 'urgent');
  assert.equal(sev(7), 'urgent');
  assert.equal(sev(8), 'warn');
  assert.equal(sev(30), 'warn');
  assert.equal(sev(31), 'none');
  assert.equal(daysLeft('2026-12-01', NOW), 4);
  assert.equal(toDay('2026-12-01T00:00:00'), '2026-12-01');
  assert.equal(toDay(''), null);
});

test('an expired date the flags already report is said once', () => {
  const f = findingsFor(snap({ flags: { ...noFlags(), accountExpired: true }, meroshareExpiry: dayFrom(NOW, -3) }), NOW);
  assert.equal(f.length, 1);
});

test('the banner comes from the cache, with no MeroShare call; a failed login keeps the dates', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p1', name: 'Ram', ownDetail: { ...far, expiredDate: dayFrom(NOW, 12) } }], now: NOW });
  try {
    assert.equal(expiryBanner(app.ctx), null);
    await runDoctor(app.ctx);
    const calls = app.fake.requests.length;
    assert.match(expiryBanner(app.ctx)!, /Ram: MeroShare account expires in 12 days .*Run "ipo doctor"\./);
    assert.equal(app.fake.requests.length, calls);

    app.fake.users.get('u1')!.password = 'changed';
    await runDoctor(app.ctx);
    const [r] = cachedReports(app.ctx);
    assert.equal(r.snapshot.meroshareExpiry, dayFrom(NOW, 12));
    assert.ok(r.snapshot.error);
  } finally {
    await app.close();
  }
});

test('reminders: one per threshold per expiry, the larger ones marked with it', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p1', ownDetail: { ...far, expiredDate: dayFrom(NOW, 10) } }], now: NOW });
  try {
    await runDoctor(app.ctx);
    const due = dueReminders(app.ctx, [30, 14, 7, 3, 1]);
    assert.equal(due.length, 1);
    assert.equal(due[0].threshold, 14);
    assert.equal(due[0].keys.length, 2);
    markRemindersSent(app.ctx, due[0].keys);
    assert.deepEqual(dueReminders(app.ctx, [30, 14, 7, 3, 1]), []);
    app.setNow(new Date(2026, 11, 2, 10));
    assert.equal(dueReminders(app.ctx, [30, 14, 7, 3, 1])[0].threshold, 7);
  } finally {
    await app.close();
  }
});
