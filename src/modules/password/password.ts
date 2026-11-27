import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { generatePassword, type PasswordPolicy } from '../../platform/terminal/public.js';
import { accountId, clearPendingPassword, promotePendingPassword, setPendingPassword } from '../accounts/public.js';
import { daysLeft, markPasswordChanged, markPasswordUnconfirmed, type HealthReport } from '../health/public.js';
import { loginWithPassword, type Session } from '../session/public.js';
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
  /** `session` is the login with the new password that proved it; use it from here on. */
  | { status: 'changed'; session: Session }
  /** `session` is set when the old password was proved again after the change. */
  | { status: 'rejected'; message: string; session?: Session }
  /** The request may or may not have reached MeroShare. The new password stays pending; the next login settles it. */
  | { status: 'unknown'; message: string }
  /** MeroShare said yes, but neither password logs in. Both are kept; the account is marked blocked. */
  | { status: 'blocked'; message: string };

const NEW_NOT_ACCEPTED = 'MeroShare did not accept the new password';

function refused(err: unknown): boolean {
  return err instanceof MeroShareError && err.isDefiniteRejection;
}

export class PasswordChangeBlockedError extends Error {}

/** True when nothing but the password blocks the account, so the change call is allowed. */
export function canChangePassword(session: Session): boolean {
  return session.blocked.every((b) => b.fix === 'password');
}

/**
 * Two-phase change:
 * 1. write the new password as `pendingPassword` (encrypted) before the request;
 * 2. on a clear refusal (4xx), clear pending;
 *    on no clear answer (network, 5xx, bot page, timeout), keep pending, so the next login can try it;
 * 3. on a 2xx, do not trust the body: prove the new password with one login.
 *    It works: make it the password. It is refused: try the old one once.
 *    The old one works: clear pending ("did not accept"). Both refused: keep both, mark blocked, notify.
 *    No clear answer at either login: keep pending, as in step 2.
 * The change request is never retried.
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
  return confirmChange(ctx, session, newPassword);
}

async function confirmChange(ctx: AppContext, session: Session, newPassword: string): Promise<ChangeOutcome> {
  const id = accountId(session.account);
  const kept = `MeroShare answered yes, but the new password could not be checked`;
  let proved: Session;
  try {
    proved = await loginWithPassword(ctx, session.account, newPassword);
  } catch (err) {
    if (!refused(err)) return { status: 'unknown', message: `${kept} (${friendlyMessage(err)})` };
    try {
      const old = await loginWithPassword(ctx, session.account, session.account.password);
      clearPendingPassword(ctx, id);
      return { status: 'rejected', message: NEW_NOT_ACCEPTED, session: old };
    } catch (err2) {
      if (!refused(err2)) return { status: 'unknown', message: `${kept} (${friendlyMessage(err2)})` };
      const message = markPasswordUnconfirmed(ctx, session.account);
      await ctx.notifier.send({
        kind: 'accountBlocked',
        account: session.account.name,
        subject: `${session.account.name}: MeroShare password needs a check`,
        lines: [`${session.account.name}: ${message}.`, 'ipo makes no more attempts with this account until it is fixed.'],
      });
      return { status: 'blocked', message };
    }
  }
  const promoted = promotePendingPassword(ctx, id, newPassword);
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
  return { status: 'changed', session: { ...proved, account: promoted } };
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
