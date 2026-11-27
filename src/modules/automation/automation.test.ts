import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDaily, DAILY_STEPS, AutoSection, type AutomationStep } from './public.js';
import { accountId, listAccounts, setPendingPassword } from '../accounts/public.js';
import { cachedReports, markPasswordUnconfirmed, runDoctor } from '../health/public.js';
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

test('auto-apply off: health and warnings run, nothing is applied', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p', name: 'Ram', issues: [issue] }] });
  try {
    const bag = await runDaily(app.ctx, settings({ enabled: false }));
    assert.equal(app.fake.count('POST', '/meroShare/applicantForm/share/apply'), 0);
    assert.ok(bag.lines.some((l) => l.startsWith('health: 1 account(s) checked')));
    assert.ok(bag.lines.includes('apply: Auto-apply is off. Turn it on with ipo auto config.'));
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

test('one login per account per run: steps share it; a failed login is not tried again', async () => {
  const due = { ownDetail: { passwordExpiryDate: dayFrom(NOW, 3), expiredDate: dayFrom(NOW, 200) } };
  const app = await startApp({
    users: [
      { dpId: 1, username: 'good', password: 'Good-Pass1!', name: 'Good', issues: [{ ...issue, action: null }] },
      { dpId: 1, username: 'rotates', password: 'Old-Pass1!', name: 'Rotates', issues: [{ ...issue, action: null }], ...due },
      { dpId: 1, username: 'wrong', password: 'Wrong-Pass1!', name: 'Wrong', issues: [{ ...issue, action: null }] },
      { dpId: 1, username: 'pending', password: 'Pend-Pass1!', name: 'Pending', issues: [{ ...issue, action: null }] },
    ],
    now: NOW,
  });
  const logins = (username: string) =>
    app.fake.requests.filter((r) => r.path === '/meroShare/auth/' && (r.body as { username?: string })?.username === username).length;
  try {
    // the store's password is wrong for these two; "pending" has the right one as pending
    app.fake.users.get('wrong')!.password = 'Server-Pass1!';
    app.fake.users.get('pending')!.password = 'Pend-New1!';
    const pending = listAccounts(app.ctx).find((a) => a.username === 'pending')!;
    setPendingPassword(app.ctx, accountId(pending), 'Pend-New1!');

    const bag = await runDaily(app.ctx, settings({ autoPassword: true }));

    assert.equal(logins('good'), 1, bag.lines.join('\n'));
    assert.equal(logins('rotates'), 2); // the run's login, then the one that proves the new password
    assert.equal(logins('wrong'), 1); // no pending: one password try, then every step skips it
    assert.equal(logins('pending'), 2); // stored then pending, inside the one attempt
    assert.ok(bag.lines.some((l) => l.startsWith('apply: skipped Wrong')));
    const applied = app.fake.requests.filter((r) => r.path === '/meroShare/applicantForm/share/apply').map((r) => r.user);
    assert.deepEqual([...applied].sort(), ['good', 'pending', 'rotates']);
    const wrong = cachedReports(app.ctx).find((r) => r.account.username === 'wrong')!;
    assert.equal(wrong.status, 'error');
    assert.ok(wrong.snapshot.error);
  } finally {
    await app.close();
  }
});

test('a wrong pending password counts inside the one attempt: two tries at most', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'Old-Pass1!', name: 'Ram', issues: [issue] }], now: NOW });
  try {
    app.fake.users.get('u1')!.password = 'Server-Pass1!';
    setPendingPassword(app.ctx, accountId(listAccounts(app.ctx)[0]), 'Also-Wrong1!');
    await runDaily(app.ctx, settings({ autoPassword: true }));
    assert.equal(app.fake.requests.filter((r) => r.path === '/meroShare/auth/').length, 2);
  } finally {
    await app.close();
  }
});

// the fake marks an issue applied on the object it was given: each user gets its own copy
const fresh = () => ({ ...issue, action: null });

const loginsOf = (app: { fake: { requests: { path: string; body?: unknown }[] } }, username: string) =>
  app.fake.requests.filter((r) => r.path === '/meroShare/auth/' && (r.body as { username?: string })?.username === username).length;

test('a blocked account is held: no login in later runs, the report and email still say to run ipo fix', async () => {
  const app = await startApp({
    users: [
      { dpId: 1, username: 'ok', password: 'Ok-Pass1!', name: 'Sita', issues: [fresh()] },
      { dpId: 1, username: 'dead', password: 'Dead-Pass1!', name: 'Ram', flags: { accountExpired: true }, issues: [fresh()] },
    ],
    now: NOW,
    email: true,
  });
  try {
    await runDaily(app.ctx, settings());
    assert.equal(loginsOf(app, 'dead'), 1); // the run that finds the block logs in once
    const before = cachedReports(app.ctx).find((r) => r.account.username === 'dead')!.snapshot;

    // a new issue opens, so the second run applies for Sita and sends the results email
    for (const u of ['ok', 'dead']) app.fake.users.get(u)!.issues!.push({ ...fresh(), companyShareId: 12, companyName: 'Solar Ltd' });
    app.emails.length = 0;
    const bag = await runDaily(app.ctx, settings());
    assert.equal(loginsOf(app, 'dead'), 1, bag.lines.join('\n')); // no login in the second run
    assert.equal(loginsOf(app, 'ok'), 2);
    assert.ok(bag.lines.includes('health: skipped Ram: blocked: MeroShare account has expired. No login until it is fixed: run "ipo fix Ram"'), bag.lines.join('\n'));
    assert.ok(bag.lines.some((l) => l.startsWith('apply: skipped Ram: blocked: MeroShare account has expired') && l.includes('ipo fix Ram')));
    // the saved check is kept as it was, so the account stays held
    assert.deepEqual(cachedReports(app.ctx).find((r) => r.account.username === 'dead')!.snapshot, before);
    const mail = app.emails.find((e) => e.subject === '[IPO CLI] IPO application results');
    assert.ok(mail && mail.text.includes('Ram - Solar Ltd: skipped') && mail.text.includes('ipo fix Ram'), mail?.text);

    // fixed on MeroShare, then the person's own check (what ipo fix and ipo doctor run) clears the hold
    app.fake.users.get('dead')!.flags = {};
    await runDoctor(app.ctx);
    assert.equal(loginsOf(app, 'dead'), 2);
    const after = await runDaily(app.ctx, settings());
    assert.equal(loginsOf(app, 'dead'), 3);
    assert.ok(!after.lines.some((l) => l.includes('skipped Ram')), after.lines.join('\n'));
  } finally {
    await app.close();
  }
});

test('a password ipo could not confirm: the next run makes no login (before: stored and pending, two tries)', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'Old-Pass1!', name: 'Ram', issues: [fresh()] }], now: NOW });
  try {
    const account = listAccounts(app.ctx)[0];
    app.fake.users.get('u1')!.password = 'Server-Pass1!';
    setPendingPassword(app.ctx, accountId(account), 'New-Pass1!');
    markPasswordUnconfirmed(app.ctx, account);
    const bag = await runDaily(app.ctx, settings({ autoPassword: true }));
    assert.equal(app.fake.count('POST', '/meroShare/auth/'), 0);
    assert.equal(app.fake.count('POST', '/meroShare/changePassword/'), 0);
    const line = bag.lines.find((l) => l.startsWith('health: skipped Ram'));
    assert.ok(line?.includes('ipo init edit (check the password of Ram), then run "ipo fix Ram"'), bag.lines.join('\n'));
  } finally {
    await app.close();
  }
});

test('an expired password: held while autoPassword is off, changed by the next run once it is on', async () => {
  const app = await startApp({
    users: [{ dpId: 1, username: 'u1', password: 'Old-Pass1!', name: 'Ram', flags: { passwordExpired: true }, issues: [fresh()] }],
    now: NOW,
  });
  try {
    await runDaily(app.ctx, settings());
    await runDaily(app.ctx, settings());
    assert.equal(loginsOf(app, 'u1'), 1); // found blocked once, then held
    assert.equal(app.fake.count('POST', '/meroShare/changePassword/'), 0);

    const bag = await runDaily(app.ctx, settings({ autoPassword: true }));
    assert.equal(app.fake.count('POST', '/meroShare/changePassword/'), 1, bag.lines.join('\n'));
    assert.ok(bag.lines.some((l) => l.startsWith('password: Ram (password expired): changed')));
    assert.equal(app.fake.count('POST', '/meroShare/applicantForm/share/apply'), 1, bag.lines.join('\n'));
    assert.notEqual(listAccounts(app.ctx)[0].password, 'Old-Pass1!');
  } finally {
    await app.close();
  }
});

test('an expired password with a block the change does not fix is held even with autoPassword on', async () => {
  const app = await startApp({
    users: [{ dpId: 1, username: 'u1', password: 'Old-Pass1!', name: 'Ram', flags: { passwordExpired: true, dematExpired: true }, issues: [fresh()] }],
    now: NOW,
  });
  try {
    await runDaily(app.ctx, settings({ autoPassword: true }));
    const bag = await runDaily(app.ctx, settings({ autoPassword: true }));
    assert.equal(loginsOf(app, 'u1'), 1);
    assert.equal(app.fake.count('POST', '/meroShare/changePassword/'), 0);
    assert.ok(bag.lines.some((l) => l.startsWith('password: skipped Ram: blocked:')), bag.lines.join('\n'));
  } finally {
    await app.close();
  }
});
