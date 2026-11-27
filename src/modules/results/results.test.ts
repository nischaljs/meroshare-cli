import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allotmentOf, checkResults } from './public.js';
import { startApp } from '../../../test/fake-meroshare/app.js';

test('allotment: received kitta wins; block failures are errors', () => {
  assert.equal(allotmentOf('Not Alloted', 10), 'allotted');
  assert.equal(allotmentOf('Not Alloted', 0), 'not_allotted');
  assert.equal(allotmentOf('BLOCK_FAILED', undefined), 'error');
});

test('results per account; a blocked account is an error row with no report call', async () => {
  const app = await startApp({
    users: [
      { dpId: 1, username: 'a', password: 'p', name: 'A', reports: [{ applicantFormId: 5, companyName: 'Hydro Ltd', statusName: 'Alloted' }], reportDetail: { receivedKitta: 10, appliedKitta: 10 } },
      { dpId: 1, username: 'b', password: 'p', name: 'B', flags: { accountExpired: true } },
    ],
  });
  try {
    const rows = await checkResults(app.ctx);
    assert.deepEqual(rows.map((r) => [r.account.name, r.company, r.status, r.received ?? null]), [
      ['A', 'Hydro Ltd', 'allotted', 10],
      ['B', '-', 'error', null],
    ]);
    assert.deepEqual(app.fake.requests.filter((r) => r.path === '/meroShare/applicantForm/active/search/').map((r) => r.user), ['a']);
    assert.match(rows[1].message, /ipo doctor/);
  } finally {
    await app.close();
  }
});
