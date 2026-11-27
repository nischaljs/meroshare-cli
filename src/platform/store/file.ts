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

  /** Runs fn while holding `config.json.lock`. A lock older than 15 s is treated as left by a crash. */
  withLock<T>(fn: () => T): T {
    const lockPath = `${this.filePath}.lock`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    const started = Date.now();
    let fd: number | null = null;
    while (fd === null) {
      try {
        fd = fs.openSync(lockPath, 'wx', 0o600);
        fs.writeSync(fd, String(process.pid));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        try {
          const age = Date.now() - fs.statSync(lockPath).mtimeMs;
          if (age > LOCK_STALE_MS) {
            fs.rmSync(lockPath, { force: true });
            continue;
          }
        } catch {
          continue;
        }
        if (Date.now() - started > LOCK_WAIT_MS) throw new StoreBusyError(lockPath);
        sleepSync(50);
      }
    }
    try {
      return fn();
    } finally {
      fs.closeSync(fd);
      fs.rmSync(lockPath, { force: true });
    }
  }
}
