import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { generatePassword, type PasswordPolicy } from '../../platform/terminal/public.js';
import { accountId, clearPendingPassword, promotePendingPassword, setPendingPassword } from '../accounts/public.js';
import { daysLeft, markPasswordChanged, type HealthReport } from '../health/public.js';
import type { Session } from '../session/public.js';
import { ChangePasswordEndpoint, PasswordPolicyEndpoint } from './endpoints.js';
import { checkPassword, parsePolicy } from './policy.js';

export const ROTATE_WITHIN_DAYS = 7;

export async function getPolicy(ctx: AppContext, session: Session): Promise<{ policy: PasswordPolicy; fromServer: boolean }> {
  try {
    return parsePolicy(await ctx.client.call(PasswordPolicyEndpoint, undefined, session));
  } catch {
    return parsePolicy(null);
  }
}

export type ChangeOutcome =
  | { status: 'changed' }
  | { status: 'rejected'; message: string }
  /** The request may or may not have reached MeroShare. The new password stays pending; the next login settles it. */
  | { status: 'unknown'; message: string };

export class PasswordChangeBlockedError extends Error {}

/** True when nothing but the password blocks the account, so the change call is allowed. */
export function canChangePassword(session: Session): boolean {
  return session.blocked.every((b) => b.fix === 'password');
}

/**
 * Two-phase change:
 * 1. write the new password as `pendingPassword` (encrypted) before the request;
 * 2. on success, make it the password and clear pending;
 *    on a clear refusal (4xx), clear pending;
 *    on no clear answer (network, 5xx, bot page), keep pending, so the next login can try it.
 * The request is never retried.
 */
export async function changePassword(ctx: AppContext, session: Session, newPassword: string): Promise<ChangeOutcome> {
  if (!canChangePassword(session)) {
    throw new PasswordChangeBlockedError(`${session.account.name}: ${session.blocked.map((b) => b.message).join('; ')}`);
  }
  const id = accountId(session.account);
  setPendingPassword(ctx, id, newPassword);
  try {
    await ctx.client.call(ChangePasswordEndpoint, { oldPassword: session.account.password, newPassword }, session);
  } catch (err) {
    if (err instanceof MeroShareError && err.isDefiniteRejection) {
      clearPendingPassword(ctx, id);
      return { status: 'rejected', message: friendlyMessage(err) };
    }
    return { status: 'unknown', message: friendlyMessage(err) };
  }
  promotePendingPassword(ctx, id, newPassword);
  markPasswordChanged(ctx, session.account);
  await ctx.notifier.send({
    kind: 'passwordChanged',
    account: session.account.name,
    subject: 'MeroShare password changed',
    lines: [
      `The MeroShare password of ${session.account.name} was changed by ipo.`,
      'The new password is stored encrypted on this computer. To see it, run: ipo accounts password ' + session.account.name,
    ],
  });
  return { status: 'changed' };
}

/** Why the password should change now, or null. */
export function rotationReason(report: HealthReport, now: Date): string | null {
  const f = report.snapshot.flags;
  if (f.passwordExpired) return 'password expired';
  if (f.changePassword) return 'MeroShare asks for a new password';
  if (f.passwordPolicyChanged) return 'password rules changed';
  const day = report.snapshot.passwordExpiry;
  if (day && daysLeft(day, now) <= ROTATE_WITHIN_DAYS) return `password expires on ${day}`;
  return null;
}

/** The automatic change: a generated password that meets the server's rules. */
export async function rotatePassword(ctx: AppContext, session: Session): Promise<ChangeOutcome> {
  const { policy } = await getPolicy(ctx, session);
  let pw = generatePassword(policy);
  for (let i = 0; i < 5 && checkPassword(policy, pw, session.account.password).length; i++) pw = generatePassword(policy);
  return changePassword(ctx, session, pw);
}
