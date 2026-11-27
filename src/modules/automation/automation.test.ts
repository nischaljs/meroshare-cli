import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDaily, DAILY_STEPS, AutoSection, type AutomationStep } from './public.js';
import { listAccounts } from '../accounts/public.js';
import { startApp, dayFrom } from '../../../test/fake-meroshare/app.js';

const NOW = new Date(2026, 10, 27, 10);
const issue = { companyShareId: 11, companyName: 'Hydro Ltd', shareTypeName: 'IPO', action: null, minUnit: 10, maxUnit: 100 };
const settings = (over = {}) => ({ enabled: true, categories: ['IPO'], sectors: [], maxKitta: 10, schedule: '0 10 * * *', autoPassword: false, ...over });

test('the job order is health, password, warnings, apply', () => {
  assert.deepEqual([...DAILY_STEPS].sort((a, b) => a.order - b.order).map((s) => s.name), ['health', 'password', 'renewal-warnings', 'apply']);
});

test('autoPassword off: an expired password is not changed and the account is skipped', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p', name: 'Ram', flags: { passwordExpired: true }, issues: [issue] }] });
  try {
    const bag = await runDaily(app.ctx, settings());
    assert.equal(app.fake.count('POST', '/meroShare/changePassword/'), 0);
    assert.ok(bag.lines.some((l) => l.startsWith('apply: skipped Ram')));
  } finally {
    await app.close();
  }
});

test('autoPassword on: the password is rotated first, then the account applies', async () => {
  const app = await startApp({
    users: [{ dpId: 1, username: 'u1', password: 'Old-Pass1!', name: 'Ram', ownDetail: { passwordExpiryDate: dayFrom(NOW, 5), expiredDate: dayFrom(NOW, 14) }, issues: [issue] }],
    now: NOW,
    email: true,
  });
  try {
    const bag = await runDaily(app.ctx, settings({ autoPassword: true }));
    const paths = app.fake.requests.map((r) => r.path);
    const change = paths.indexOf('/meroShare/changePassword/');
    const apply = paths.indexOf('/meroShare/applicantForm/share/apply');
    assert.ok(change > 0 && apply > change, bag.lines.join('\n'));
    assert.notEqual(listAccounts(app.ctx)[0].password, 'Old-Pass1!');
    assert.deepEqual(app.emails.map((e) => e.subject), [
      '[IPO CLI] MeroShare password changed',
      '[IPO CLI] MeroShare account of Ram expires in 14 days',
      '[IPO CLI] IPO application results',
    ]);
  } finally {
    await app.close();
  }
});

test('a step is added by the list only, runs by its order, and a failing step does not stop the rest', async () => {
  const app = await startApp({ users: [] });
  try {
    const ran: string[] = [];
    const step = (name: string, order: number, fail = false): AutomationStep => ({
      name,
      order,
      async run() {
        ran.push(name);
        if (fail) throw new Error('boom');
      },
    });
    const bag = await runDaily(app.ctx, settings(), [step('late', 50), step('early', 5, true), step('mid', 25)]);
    assert.deepEqual(ran, ['early', 'mid', 'late']);
    assert.deepEqual(bag.lines, ['early: failed: boom']);
  } finally {
    await app.close();
  }
});

test('auto settings from an old file get autoPassword off', async () => {
  const app = await startApp({ users: [] });
  try {
    assert.equal(app.ctx.store.section(AutoSection).read().value.autoPassword, false);
  } finally {
    await app.close();
  }
});
