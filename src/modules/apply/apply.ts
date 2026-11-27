import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { acquireRunLock, RunBusyError, type RunLock } from '../../platform/scheduler/public.js';
import { pacedMap } from '../../platform/terminal/public.js';
import { getBankDetail, getBanks, listAccounts, type Account } from '../accounts/public.js';
import { checkSession, recordHealth, type HealthReport, loginFailedReport } from '../health/public.js';
import { hasActed, listIssues, matchesCategories, type Issue } from '../issues/public.js';
import { createSessionPool, type Session, type SessionPool } from '../session/public.js';
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
  /** Logs out the sessions, when the plan opened them (no pool was given). */
  release(): Promise<void>;
}

/**
 * Opens a session per account (paced). A blocked account or a failed login is left
 * out with the reason. The issue list comes from the first healthy account.
 * With a pool (the daily job) the logins come from it and stay open in it.
 * Only MeroShare blocks an account here (a login flag, a refusal, no bank); a date we
 * computed only warns.
 */
export async function planApply(ctx: AppContext, accounts: Account[] = listAccounts(ctx), pool?: SessionPool): Promise<ApplyPlan> {
  const own = pool ?? createSessionPool(ctx);
  const release = async () => {
    if (!pool) await own.closeAll();
  };
  const outcomes = await own.getMany(accounts);
  const sessions: Session[] = [];
  const skipped: Skip[] = [];
  const reports: HealthReport[] = [];
  for (const o of outcomes) {
    if (!o.ok) {
      skipped.push({ account: o.account, reason: o.error });
      // a held account made no login, so there is nothing new to save about it
      if (!o.held) reports.push(loginFailedReport(ctx, o.account, o.error));
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
      await release();
      throw new Error(`Could not read the open issues: ${friendlyMessage(err)}`);
    }
  }
  return { sessions, skipped, issues, reports, release };
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
    await plan.release();
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

/**
 * The kitta auto-apply asks for: the setting, capped at the issue's maximum.
 * Null when the setting is below the issue's minimum (the issue is left out).
 */
export function autoKitta(issue: Issue, maxKitta: number): number | null {
  const kitta = Math.min(maxKitta, issue.maxUnit ?? maxKitta);
  if (issue.minUnit !== undefined && kitta < issue.minUnit) return null;
  return kitta;
}

export class ApplyBusyError extends Error {
  constructor(readonly pid: number) {
    super('Another ipo apply is running');
    this.name = 'ApplyBusyError';
  }
}

/**
 * One apply run at a time across processes (the apply command, auto run, the scheduler).
 * Held from login to the last result. Throws `ApplyBusyError` while another run holds it.
 */
export function lockApply(ctx: AppContext): RunLock {
  try {
    return acquireRunLock(ctx.store.home, 'apply');
  } catch (err) {
    if (err instanceof RunBusyError) throw new ApplyBusyError(err.pid);
    throw err;
  }
}

/** Applies, with no prompts, for every open issue in the categories. */
export async function autoApply(
  ctx: AppContext,
  opts: AutoApplyOptions,
  pool?: SessionPool,
): Promise<{ plan: ApplyPlan; results: ApplyResult[] }> {
  const lock = lockApply(ctx);
  try {
    const plan = await planApply(ctx, listAccounts(ctx), pool);
    const selections: Selection[] = [];
    for (const issue of plan.issues) {
      if (!matchesCategories(issue, opts.categories)) continue;
      const kitta = autoKitta(issue, opts.maxKitta);
      if (kitta !== null) selections.push({ issue, kitta });
    }
    if (!selections.length) {
      await plan.release();
      return { plan, results: [] };
    }
    return { plan, results: await runApply(ctx, plan, selections) };
  } finally {
    lock.release();
  }
}
