import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { Store, defineSection, LOCKED, StaleRevisionError, StoreLockedError, WrongMasterPasswordError } from './public.js';

const Notes = defineSection('notes', ({ secret }) =>
  z.object({ title: z.string().default(''), token: secret().default('') }).prefault({}),
);

function home(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-store-'));
}

test('a section reads its default, then what was written; secrets are encrypted on disk', () => {
  const h = home();
  const store = new Store({ home: h });
  store.create('pw');
  assert.deepEqual(store.section(Notes).read(), { value: { title: '', token: '' }, revision: 0 });
  store.section(Notes).update((n) => ({ ...n, title: 'a', token: 'hush' }));
  const raw = JSON.parse(fs.readFileSync(path.join(h, 'config.json'), 'utf-8'));
  assert.equal(raw.version, 2);
  assert.equal(raw.notes.title, 'a');
  assert.notEqual(raw.notes.token, 'hush');
  assert.match(raw.notes.token, /^[^:]+:[^:]+:[^:]+$/);

  const again = new Store({ home: h });
  assert.equal(again.section(Notes).read().value.token, LOCKED);
  assert.throws(() => again.section(Notes).update((n) => ({ ...n, title: 'b' })), StoreLockedError);
  assert.throws(() => again.unlock('wrong'), WrongMasterPasswordError);
  again.unlock('pw');
  assert.equal(again.section(Notes).read().value.token, 'hush');
});

test('a write with a stale revision fails and changes nothing', () => {
  const store = new Store({ home: home() });
  store.create('pw');
  const first = store.section(Notes).read();
  store.section(Notes).update((n) => ({ ...n, title: 'other process' }));
  assert.throws(() => store.section(Notes).update((n) => ({ ...n, title: 'mine' }), { revision: first.revision }), StaleRevisionError);
  assert.equal(store.section(Notes).read().value.title, 'other process');
  const ok = store.section(Notes).update((n) => ({ ...n, title: 'mine' }), { revision: 1 });
  assert.equal(ok.revision, 2);
});

test('a crash before the rename leaves the old file whole and no temp file', () => {
  const h = home();
  let crash = false;
  const store = new Store({
    home: h,
    hooks: {
      beforeRename: () => {
        if (crash) throw new Error('power cut');
      },
    },
  });
  store.create('pw');
  store.section(Notes).update((n) => ({ ...n, title: 'before' }));
  const before = fs.readFileSync(path.join(h, 'config.json'), 'utf-8');
  crash = true;
  assert.throws(() => store.section(Notes).update((n) => ({ ...n, title: 'after' })), /power cut/);
  assert.equal(fs.readFileSync(path.join(h, 'config.json'), 'utf-8'), before);
  assert.deepEqual(fs.readdirSync(h).filter((f) => f.includes('.tmp')), []);
  crash = false;
  assert.equal(store.section(Notes).read().value.title, 'before');
});

test('a section that does not match its schema is a clear error', () => {
  const h = home();
  const store = new Store({ home: h });
  store.create('pw');
  const file = path.join(h, 'config.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  raw.notes = { title: 42 };
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.throws(() => store.section(Notes).read(), /Config section "notes" is not valid/);
});

test('a file from a newer ipo is refused; reserved names cannot be sections', () => {
  const h = home();
  const store = new Store({ home: h });
  store.create('pw');
  const file = path.join(h, 'config.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  fs.writeFileSync(file, JSON.stringify({ ...raw, version: 99 }));
  assert.throws(() => store.section(Notes).read(), /newer ipo/);
  assert.throws(() => defineSection('salt', () => z.string().default('')), /Reserved/);
});
