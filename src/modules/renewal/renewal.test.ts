import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeLines, maxYears, listPartners, renewalDetails, startPayment, sendRenewalReminders } from './public.js';
import { openSession } from '../session/public.js';
import { listAccounts } from '../accounts/public.js';
import { runDoctor } from '../health/public.js';
import { startApp, dayFrom } from '../../../test/fake-meroshare/app.js';

const NOW = new Date(2026, 10, 27, 10);

test('charges are shown as the server states them; years default to 1', () => {
  assert.deepEqual(chargeLines({ meroshareRenewCharge: 50, dematRenewCharge: '100' }), [
    'MeroShare renewal: Rs. 50 (as MeroShare states it)',
    'DEMAT renewal: Rs. 100 per year (as MeroShare states it)',
  ]);
  assert.deepEqual(chargeLines({}), ['MeroShare did not state the charges.']);
  assert.equal(maxYears({ dematMaxRenewalYear: '3' }), 3);
  assert.equal(maxYears({}), 1);
});

test('payment: partner, details, one payment request, a local page with the fields', async () => {
  const app = await startApp({ users: [{ dpId: 1, username: 'u1', password: 'p', flags: { accountExpired: true } }] });
  try {
    const s = await openSession(app.ctx, listAccounts(app.ctx)[0]);
    const [partner] = await listPartners(app.ctx, s);
    const d = await renewalDetails(app.ctx, s, partner);
    assert.equal(maxYears(d), 3);
    const { form } = await startPayment(app.ctx, s, { partner, paymentTypes: ['MEROSHARE'], years: 1 }, { open: false });
    assert.equal(form.url, 'http://127.0.0.1:9/wallet');
    assert.deepEqual(form.fields, [{ name: 'amount', value: '150' }, { name: 'ref', value: 'R1' }]);
    assert.equal(app.fake.count('POST', '/payment/'), 1);
    assert.deepEqual(app.fake.requests.find((r) => r.path === '/payment/')!.body, { partnerConfigId: 3, paymentTypeList: ['MEROSHARE'], renewalYear: 1 });
  } finally {
    await app.close();
  }
});

test('renewal emails: each threshold once; a failed email is tried again next time', async () => {
  const app = await startApp({
    users: [{ dpId: 1, username: 'u1', password: 'p', name: 'Ram', ownDetail: { expiredDate: dayFrom(NOW, 3), dematExpiryDate: dayFrom(NOW, 90) } }],
    now: NOW,
    email: true,
  });
  try {
    await runDoctor(app.ctx);
    assert.equal(await sendRenewalReminders(app.ctx), 1);
    assert.match(app.emails[0].subject, /MeroShare account of Ram expires in 3 days/);
    assert.equal(await sendRenewalReminders(app.ctx), 0);
    app.setNow(new Date(2026, 10, 29, 10));
    assert.equal(await sendRenewalReminders(app.ctx), 1);
    assert.equal(app.emails.length, 2);
  } finally {
    await app.close();
  }
});
