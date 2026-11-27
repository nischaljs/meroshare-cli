import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planApply, runApply, autoApply, autoKitta, lockApply, ApplyBusyError } from './public.js';
import { startApp } from '../../../test/fake-meroshare/app.js';
import type { FakeUser } from '../../../test/fake-meroshare/server.js';
import type { Issue } from '../issues/public.js';

const issue = (over: Record<string, unknown> = {}) => ({
  companyShareId: 11, companyName: 'Hydro Ltd', shareTypeName: 'IPO', shareGroupName: 'Ordinary Shares', action: null, minUnit: 10, maxUnit: 100, ...over,
});
const user = (username: string, over: Partial<FakeUser> = {}): FakeUser => ({ dpId: 1, username, password: 'p', name: username, issues: [issue()], ...over });
const applies = (app: Awaited<ReturnType<typeof startApp>>) => app.fake.requests.filter((r) => r.path === '/meroShare/applicantForm/share/apply');

test('blocked accounts are skipped with the reason; the issue list comes from the first healthy account', async () => {
  const app = await startApp({ users: [user('blocked', { flags: { dematExpired: true } }), user('good1'), user('good2')] });
  try {
    const plan = await planApply(app.ctx);
    assert.deepEqual(plan.sessions.map((s) => s.account.username), ['good1', 'good2']);
    assert.equal(plan.skipped.length, 1);
    assert.match(plan.skipped[0].reason, /DEMAT account has expired .*fix: ipo fix blocked/);
    const lists = app.fake.requests.filter((r) => r.path === '/meroShare/companyShare/applicableIssue/');
    assert.deepEqual(lists.map((r) => r.user), ['good1']);
    assert.equal(plan.issues[0].companyName, 'Hydro Ltd');

    const results = await runApply(app.ctx, plan, [{ issue: plan.issues[0], kitta: 10 }]);
    assert.deepEqual(results.map((r) => `${r.account.username}:${r.status}`), ['blocked:skipped', 'good1:applied', 'good2:applied']);
    assert.deepEqual(applies(app).map((r) => r.user), ['good1', 'good2']);
    assert.equal((applies(app)[0].body as { appliedKitta: string }).appliedKitta, '10');
  } finally {
    await app.close();
  }
});

test("an account whose own issue has an action is not sent an apply", async () => {
  const app = await startApp({ users: [user('a'), user('b', { issues: [issue({ action: 'edit' })] }), user('c', { issues: [] })] });
  try {
    const plan = await planApply(app.ctx);
    const results = await runApply(app.ctx, plan, [{ issue: plan.issues[0], kitta: 10 }]);
    assert.deepEqual(results.map((r) => r.status), ['applied', 'already', 'skipped']);
    assert.deepEqual(applies(app).map((r) => r.user), ['a']);
  } finally {
    await app.close();
  }
});

test('a 409 counts as already applied; a 500 on apply fails and is not retried', async () => {
  const app = await startApp({ users: [user('a', { applyStatus: 409 }), user('b', { applyStatus: 500 })] });
  try {
    const plan = await planApply(app.ctx);
    const results = await runApply(app.ctx, plan, [{ issue: plan.issues[0], kitta: 10 }]);
    assert.deepEqual(results.map((r) => r.status), ['already', 'failed']);
    assert.equal(applies(app).length, 2);
  } finally {
    await app.close();
  }
});

test('no healthy account: no issue list is read', async () => {
  const app = await startApp({ users: [user('a', { flags: { passwordExpired: true } })] });
  try {
    const plan = await planApply(app.ctx);
    assert.equal(plan.sessions.length, 0);
    assert.equal(app.fake.count('POST', '/meroShare/companyShare/applicableIssue/'), 0);
  } finally {
    await app.close();
  }
});

test('auto-apply: categories by share type, kitta capped, below the minimum left out', async () => {
  assert.equal(autoKitta(issue() as Issue, 500), 100);
  assert.equal(autoKitta(issue() as Issue, 5), null);
  const app = await startApp({ users: [user('a', { issues: [issue(), issue({ companyShareId: 12, shareTypeName: 'FPO' })] })] });
  try {
    const { results } = await autoApply(app.ctx, { categories: ['IPO'], maxKitta: 20 });
    assert.deepEqual(results.map((r) => r.status), ['applied']);
    assert.deepEqual(applies(app).map((r) => (r.body as { companyShareId: number }).companyShareId), [11]);
  } finally {
    await app.close();
  }
});

test('a passed expiry date with no MeroShare flag warns only: the account still applies', async () => {
  const app = await startApp({ users: [user('a', { ownDetail: { expiredDate: '2020-01-01', dematExpiryDate: '2020-01-01' } })] });
  try {
    const plan = await planApply(app.ctx);
    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.reports[0].status, 'urgent');
    const results = await runApply(app.ctx, plan, [{ issue: plan.issues[0], kitta: 10 }]);
    assert.deepEqual(results.map((r) => r.status), ['applied']);
  } finally {
    await app.close();
  }
});

test('a second apply run stops while one holds the apply lock, and sends nothing', async () => {
  const app = await startApp({ users: [user('a')] });
  try {
    const held = lockApply(app.ctx);
    try {
      await assert.rejects(autoApply(app.ctx, { categories: ['IPO'], maxKitta: 20 }), (e: unknown) => e instanceof ApplyBusyError && e.message === 'Another ipo apply is running');
      assert.equal(app.fake.count('POST', '/meroShare/auth/'), 0);
    } finally {
      held.release();
    }
    const { results } = await autoApply(app.ctx, { categories: ['IPO'], maxKitta: 20 });
    assert.equal(results.length, 1);
  } finally {
    await app.close();
  }
});
