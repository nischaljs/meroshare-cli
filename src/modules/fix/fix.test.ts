import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixesFor } from './public.js';
import { openSession } from '../session/public.js';
import { listAccounts } from '../accounts/public.js';
import { runDoctor, cachedReports } from '../health/public.js';
import { startApp, dayFrom } from '../../../test/fake-meroshare/app.js';

const NOW = new Date(2026, 10, 27, 10);

test('fixes come from the flags and the last check, PIN first', async () => {
  const app = await startApp({
    users: [
      { dpId: 1, username: 'a', password: 'p', name: 'A', flags: { isTransactionPINReset: true, passwordExpired: true } },
      { dpId: 1, username: 'b', password: 'p', name: 'B', ownDetail: { expiredDate: dayFrom(NOW, 5) } },
      { dpId: 1, username: 'c', password: 'p', name: 'C', flags: { passwordPolicyChanged: true } },
      { dpId: 1, username: 'd', password: 'p', name: 'D' },
    ],
    now: NOW,
  });
  try {
    await runDoctor(app.ctx);
    const reports = cachedReports(app.ctx);
    const kinds = [];
    for (const [i, a] of listAccounts(app.ctx).entries()) kinds.push(fixesFor(await openSession(app.ctx, a), reports[i]));
    assert.deepEqual(kinds, [['pin', 'password'], ['renewal'], ['password'], []]);
  } finally {
    await app.close();
  }
});
