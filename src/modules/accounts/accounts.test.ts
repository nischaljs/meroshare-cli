import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountId, addAccount, findAccount, listAccounts, removeAccount, setPendingPassword, promotePendingPassword, clearPendingPassword } from './public.js';
import { startApp, accountFor } from '../../../test/fake-meroshare/app.js';

test('accounts: add, find by name, username or number, refuse a duplicate, remove', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p', name: 'Ram' }] });
  try {
    const sita = accountFor({ dpId: 1, username: 'u2', password: 'q', name: 'Sita' });
    assert.equal(addAccount(app.ctx, sita), 2);
    assert.throws(() => addAccount(app.ctx, sita), /already set up/);
    assert.equal(findAccount(app.ctx, 'sita').username, 'u2');
    assert.equal(findAccount(app.ctx, 'u1').name, 'Ram');
    assert.equal(findAccount(app.ctx, '2').name, 'Sita');
    assert.throws(() => findAccount(app.ctx, 'nobody'), /No account/);
    removeAccount(app.ctx, accountId(sita));
    assert.deepEqual(listAccounts(app.ctx).map((a) => a.name), ['Ram']);
  } finally {
    await app.close();
  }
});

test('password phases: set, promote and clear the pending password', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p', name: 'Ram' }] });
  try {
    const id = '1:u1';
    assert.equal(setPendingPassword(app.ctx, id, 'n').pendingPassword, 'n');
    assert.equal(clearPendingPassword(app.ctx, id).pendingPassword, '');
    setPendingPassword(app.ctx, id, 'n');
    const a = promotePendingPassword(app.ctx, id, 'n');
    assert.deepEqual([a.password, a.pendingPassword], ['n', '']);
  } finally {
    await app.close();
  }
});
