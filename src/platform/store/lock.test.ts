import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigFile } from './file.js';

const fileModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'file.ts');

function staleLock(file: string): void {
  fs.writeFileSync(`${file}.lock`, 'token-of-a-crashed-process');
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(`${file}.lock`, old, old);
}

// each waiter starts at the same moment, takes the lock, and logs enter and exit around a 200 ms hold
const waiter = `
import fs from 'node:fs';
import { ConfigFile } from ${JSON.stringify(fileModule)};
const [file, log, startAt] = process.argv.slice(1);
const name = String(process.pid);
while (Date.now() < Number(startAt)) {}
new ConfigFile(file).withLock(() => {
  fs.appendFileSync(log, 'enter ' + name + '\\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  fs.appendFileSync(log, 'exit ' + name + '\\n');
});
`;

function run(file: string, log: string, startAt: number): Promise<number | null> {
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', waiter, file, log, String(startAt)], { stdio: 'inherit' });
  return new Promise((r) => child.once('exit', (code) => r(code)));
}

test('waiters racing for a stale lock: one takes it over, they hold it one at a time, nothing is left behind', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-lock-'));
  const file = path.join(dir, 'config.json');
  const log = path.join(dir, 'log');
  staleLock(file);
  const startAt = Date.now() + 2500; // after tsx has loaded in every child
  const codes = await Promise.all([1, 2, 3, 4].map(() => run(file, log, startAt)));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(lines.length, 8);
  for (let i = 0; i < lines.length; i += 2) {
    const who = lines[i].split(' ')[1];
    assert.deepEqual([lines[i], lines[i + 1]], [`enter ${who}`, `exit ${who}`], lines.join('\n'));
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['log']);
});

test('the lock is removed only by the holder of its token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipo-lock-'));
  const file = path.join(dir, 'config.json');
  new ConfigFile(file).withLock(() => {
    // another process took it over meanwhile (its own token in the file)
    fs.writeFileSync(`${file}.lock`, 'someone-else');
  });
  assert.equal(fs.readFileSync(`${file}.lock`, 'utf8'), 'someone-else');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['config.json.lock']);
});
