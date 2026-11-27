import type { AppContext } from '../../platform/context/public.js';
import { openPaymentPage, type PaymentForm } from '../../platform/terminal/public.js';
import { accountRef } from '../accounts/public.js';
import { dueReminders, markRemindersSent, toDay } from '../health/public.js';
import type { Session } from '../session/public.js';
import { InitialDetailsEndpoint, PartnersEndpoint, PaymentEndpoint, type InitialDetails, type Partner } from './endpoints.js';

export const REMINDER_DAYS = [30, 14, 7, 3, 1];

export function listPartners(ctx: AppContext, session: Session): Promise<Partner[]> {
  return ctx.client.call(PartnersEndpoint, undefined, session);
}

export function renewalDetails(ctx: AppContext, session: Session, partner: Partner): Promise<InitialDetails> {
  return ctx.client.call(InitialDetailsEndpoint, partner.configId, session);
}

/** What the server says it charges, as lines. Nothing is added up or made up. */
export function chargeLines(d: InitialDetails): string[] {
  const out: string[] = [];
  if (d.meroshareRenewCharge !== undefined && d.meroshareRenewCharge !== null) out.push(`MeroShare renewal: Rs. ${d.meroshareRenewCharge} (as MeroShare states it)`);
  if (d.dematRenewCharge !== undefined && d.dematRenewCharge !== null) out.push(`DEMAT renewal: Rs. ${d.dematRenewCharge} per year (as MeroShare states it)`);
  const exp = toDay(d.expiryDate);
  if (exp) out.push(`MeroShare expiry: ${exp}`);
  const dexp = toDay(d.dematExpiryDate);
  if (dexp) out.push(`DEMAT expiry: ${dexp}`);
  if (!out.length) out.push('MeroShare did not state the charges.');
  return out;
}

export function maxYears(d: InitialDetails): number {
  const n = Number(d.dematMaxRenewalYear);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function paymentTypeLabel(t: unknown): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') {
    const o = t as Record<string, unknown>;
    return String(o.name ?? o.paymentType ?? o.code ?? o.type ?? JSON.stringify(o));
  }
  return String(t);
}

/**
 * Asks MeroShare for the payment page and opens it in the browser. Sent once, never
 * retried. The person pays on the partner's page; ipo never sees wallet details.
 */
export async function startPayment(
  ctx: AppContext,
  session: Session,
  input: { partner: Partner; paymentTypes: unknown[]; years: number },
  opts: { open?: boolean } = {},
): Promise<{ file: string; form: PaymentForm }> {
  const form = await ctx.client.call(
    PaymentEndpoint,
    { partnerConfigId: input.partner.configId, paymentTypes: input.paymentTypes, years: input.years },
    session,
  );
  return { file: openPaymentPage(form, opts), form };
}

const KIND_LABEL = { meroshare: 'MeroShare account', demat: 'DEMAT account' } as const;

/** Emails (and prints) the renewal reminders that are due, each once. */
export async function sendRenewalReminders(ctx: AppContext): Promise<number> {
  let sent = 0;
  for (const r of dueReminders(ctx, REMINDER_DAYS)) {
    const when = r.daysLeft === 0 ? 'today' : `in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`;
    const delivery = await ctx.notifier.send({
      kind: 'renewalDue',
      account: r.account.name,
      subject: `${KIND_LABEL[r.kind]} of ${r.account.name} expires ${when}`,
      lines: [
        `The ${KIND_LABEL[r.kind]} of ${r.account.name} expires on ${r.expiry} (${when}).`,
        'After that, IPO applications from this account stop working.',
        '',
        `To renew, run: ipo fix ${accountRef(r.account)}`,
      ],
    });
    if (delivery.email !== 'failed') {
      markRemindersSent(ctx, r.keys);
      sent++;
    }
  }
  return sent;
}
