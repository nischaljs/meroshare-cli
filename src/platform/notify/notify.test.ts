import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../store/public.js';
import { createNotifier, EmailSection, type EmailMessage } from './public.js';

const smtp = { email: 'me@example.test', appPassword: 'app', smtpHost: 'smtp.example.test', smtpPort: 587 };

test('a notice prints always and emails only when email is set and the kind is on', async () => {
  const store = new Store({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-notify-')) });
  store.create('pw');
  const sent: EmailMessage[] = [];
  const printed: string[] = [];
  const n = createNotifier(store, { print: (l) => printed.push(l), transport: async (_s, m) => void sent.push(m) });

  assert.deepEqual(await n.send({ kind: 'applied', subject: 'S', lines: ['x'] }), { terminal: true, email: 'off' });
  store.section(EmailSection).update(() => ({ ...smtp, events: { notAllocated: false } }));
  assert.equal((await n.send({ kind: 'applied', account: 'Ram', subject: 'S', lines: ['x'] })).email, 'sent');
  assert.equal((await n.send({ kind: 'notAllocated', subject: 'S', lines: ['x'] })).email, 'off');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, '[IPO CLI] S');
  assert.match(sent[0].text, /Account: Ram/);
  assert.equal(printed.length, 3);
});

test('a failed email is reported, not thrown', async () => {
  const store = new Store({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-notify-')) });
  store.create('pw');
  store.section(EmailSection).update(() => ({ ...smtp, events: {} }));
  const n = createNotifier(store, { print: null, transport: async () => { throw new Error('smtp down'); } });
  assert.deepEqual(await n.send({ kind: 'renewalDue', subject: 'S', lines: [] }), { terminal: false, email: 'failed', error: 'smtp down' });
});
