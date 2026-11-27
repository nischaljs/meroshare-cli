import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/** Folder that holds config.json. `IPO_HOME` overrides `~/.ipo` (tests use a temp dir). */
export function ipoHome(): string {
  return process.env.IPO_HOME || path.join(os.homedir(), '.ipo');
}

export class StoreBusyError extends Error {
  constructor(lockPath: string) {
    super(`Config is locked by another ipo process (${lockPath}). Try again in a moment.`);
    this.name = 'StoreBusyError';
  }
}

export interface FileHooks {
  /** Test hook: runs after the temp file is written and before it replaces the config. */
  beforeRename?: () => void;
}

const LOCK_STALE_MS = 15_000;
const LOCK_WAIT_MS = 5_000;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class ConfigFile {
  constructor(
    readonly filePath: string,
    private readonly hooks: FileHooks = {},
  ) {}

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  readJson(): unknown {
    if (!this.exists()) throw new Error('Config not found. Run "ipo init" first.');
    return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
  }

  /** Atomic write: temp file, fsync, rename. A crash leaves the old file whole. */
  writeJson(value: unknown): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(value, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      this.hooks.beforeRename?.();
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    try {
      const dfd = fs.openSync(dir, 'r');
      fs.fsyncSync(dfd);
      fs.closeSync(dfd);
    } catch {
      // some platforms cannot fsync a directory
    }
  }

  /**
   * Runs fn while holding `config.json.lock`. The lock file holds a random token, and only
   * the holder of that token removes it. A lock older than 15 s is treated as left by a
   * crash: a waiter takes it over by renaming it to a name of its own (atomic, so only one
   * waiter wins), and puts it back if it turns out not to be stale.
   */
  withLock<T>(fn: () => T): T {
    const lockPath = `${this.filePath}.lock`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    const token = crypto.randomBytes(16).toString('hex');
    const started = Date.now();
    let fd: number | null = null;
    while (fd === null) {
      try {
        fd = fs.openSync(lockPath, 'wx', 0o600);
        fs.writeSync(fd, token);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        if (this.takeOverStale(lockPath, token)) continue;
        if (Date.now() - started > LOCK_WAIT_MS) throw new StoreBusyError(lockPath);
        sleepSync(50);
      }
    }
    try {
      return fn();
    } finally {
      fs.closeSync(fd);
      releaseIfOurs(lockPath, token);
    }
  }

  /** True when the lock is gone (stale and removed by us, or released meanwhile): try again at once. */
  private takeOverStale(lockPath: string, token: string): boolean {
    let mtime: number;
    try {
      mtime = fs.statSync(lockPath).mtimeMs;
    } catch {
      return true;
    }
    if (Date.now() - mtime <= LOCK_STALE_MS) return false;
    const claim = `${lockPath}.claim-${token}`;
    try {
      fs.renameSync(lockPath, claim);
    } catch {
      return true; // another waiter renamed it first, or the holder released it
    }
    // between our stat and our rename the lock may have been replaced by a live one
    if (Date.now() - fs.statSync(claim).mtimeMs <= LOCK_STALE_MS) restore(claim, lockPath);
    else fs.rmSync(claim, { force: true });
    return true;
  }
}

/** Moves the lock aside, then deletes it only when it holds our token; otherwise puts it back. */
function releaseIfOurs(lockPath: string, token: string): void {
  const aside = `${lockPath}.release-${token}`;
  try {
    fs.renameSync(lockPath, aside);
  } catch {
    return; // gone: taken over as stale, nothing of ours to remove
  }
  let held = '';
  try {
    held = fs.readFileSync(aside, 'utf8');
  } catch {
    // unreadable: treat as not ours
  }
  if (held === token) fs.rmSync(aside, { force: true });
  else restore(aside, lockPath);
}

/** Puts a lock file back under its name, unless a new lock was made there meanwhile. */
function restore(from: string, lockPath: string): void {
  try {
    fs.linkSync(from, lockPath);
  } catch {
    // a new lock exists: it is the live one
  }
  fs.rmSync(from, { force: true });
}

