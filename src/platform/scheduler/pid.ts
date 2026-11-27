import fs from 'node:fs';
import path from 'node:path';
import { ipoHome } from '../store/public.js';

function pidFile(home = ipoHome()): string {
  return path.join(home, 'auto.pid');
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The pid of a running scheduler started by `ipo auto start`, or null. */
export function runningPid(home?: string): number | null {
  try {
    const pid = Number(fs.readFileSync(pidFile(home), 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 && alive(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function writePid(home?: string): void {
  const file = pidFile(home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, String(process.pid), { mode: 0o600 });
}

export function clearPid(home?: string): void {
  try {
    if (Number(fs.readFileSync(pidFile(home), 'utf8').trim()) === process.pid) fs.unlinkSync(pidFile(home));
  } catch {
    // nothing to clear
  }
}

/** Stops the running scheduler. True when one was running. */
export function stopRunning(home?: string): boolean {
  const pid = runningPid(home);
  if (!pid) return false;
  process.kill(pid, 'SIGTERM');
  return true;
}
