import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { pacedMap } from '../../platform/terminal/public.js';
import { accountId, accountRef, getBanks, listAccounts, type Account } from '../accounts/public.js';
import { closeSession, noFlags, openSession, type LoginFlags, type Session } from '../session/public.js';
import { daysLeft, firstDay } from './dates.js';
import { OwnDetailEndpoint } from './endpoints.js';
import { HealthSection, type HealthSnapshot } from './state.js';

export type Severity = 'blocked' | 'urgent' | 'warn' | 'ok' | 'error';
export type ExpiryKind = 'password' | 'meroshare' | 'demat';

export interface Finding {
  kind: ExpiryKind | 'pin' | 'flag' | 'bank' | 'login';
  severity: Severity;
  message: string;
  daysLeft?: number;
  fix: 'password' | 'renewal' | 'pin' | 'login' | null;
}

export interface HealthReport {
  account: Account;
  snapshot: HealthSnapshot;
  findings: Finding[];
  status: Severity;
  /** What the person types, or does, to fix the worst finding. */
  fix: string | null;
}

const ORDER: Severity[] = ['ok', 'warn', 'urgent', 'error', 'blocked'];
const KIND_LABEL: Record<ExpiryKind, string> = { password: 'Password', meroshare: 'MeroShare account', demat: 'DEMAT' };
const KIND_FIX: Record<ExpiryKind, Finding['fix']> = { password: 'password', meroshare: 'renewal', demat: 'renewal' };

export const WARN_DAYS = 30;
const ROLE_REFUSED = 'MeroShare refused the account (Role Not Authorized)';
export const URGENT_DAYS = 7;

function worst(findings: Finding[]): Severity {
  return findings.reduce<Severity>((w, f) => (ORDER.indexOf(f.severity) > ORDER.indexOf(w) ? f.severity : w), 'ok');
}

function expiryFinding(kind: ExpiryKind, day: string | null, now: Date): Finding | null {
  if (!day) return null;
  const left = daysLeft(day, now);
  const label = KIND_LABEL[kind];
  if (left < 0) return { kind, severity: 'blocked', message: `${label} expired on ${day}`, daysLeft: left, fix: KIND_FIX[kind] };
  const when = left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`;
  if (left <= URGENT_DAYS) return { kind, severity: 'urgent', message: `${label} expires ${when} (${day})`, daysLeft: left, fix: KIND_FIX[kind] };
  if (left <= WARN_DAYS) return { kind, severity: 'warn', message: `${label} expires ${when} (${day})`, daysLeft: left, fix: KIND_FIX[kind] };
  return null;
}

function flagFindings(flags: LoginFlags): Finding[] {
  const out: Finding[] = [];
  if (flags.passwordExpired) out.push({ kind: 'flag', severity: 'blocked', message: 'MeroShare password has expired', fix: 'password' });
  if (flags.changePassword) out.push({ kind: 'flag', severity: 'blocked', message: 'MeroShare asks for a new password', fix: 'password' });
  if (flags.accountExpired) out.push({ kind: 'flag', severity: 'blocked', message: 'MeroShare account has expired', fix: 'renewal' });
  if (flags.dematExpired) out.push({ kind: 'flag', severity: 'blocked', message: 'DEMAT account has expired', fix: 'renewal' });
  if (flags.isTransactionPINNotSetBefore) out.push({ kind: 'pin', severity: 'blocked', message: 'Transaction PIN is not set', fix: 'pin' });
  if (flags.isTransactionPINReset) out.push({ kind: 'pin', severity: 'blocked', message: 'Transaction PIN was reset', fix: 'pin' });
  if (flags.passwordPolicyChanged) out.push({ kind: 'flag', severity: 'warn', message: 'Password rules changed; set a new password', fix: 'password' });
  return out;
}

function pinState(flags: LoginFlags): HealthSnapshot['pin'] {
  if (flags.isTransactionPINNotSetBefore) return 'not set';
  if (flags.isTransactionPINReset) return 'reset';
  return 'set';
}

function fixText(account: Account, findings: Finding[]): string | null {
  const ranked = [...findings].sort((a, b) => ORDER.indexOf(b.severity) - ORDER.indexOf(a.severity));
  const top = ranked.find((f) => f.fix);
  if (!top) return null;
  if (top.fix === 'login') return `ipo init edit (check the password of ${account.name})`;
  return `ipo fix ${accountRef(account)}`;
}

/** Findings from a snapshot, with days counted from `now`. */
export function findingsFor(snapshot: HealthSnapshot, now: Date): Finding[] {
  const out: Finding[] = [];
  if (snapshot.error?.startsWith(ROLE_REFUSED)) out.push({ kind: 'login', severity: 'blocked', message: snapshot.error, fix: null });
  else if (snapshot.error) out.push({ kind: 'login', severity: 'error', message: snapshot.error, fix: 'login' });
  out.push(...flagFindings(snapshot.flags));
  for (const [kind, day] of [
    ['password', snapshot.passwordExpiry],
    ['meroshare', snapshot.meroshareExpiry],
    ['demat', snapshot.dematExpiry],
  ] as const) {
    const f = expiryFinding(kind, day, now);
    // an expired date the flags already report is said once
    if (f && !(f.severity === 'blocked' && out.some((o) => o.kind === 'flag' && o.fix === f.fix))) out.push(f);
  }
  if (snapshot.bankLinked === false) out.push({ kind: 'bank', severity: 'blocked', message: 'No bank account is linked in MeroShare', fix: null });
  return out;
}

export function reportFor(account: Account, snapshot: HealthSnapshot, now: Date): HealthReport {
  const findings = findingsFor(snapshot, now);
  return { account, snapshot, findings, status: worst(findings), fix: fixText(account, findings) };
}

function baseSnapshot(account: Account, now: Date): HealthSnapshot {
  return {
    name: account.name,
    checkedAt: now.toISOString(),
    passwordExpiry: null,
    meroshareExpiry: null,
    dematExpiry: null,
    flags: noFlags(),
    pin: 'unknown',
    bankLinked: null,
    error: null,
  };
}

/**
 * Health of a logged-in account. When a flag blocks the account, the findings come
 * from the flags only and no other call is made.
 */
export async function checkSession(ctx: AppContext, session: Session): Promise<HealthReport> {
  const now = ctx.now();
  const snap: HealthSnapshot = { ...baseSnapshot(session.account, now), flags: session.flags, pin: pinState(session.flags) };
  if (!session.blocked.length) {
    try {
      const d = await ctx.client.call(OwnDetailEndpoint, undefined, session);
      snap.passwordExpiry = firstDay(d.passwordExpiryDate, d.passwordExpiryDateStr);
      snap.meroshareExpiry = firstDay(d.expiredDate, d.expiredDateStr);
      snap.dematExpiry = firstDay(d.dematExpiryDate);
      const banks = await getBanks(ctx, session);
      snap.bankLinked = banks.length > 0;
    } catch (err) {
      snap.error = err instanceof MeroShareError && err.isRoleNotAuthorized
        ? `${ROLE_REFUSED}: password, account or DEMAT has likely expired`
        : `Could not read account details: ${friendlyMessage(err)}`;
    }
  }
  return reportFor(session.account, snap, now);
}

export function loginFailedReport(ctx: AppContext, account: Account, error: string): HealthReport {
  const now = ctx.now();
  return reportFor(account, { ...baseSnapshot(account, now), error }, now);
}

/** Saves the reports as the last check of each account. */
export function recordHealth(ctx: AppContext, reports: HealthReport[]): void {
  if (!reports.length) return;
  ctx.store.section(HealthSection).update((h) => {
    for (const r of reports) {
      const id = accountId(r.account);
      const prev = h.snapshots[id];
      // a failed login says nothing new about the dates: keep the last known ones
      h.snapshots[id] =
        r.snapshot.error && prev
          ? {
              ...r.snapshot,
              passwordExpiry: r.snapshot.passwordExpiry ?? prev.passwordExpiry,
              meroshareExpiry: r.snapshot.meroshareExpiry ?? prev.meroshareExpiry,
              dematExpiry: r.snapshot.dematExpiry ?? prev.dematExpiry,
            }
          : r.snapshot;
    }
  });
}

/** After a password change: the old expiry and the password flags no longer hold. */
export function markPasswordChanged(ctx: AppContext, account: Account): void {
  ctx.store.section(HealthSection).update((h) => {
    const s = h.snapshots[accountId(account)];
    if (!s) return;
    s.passwordExpiry = null;
    s.flags = { ...s.flags, passwordExpired: false, changePassword: false, passwordPolicyChanged: false };
  });
}

/** Logs in to every account (paced), checks it, saves the snapshots. Read only on MeroShare. */
export async function runDoctor(ctx: AppContext): Promise<HealthReport[]> {
  const accounts = listAccounts(ctx);
  const reports = await pacedMap(accounts, { concurrency: 2, gapMs: ctx.accountGapMs, sleep: ctx.sleep }, async (account) => {
    let session: Session;
    try {
      session = await openSession(ctx, account);
    } catch (err) {
      return loginFailedReport(ctx, account, err instanceof Error ? err.message : String(err));
    }
    try {
      return await checkSession(ctx, session);
    } finally {
      await closeSession(ctx, session);
    }
  });
  recordHealth(ctx, reports);
  return reports;
}

export function cachedReports(ctx: AppContext): HealthReport[] {
  if (!ctx.store.exists()) return [];
  const { snapshots } = ctx.store.section(HealthSection).read().value;
  const now = ctx.now();
  return listAccounts(ctx)
    .filter((a) => snapshots[accountId(a)])
    .map((a) => reportFor(a, snapshots[accountId(a)], now));
}

/**
 * One line for anything that expires within 30 days or is blocked, from the cached
 * last check. Makes no MeroShare call. Null when there is nothing to say.
 */
export function expiryBanner(ctx: AppContext): string | null {
  let reports: HealthReport[];
  try {
    reports = cachedReports(ctx);
  } catch {
    return null;
  }
  const parts: string[] = [];
  for (const r of reports) {
    const items = r.findings.filter((f) => f.severity === 'blocked' || f.severity === 'urgent' || f.severity === 'warn');
    if (items.length) parts.push(`${r.account.name}: ${items.map((f) => f.message).join(', ')}`);
  }
  if (!parts.length) return null;
  return `${parts.join('; ')}. Run "ipo doctor".`;
}

// reminders: each threshold is sent once per expiry date

export interface Reminder {
  account: Account;
  kind: 'meroshare' | 'demat';
  expiry: string;
  daysLeft: number;
  threshold: number;
  /** Keys to mark as sent: this threshold and every larger one. */
  keys: string[];
}

function reminderKey(id: string, kind: string, expiry: string, threshold: number): string {
  return `${id}:${kind}:${expiry}:${threshold}`;
}

/**
 * Reminders due from the cached snapshots. For each expiry, only the most specific
 * threshold not yet sent is returned; nothing is due once the date has passed.
 */
export function dueReminders(ctx: AppContext, thresholds: number[]): Reminder[] {
  const sorted = [...thresholds].sort((a, b) => a - b);
  const { snapshots, remindersSent } = ctx.store.section(HealthSection).read().value;
  const sent = new Set(remindersSent);
  const now = ctx.now();
  const out: Reminder[] = [];
  for (const account of listAccounts(ctx)) {
    const id = accountId(account);
    const s = snapshots[id];
    if (!s) continue;
    for (const [kind, expiry] of [['meroshare', s.meroshareExpiry], ['demat', s.dematExpiry]] as const) {
      if (!expiry) continue;
      const left = daysLeft(expiry, now);
      if (left < 0) continue;
      const threshold = sorted.find((t) => t >= left);
      if (threshold === undefined) continue;
      const key = reminderKey(id, kind, expiry, threshold);
      if (sent.has(key)) continue;
      const keys = sorted.filter((t) => t >= left).map((t) => reminderKey(id, kind, expiry, t));
      out.push({ account, kind, expiry, daysLeft: left, threshold, keys });
    }
  }
  return out;
}

export function markRemindersSent(ctx: AppContext, keys: string[]): void {
  if (!keys.length) return;
  ctx.store.section(HealthSection).update((h) => {
    h.remindersSent = [...new Set([...h.remindersSent, ...keys])];
  });
}
