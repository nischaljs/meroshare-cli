import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processMarker, runningPid, stopRunning, writePid, clearPid } from './public.js';

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-pid-'));
const writeRecord = (dir: string, data: unknown) => fs.writeFileSync(path.join(dir, 'auto.pid'), JSON.stringify(data));

function sleeper() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  return child;
}

const unix = process.platform !== 'win32';

test('our own pid file reads back as running, and clears', () => {
  const dir = home();
  writePid(dir);
  assert.equal(runningPid(dir), process.pid);
  clearPid(dir);
  assert.equal(runningPid(dir), null);
});

test('a live pid whose command line does not match is stale: never signalled', { skip: !unix }, async () => {
  const dir = home();
  const child = sleeper();
  try {
    await new Promise((r) => child.once('spawn', r));
    // the pid was reused by another program: the marker is from the ipo that wrote the file
    writeRecord(dir, { pid: child.pid, marker: 'node /usr/bin/ipo auto start' });
    assert.equal(runningPid(dir), null);
    assert.deepEqual(stopRunning(dir), { stopped: false });
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
  } finally {
    child.kill();
  }
});

test('a live pid with a matching marker is stopped', { skip: !unix }, async () => {
  const dir = home();
  const child = sleeper();
  try {
    await new Promise((r) => child.once('spawn', r));
    writeRecord(dir, { pid: child.pid, marker: processMarker(child.pid!) });
    assert.equal(runningPid(dir), child.pid);
    const exited = new Promise((r) => child.once('exit', (_code, signal) => r(signal)));
    assert.deepEqual(stopRunning(dir), { stopped: true });
    assert.equal(await exited, 'SIGTERM');
  } finally {
    child.kill();
  }
});

test('a dead pid, an old bare-pid file and a pid of another user (EPERM) are stale', () => {
  const dir = home();
  writeRecord(dir, { pid: 2 ** 22 + 12345, marker: 'x' });
  assert.equal(runningPid(dir), null);
  fs.writeFileSync(path.join(dir, 'auto.pid'), String(process.pid));
  assert.equal(runningPid(dir), null);
  // pid 1 belongs to root; for a normal user process.kill(1, 0) is EPERM
  if (unix && process.getuid?.() !== 0) {
    writeRecord(dir, { pid: 1, marker: processMarker(1) ?? 'init' });
    assert.equal(runningPid(dir), null);
  }
});
