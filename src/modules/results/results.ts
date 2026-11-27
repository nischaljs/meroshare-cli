import type { AppContext } from '../../platform/context/public.js';
import { friendlyMessage } from '../../platform/meroshare/public.js';
import { pacedMap } from '../../platform/terminal/public.js';
import { listAccounts, type Account } from '../accounts/public.js';
import { closeSession, openSession } from '../session/public.js';
import { ApplicationDetail, ApplicationReports, type Report } from './endpoints.js';

export type Allotment = 'allotted' | 'not_allotted' | 'error';

export interface ResultRow {
  account: Account;
  company: string;
  status: Allotment;
  applied?: number;
  received?: number;
  message: string;
}

/** Received kitta above zero is the real signal; otherwise the status name decides. */
export function allotmentOf(statusName: string, received: number | undefined): Allotment {
  if (received !== undefined && received > 0) return 'allotted';
  const s = statusName.toLowerCase();
  if (s.includes('block_failed') || s.includes('error')) return 'error';
  return 'not_allotted';
}

async function accountResults(ctx: AppContext, account: Account): Promise<ResultRow[]> {
  let session;
  try {
    session = await openSession(ctx, account);
  } catch (err) {
    return [{ account, company: '-', status: 'error', message: err instanceof Error ? err.message : String(err) }];
  }
  try {
    if (session.blocked.length) {
      return [{ account, company: '-', status: 'error', message: `${session.blocked.map((b) => b.message).join('; ')}. Run "ipo doctor".` }];
    }
    const reports: Report[] = await ctx.client.call(ApplicationReports, undefined, session);
    const rows: ResultRow[] = [];
    for (const r of reports) {
      const id = r.applicantFormId ?? r.id;
      let received: number | undefined;
      let applied = r.appliedKitta;
      if (id !== undefined) {
        try {
          const d = await ctx.client.call(ApplicationDetail, id, session);
          received = d.receivedKitta;
          applied ??= d.appliedKitta;
        } catch {
          // the detail only adds the received kitta
        }
      }
      rows.push({ account, company: r.companyName, status: allotmentOf(r.statusName, received), applied, received, message: r.statusName || 'Unknown' });
    }
    return rows;
  } catch (err) {
    return [{ account, company: '-', status: 'error', message: friendlyMessage(err) }];
  } finally {
    await closeSession(ctx, session);
  }
}

/** Results of every account, paced. Read only. Sends a `resultOut` notice when there are rows. */
export async function checkResults(ctx: AppContext, accounts: Account[] = listAccounts(ctx)): Promise<ResultRow[]> {
  const rows = (await pacedMap(accounts, { concurrency: 2, gapMs: ctx.accountGapMs, sleep: ctx.sleep }, (a) => accountResults(ctx, a))).flat();
  const found = rows.filter((r) => r.company !== '-');
  if (found.length) {
    await ctx.notifier.send({
      kind: 'resultOut',
      subject: 'IPO result check',
      lines: [
        `Allotted: ${found.filter((r) => r.status === 'allotted').length}. Not allotted: ${found.filter((r) => r.status === 'not_allotted').length}.`,
        '',
        ...found.map((r) => `${r.account.name} - ${r.company}: ${r.status}${r.applied ? ` (applied: ${r.applied})` : ''}${r.received ? ` (received: ${r.received})` : ''}`),
      ],
    });
  }
  return rows;
}
