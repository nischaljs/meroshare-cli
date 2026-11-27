import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { pacedMap } from '../../platform/terminal/public.js';
import { accountId, promotePendingPassword, type Account } from '../accounts/public.js';
import { blockingReasons, parseFlags, type BlockReason, type LoginFlags } from './flags.js';
import { Login, Logout } from './endpoints.js';

export interface Session {
  account: Account;
  token: string;
  name: string;
  demat: string;
  flags: LoginFlags;
  /** Non-empty means the account must not be used for anything but its fix. */
  blocked: BlockReason[];
  /** True when the stored password failed and the pending one worked (and was promoted). */
  recoveredPending: boolean;
}

export class AccountBlockedError extends Error {
  constructor(readonly account: Account, readonly reasons: BlockReason[]) {
    super(`${account.name}: ${reasons.map((r) => r.message).join('; ')}. Run "ipo doctor".`);
    this.name = 'AccountBlockedError';
  }
}

export class LoginError extends Error {
  constructor(readonly account: Account, readonly cause: unknown) {
    super(`${account.name}: login failed: ${friendlyMessage(cause)}`);
    this.name = 'LoginError';
  }
}

export function isInvalidCredentials(err: unknown): boolean {
  return (
    err instanceof MeroShareError &&
    err.kind === 'http' &&
    (err.status === 401 || err.status === 400 || err.status === 403) &&
    !err.isRoleNotAuthorized
  );
}

async function loginWith(ctx: AppContext, account: Account, password: string) {
  return ctx.client.login(Login, { clientId: account.dpId, username: account.username, password });
}

/**
 * Logs in. When the stored password is refused and a pending password exists
 * (a change whose answer never arrived), tries the pending one and keeps it on success.
 */
export async function openSession(ctx: AppContext, account: Account): Promise<Session> {
  let res: Awaited<ReturnType<typeof loginWith>>;
  let current = account;
  let recoveredPending = false;
  try {
    res = await loginWith(ctx, account, account.password);
  } catch (err) {
    if (!(isInvalidCredentials(err) && account.pendingPassword)) throw new LoginError(account, err);
    try {
      res = await loginWith(ctx, account, account.pendingPassword);
    } catch (err2) {
      throw new LoginError(account, err2);
    }
    current = promotePendingPassword(ctx, accountId(account), account.pendingPassword);
    recoveredPending = true;
  }
  const flags = parseFlags(res.data);
  return {
    account: current,
    token: res.token,
    name: typeof res.data.name === 'string' && res.data.name ? res.data.name : account.name,
    demat: typeof res.data.demat === 'string' ? res.data.demat : account.demat,
    flags,
    blocked: blockingReasons(flags),
    recoveredPending,
  };
}

/** Throws AccountBlockedError when a flag stops the account. */
export function requireUsable(session: Session): Session {
  if (session.blocked.length) throw new AccountBlockedError(session.account, session.blocked);
  return session;
}

export async function closeSession(ctx: AppContext, session: Session): Promise<void> {
  try {
    await ctx.client.call(Logout, undefined, session);
  } catch {
    // best effort
  }
}

export type SessionOutcome =
  | { account: Account; ok: true; session: Session }
  | { account: Account; ok: false; error: string };

/** Opens sessions for many accounts, two at a time with a gap between starts. Never throws. */
export async function openSessions(ctx: AppContext, accounts: Account[]): Promise<SessionOutcome[]> {
  return pacedMap(accounts, { concurrency: 2, gapMs: ctx.accountGapMs, sleep: ctx.sleep }, async (account) => {
    try {
      return { account, ok: true as const, session: await openSession(ctx, account) };
    } catch (err) {
      return { account, ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
