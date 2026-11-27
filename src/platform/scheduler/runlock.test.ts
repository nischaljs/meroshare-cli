import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireRunLock, processMarker, RunBusyError } from './public.js';

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-runlock-'));
const lockFile = (dir: string) => path.join(dir, 'apply.run.lock');
const unix = process.platform !== 'win32';

test('a second holder is refused while the first holds it; free again after release', () => {
  const dir = home();
  const first = acquireRunLock(dir, 'apply');
  assert.throws(() => acquireRunLock(dir, 'apply'), (e: unknown) => e instanceof RunBusyError && e.pid === process.pid);
  first.release();
  first.release();
  assert.equal(fs.existsSync(lockFile(dir)), false);
  acquireRunLock(dir, 'apply').release();
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a lock left by a process that is gone is taken over', () => {
  const dir = home();
  fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: 2 ** 22 + 12345, marker: 'node ipo apply', token: 'old' }));
  const lock = acquireRunLock(dir, 'apply');
  assert.equal(JSON.parse(fs.readFileSync(lockFile(dir), 'utf8')).pid, process.pid);
  lock.release();
});

test('a lock held by another live ipo process is respected', { skip: !unix }, async () => {
  const dir = home();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  try {
    await new Promise((r) => child.once('spawn', r));
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: child.pid, marker: processMarker(child.pid!), token: 'theirs' }));
    assert.throws(() => acquireRunLock(dir, 'apply'), RunBusyError);
    assert.equal(JSON.parse(fs.readFileSync(lockFile(dir), 'utf8')).token, 'theirs');
    // the pid was reused by another program: stale, taken over
    fs.writeFileSync(lockFile(dir), JSON.stringify({ pid: child.pid, marker: 'node /usr/bin/ipo apply', token: 'theirs' }));
    acquireRunLock(dir, 'apply').release();
  } finally {
    child.kill();
  }
});
