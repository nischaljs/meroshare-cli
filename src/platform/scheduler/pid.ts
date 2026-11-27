import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ipoHome } from '../store/public.js';

function pidFile(home = ipoHome()): string {
  return path.join(home, 'auto.pid');
}

/** What `auto.pid` holds: the pid and the command line it had, so a reused pid is not taken for ours. */
interface PidRecord {
  pid: number;
  marker: string | null;
}

/** True when this OS lets ipo read another process's command line. */
export const CAN_CHECK_PROCESS = process.platform !== 'win32';

/**
 * The command line of a live process (`/proc/<pid>/cmdline` on Linux, `ps` elsewhere),
 * or null when there is no such process or it cannot be read. Always null on Windows.
 */
export function processMarker(pid: number): string | null {
  if (!CAN_CHECK_PROCESS) return null;
  try {
    if (process.platform === 'linux') {
      const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return raw.split('\0').filter(Boolean).join(' ') || null;
    }
    return execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

/** EPERM means a process of another user: never ours, so it counts as stale. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRecord(home?: string): PidRecord | null {
  try {
    const data = JSON.parse(fs.readFileSync(pidFile(home), 'utf8')) as Partial<PidRecord>;
    // an old file held the bare pid, with no marker: treat it as stale
    if (typeof data !== 'object' || data === null || !Number.isInteger(data.pid) || (data.pid as number) <= 0) return null;
    return { pid: data.pid as number, marker: typeof data.marker === 'string' ? data.marker : null };
  } catch {
    return null;
  }
}

/** True when the record's process is alive and, where the OS lets us check, still runs the same command. */
export function matchesRecord(record: { pid: number; marker: string | null }): boolean {
  if (!alive(record.pid)) return false;
  if (!CAN_CHECK_PROCESS) return true;
  return record.marker !== null && processMarker(record.pid) === record.marker;
}

/** The pid of a running scheduler started by `ipo auto start`, or null. */
export function runningPid(home?: string): number | null {
  const record = readRecord(home);
  return record && matchesRecord(record) ? record.pid : null;
}

export function writePid(home?: string): void {
  const file = pidFile(home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const record: PidRecord = { pid: process.pid, marker: processMarker(process.pid) };
  fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
}

export function clearPid(home?: string): void {
  try {
    if (readRecord(home)?.pid === process.pid) fs.unlinkSync(pidFile(home));
  } catch {
    // nothing to clear
  }
}

export interface StopResult {
  stopped: boolean;
  /** Set on Windows, where the pid is signalled without checking that it is still ipo. */
  note?: string;
}

/** Stops the running scheduler, after checking that the pid is still the one ipo started. */
export function stopRunning(home?: string): StopResult {
  const pid = runningPid(home);
  if (!pid) return { stopped: false };
  process.kill(pid, 'SIGTERM');
  return CAN_CHECK_PROCESS
    ? { stopped: true }
    : { stopped: true, note: 'On Windows ipo cannot check that this pid is still the scheduler; it was stopped by pid alone.' };
}
