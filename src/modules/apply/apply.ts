import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { pacedMap } from '../../platform/terminal/public.js';
import { getBankDetail, getBanks, listAccounts, type Account } from '../accounts/public.js';
import { checkSession, recordHealth, type HealthReport, loginFailedReport } from '../health/public.js';
import { hasActed, listIssues, type Issue } from '../issues/public.js';
import { closeSession, openSessions, type Session } from '../session/public.js';
import { ApplyEndpoint } from './endpoints.js';

export type ApplyStatus = 'applied' | 'already' | 'skipped' | 'failed';

export interface ApplyResult {
  account: Account;
  company: string;
  status: ApplyStatus;
  message: string;
}

export interface Skip {
  account: Account;
  reason: string;
}

/** Logged-in accounts that may apply, the ones left out with the reason, and the open issues. */
export interface ApplyPlan {
  sessions: Session[];
  skipped: Skip[];
  issues: Issue[];
  /** The health checks made while opening the sessions (saved to the cache). */
  reports: HealthReport[];
}

/**
 * Opens a session per account (paced). A blocked account or a failed login is left
 * out with the reason. The issue list comes from the first healthy account.
 */
export async function planApply(ctx: AppContext, accounts: Account[] = listAccounts(ctx)): Promise<ApplyPlan> {
  const outcomes = await openSessions(ctx, accounts);
  const sessions: Session[] = [];
  const skipped: Skip[] = [];
  const reports: HealthReport[] = [];
  for (const o of outcomes) {
    if (!o.ok) {
      skipped.push({ account: o.account, reason: o.error });
      reports.push(loginFailedReport(ctx, o.account, o.error));
      continue;
    }
    // a blocked session makes no call here; a healthy one reads its details (and refreshes the cache)
    const report = await checkSession(ctx, o.session);
    reports.push(report);
    if (o.session.blocked.length || report.status === 'blocked') {
      const why = o.session.blocked.length
        ? o.session.blocked.map((x) => x.message)
        : report.findings.filter((f) => f.severity === 'blocked').map((f) => f.message);
      skipped.push({ account: o.account, reason: `${why.join('; ')}${report.fix ? ` (fix: ${report.fix})` : ''}` });
      await closeSession(ctx, o.session);
      continue;
    }
    sessions.push(o.session);
  }
  recordHealth(ctx, reports);
  let issues: Issue[] = [];
  if (sessions.length) {
    try {
      issues = await listIssues(ctx, sessions[0]);
    } catch (err) {
      await closeAll(ctx, sessions);
      throw new Error(`Could not read the open issues: ${friendlyMessage(err)}`);
    }
  }
  return { sessions, skipped, issues, reports };
}

export async function closeAll(ctx: AppContext, sessions: Session[]): Promise<void> {
  for (const s of sessions) await closeSession(ctx, s);
}

function alreadyApplied(err: unknown): boolean {
  if (!(err instanceof MeroShareError)) return false;
  return err.status === 409 || /application\s+in\s+process|already\s+applied/i.test(err.message);
}

/**
 * Applies for one issue from one account. First reads the account's own issue list:
 * a set `action` means it already acted, so nothing is sent. The apply request is a
 * write and is sent at most once.
 */
export async function applyOne(ctx: AppContext, session: Session, issue: Issue, kitta: number): Promise<ApplyResult> {
  const base = { account: session.account, company: issue.companyName };
  let own: Issue | undefined;
  try {
    own = (await listIssues(ctx, session)).find((i) => i.companyShareId === issue.companyShareId);
  } catch (err) {
    return { ...base, status: 'failed', message: `Could not read this account's issues: ${friendlyMessage(err)}` };
  }
  if (!own) return { ...base, status: 'skipped', message: 'Not open to this account' };
  if (hasActed(own)) return { ...base, status: 'already', message: `Already applied (${own.action})` };

  let bankId: number;
  let detail: Awaited<ReturnType<typeof getBankDetail>>;
  try {
    const banks = await getBanks(ctx, session);
    if (!banks.length) return { ...base, status: 'skipped', message: 'No bank linked on MeroShare' };
    bankId = (banks.find((b) => b.id === session.account.bankId) ?? banks[0]).id;
    detail = await getBankDetail(ctx, session, bankId);
  } catch (err) {
    return { ...base, status: 'failed', message: `Could not read the bank: ${friendlyMessage(err)}` };
  }

  const a = session.account;
  try {
    const res = await ctx.client.call(
      ApplyEndpoint,
      {
        demat: a.boid,
        boid: a.username,
        accountNumber: detail.accountNumber || a.accountNumber,
        customerId: detail.id || detail.customerId || a.customerId,
        accountBranchId: detail.accountBranchId || a.accountBranchId,
        accountTypeId: detail.accountTypeId || 1,
        kitta,
        crn: a.crn,
        pin: a.pin,
        companyShareId: issue.companyShareId,
        bankId,
      },
      session,
    );
    return { ...base, status: 'applied', message: res.message };
  } catch (err) {
    if (alreadyApplied(err)) return { ...base, status: 'already', message: 'Already applied' };
    return { ...base, status: 'failed', message: friendlyMessage(err) };
  }
}

export interface Selection {
  issue: Issue;
  kitta: number;
}

/** Applies every selection from every session, paced between accounts. Closes the sessions. */
export async function runApply(ctx: AppContext, plan: ApplyPlan, selections: Selection[]): Promise<ApplyResult[]> {
  const results: ApplyResult[] = plan.skipped.flatMap((s) =>
    selections.map((sel) => ({ account: s.account, company: sel.issue.companyName, status: 'skipped' as const, message: s.reason })),
  );
  try {
    const perAccount = await pacedMap(plan.sessions, { concurrency: 2, gapMs: ctx.accountGapMs, sleep: ctx.sleep }, async (session) => {
      const out: ApplyResult[] = [];
      for (const sel of selections) out.push(await applyOne(ctx, session, sel.issue, sel.kitta));
      return out;
    });
    results.push(...perAccount.flat());
  } finally {
    await closeAll(ctx, plan.sessions);
  }
  const applied = results.filter((r) => r.status === 'applied');
  if (applied.length) {
    await ctx.notifier.send({
      kind: 'applied',
      subject: 'IPO application results',
      lines: [
        `Applied: ${applied.length}. Already applied: ${results.filter((r) => r.status === 'already').length}. ` +
          `Skipped: ${results.filter((r) => r.status === 'skipped').length}. Failed: ${results.filter((r) => r.status === 'failed').length}.`,
        '',
        ...results.map((r) => `${r.account.name} - ${r.company}: ${r.status} (${r.message})`),
      ],
    });
  }
  return results;
}

export interface AutoApplyOptions {
  categories: string[];
  maxKitta: number;
}

/** The kitta auto-apply asks for: the smaller of the setting and the issue's maximum, at least the minimum. */
export function autoKitta(issue: Issue, maxKitta: number): number {
  const max = issue.maxUnit ?? maxKitta;
  const min = issue.minUnit ?? 1;
  return Math.max(min, Math.min(maxKitta, max));
}
