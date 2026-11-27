import type { AppContext } from '../../platform/context/public.js';
import { MeroShareError, friendlyMessage } from '../../platform/meroshare/public.js';
import { pacedMap } from '../../platform/terminal/public.js';
import { accountId, clearPendingPassword, promotePendingPassword, type Account } from '../accounts/public.js';
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

function toSession(account: Account, res: Awaited<ReturnType<typeof loginWith>>, recoveredPending: boolean): Session {
  const flags = parseFlags(res.data);
  return {
    account,
    token: res.token,
    name: typeof res.data.name === 'string' && res.data.name ? res.data.name : account.name,
    demat: typeof res.data.demat === 'string' ? res.data.demat : account.demat,
    flags,
    blocked: blockingReasons(flags),
    recoveredPending,
  };
}

/**
 * One login with this exact password. Writes nothing to the store and never falls back
 * to another password. Throws the MeroShare error as it came, so the caller can tell a
 * refusal (`isDefiniteRejection`) from no answer.
 */
export async function loginWithPassword(ctx: AppContext, account: Account, password: string): Promise<Session> {
  return toSession(account, await loginWith(ctx, account, password), false);
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
    // the stored password still works, so a pending one never took effect
    if (account.pendingPassword) current = clearPendingPassword(ctx, accountId(account));
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
  return toSession(current, res, recoveredPending);
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
  | { account: Account; ok: false; error: string; held?: true };

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

/**
 * The sessions of one run (the daily job): each account logs in at most once, in the
 * first step that needs it, and later steps reuse that session. A failed login is kept
 * too, so later steps skip the account without trying again.
 */
export interface SessionPool {
  /** The account's session, opened on the first call. Later calls make no login. */
  get(account: Account): Promise<SessionOutcome>;
  /** Like `get` for many accounts; only the ones not opened yet are paced. Never throws. */
  getMany(accounts: Account[]): Promise<SessionOutcome[]>;
  /** A step logged in again (a proved password change): use this session from now on. */
  replace(session: Session): Promise<void>;
  /** Later steps skip the account with this reason. */
  fail(account: Account, error: string): Promise<void>;
  /**
   * Before any login: the account is not logged in this run. `get` gives a failure with
   * `held: true`, so a step skips it and keeps the saved health check as it is.
   */
  hold(account: Account, reason: string): void;
  /** Logs out every open session. */
  closeAll(): Promise<void>;
}

export function createSessionPool(ctx: AppContext): SessionPool {
  const outcomes = new Map<string, Promise<SessionOutcome>>();
  const replaced: Session[] = [];

  const open = (account: Account): Promise<SessionOutcome> =>
    openSession(ctx, account).then(
      (session) => ({ account, ok: true as const, session }),
      (err) => ({ account, ok: false as const, error: err instanceof Error ? err.message : String(err) }),
    );

  const pool: SessionPool = {
    get(account) {
      const id = accountId(account);
      let o = outcomes.get(id);
      if (!o) {
        o = open(account);
        outcomes.set(id, o);
      }
      return o;
    },
    async getMany(accounts) {
      const fresh = accounts.filter((a) => !outcomes.has(accountId(a)));
      await pacedMap(fresh, { concurrency: 2, gapMs: ctx.accountGapMs, sleep: ctx.sleep }, (a) => pool.get(a));
      return Promise.all(accounts.map((a) => pool.get(a)));
    },
    async replace(session) {
      const id = accountId(session.account);
      const prev = await outcomes.get(id);
      // the old session is logged out at the end, with the rest
      if (prev?.ok && prev.session !== session) replaced.push(prev.session);
      outcomes.set(id, Promise.resolve({ account: session.account, ok: true as const, session }));
    },
    async fail(account, error) {
      const id = accountId(account);
      const prev = await outcomes.get(id);
      if (prev?.ok) replaced.push(prev.session);
      outcomes.set(id, Promise.resolve({ account, ok: false as const, error }));
    },
    hold(account, reason) {
      const id = accountId(account);
      if (outcomes.has(id)) throw new Error(`${account.name}: already logged in this run; hold it before any login`);
      outcomes.set(id, Promise.resolve({ account, ok: false as const, error: reason, held: true as const }));
    },
    async closeAll() {
      const all = await Promise.all(outcomes.values());
      outcomes.clear();
      const sessions = [...replaced.splice(0), ...all.flatMap((o) => (o.ok ? [o.session] : []))];
      for (const s of sessions) await closeSession(ctx, s);
    },
  };
  return pool;
}
