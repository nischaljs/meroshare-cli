import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/platform/store/public.js';
import { EmailSection } from '../src/platform/notify/public.js';
import { AccountsSection } from '../src/modules/accounts/public.js';
import { AutoSection } from '../src/modules/automation/public.js';
import { HealthSection } from '../src/modules/health/public.js';
import { tempHome } from './fake-meroshare/app.js';

// written by the code on master (src/store/crypto.ts), before this change
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-v1.json');

test('a version 1 config opens with the same master password and reads every value', () => {
  const home = tempHome();
  const file = path.join(home, 'config.json');
  fs.copyFileSync(FIXTURE, file);
  const before = fs.readFileSync(file, 'utf-8');

  const store = new Store({ home });
  store.unlock('fixture-master-1');
  const accounts = store.section(AccountsSection).read();
  assert.equal(accounts.revision, 0);
  assert.deepEqual(accounts.value.map((a) => [a.name, a.password, a.crn, a.pin, a.pendingPassword]), [
    ['Ram', 'ram-Pass1!', 'CRN-00000001', '1234', ''],
    ['Sita', 'sita-Pass1!', 'CRN-00000002', '1234', ''],
  ]);
  assert.deepEqual(store.section(AutoSection).read().value, {
    enabled: true, categories: ['IPO'], sectors: [], maxKitta: 10, schedule: '0 10 * * *', autoPassword: false,
  });
  const email = store.section(EmailSection).read().value!;
  assert.equal(email.appPassword, 'app-secret');
  assert.equal(email.events.notAllocated, false);
  assert.deepEqual(store.section(HealthSection).read().value, { snapshots: {}, remindersSent: [], blockedNotified: {} });

  // reading never rewrites the file
  assert.equal(fs.readFileSync(file, 'utf-8'), before);
});

test('the first save writes version 2 and keeps the other sections and the master password', () => {
  const home = tempHome();
  const file = path.join(home, 'config.json');
  fs.copyFileSync(FIXTURE, file);
  const store = new Store({ home });
  store.unlock('fixture-master-1');
  store.section(AutoSection).update((a) => ({ ...a, autoPassword: true }));

  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const old = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'));
  assert.equal(raw.version, 2);
  assert.deepEqual(raw.revisions, { auto: 1 });
  assert.deepEqual(raw.accounts, old.accounts);
  assert.deepEqual(raw.email, old.email);
  assert.equal(raw.masterPasswordHash, old.masterPasswordHash);

  const again = new Store({ home });
  again.unlock('fixture-master-1');
  assert.equal(again.section(AccountsSection).read().value[1].password, 'sita-Pass1!');
  assert.equal(again.section(AutoSection).read().value.autoPassword, true);
});
