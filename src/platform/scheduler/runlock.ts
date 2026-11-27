import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { matchesRecord, processMarker } from './pid.js';

export class RunBusyError extends Error {
  constructor(
    readonly lockName: string,
    readonly pid: number,
  ) {
    super(`Another ipo ${lockName} is running (pid ${pid})`);
    this.name = 'RunBusyError';
  }
}

export interface RunLock {
  /** Removes the lock when it is still ours. Safe to call twice. */
  release(): void;
}

interface Holder {
  pid: number;
  marker: string | null;
  token: string;
}

function read(file: string): Holder | null {
  try {
    const h = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Holder>;
    if (!Number.isInteger(h.pid) || typeof h.token !== 'string') return null;
    return { pid: h.pid as number, marker: typeof h.marker === 'string' ? h.marker : null, token: h.token };
  } catch {
    return null;
  }
}

/**
 * A lock across processes for a long job (`apply`), in `<home>/<name>.run.lock`, held until
 * `release()` or the process exits. The file is made whole and then linked into place, so a
 * reader never sees half of it. A lock whose process is gone (or runs another command now,
 * where the OS lets us check) is stale and taken over with an atomic rename: one taker wins.
 * Throws `RunBusyError` while another live process holds it.
 */
export function acquireRunLock(home: string, name: string): RunLock {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const file = path.join(home, `${name}.run.lock`);
  const token = crypto.randomBytes(16).toString('hex');
  const tmp = `${file}.${token}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, marker: processMarker(process.pid), token }), { mode: 0o600 });
  try {
    for (let tries = 0; ; tries++) {
      try {
        fs.linkSync(tmp, file);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || tries > 20) throw err;
      }
      const holder = read(file);
      if (holder && matchesRecord(holder)) throw new RunBusyError(name, holder.pid);
      const claim = `${file}.claim-${token}`;
      try {
        fs.renameSync(file, claim);
      } catch {
        continue; // someone else moved it first
      }
      const claimed = read(claim);
      // a live lock made between our read and our rename goes back
      if (claimed && matchesRecord(claimed)) {
        try {
          fs.linkSync(claim, file);
        } catch {
          // a newer lock is there: it is the live one
        }
        fs.rmSync(claim, { force: true });
        throw new RunBusyError(name, claimed.pid);
      }
      fs.rmSync(claim, { force: true });
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener('exit', release);
    if (read(file)?.token === token) fs.rmSync(file, { force: true });
  };
  process.once('exit', release);
  return { release };
}
