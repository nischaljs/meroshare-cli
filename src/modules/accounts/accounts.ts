import type { AppContext } from '../../platform/context/public.js';
import type { SessionToken } from '../../platform/meroshare/public.js';
import { AccountsSection, type Account } from './state.js';
import { BankDetail, Banks, DpList, type Bank, type BankDetail as BankDetailT } from './endpoints.js';

/** Stable id for an account: DP plus username. Used as the key in other sections. */
export function accountId(a: Pick<Account, 'dpId' | 'username'>): string {
  return `${a.dpId}:${a.username}`;
}

/** The command a person types for this account; the name is quoted when it has spaces. */
export function accountRef(a: Pick<Account, 'name'>): string {
  return /\s/.test(a.name) ? `"${a.name}"` : a.name;
}

export function listAccounts(ctx: AppContext): Account[] {
  return ctx.store.section(AccountsSection).read().value;
}

/** Finds an account by name (any case), username, or its number in `ipo init list`. */
export function findAccount(ctx: AppContext, ref: string): Account {
  const list = listAccounts(ctx);
  const r = ref.trim();
  const hit =
    list.find((a) => a.name.toLowerCase() === r.toLowerCase()) ??
    list.find((a) => a.username === r) ??
    (/^\d+$/.test(r) && Number(r) >= 1 && Number(r) <= list.length ? list[Number(r) - 1] : undefined);
  if (!hit) throw new Error(`No account "${ref}". Run "ipo init list" to see them.`);
  return hit;
}

export function addAccount(ctx: AppContext, account: Account): number {
  return ctx.store.section(AccountsSection).update((list) => {
    if (list.some((a) => accountId(a) === accountId(account))) {
      throw new Error(`Account ${account.username} on this DP is already set up.`);
    }
    list.push(account);
  }).value.length;
}

/** Changes one account under the lock. `fn` gets the stored account and returns the new one. */
export function updateAccount(ctx: AppContext, id: string, fn: (a: Account) => Account): Account {
  let out!: Account;
  ctx.store.section(AccountsSection).update((list) => {
    const i = list.findIndex((a) => accountId(a) === id);
    if (i < 0) throw new Error('Account not found; it may have been removed.');
    out = fn({ ...list[i] });
    list[i] = out;
  });
  return out;
}

export function removeAccount(ctx: AppContext, id: string): void {
  ctx.store.section(AccountsSection).update((list) => list.filter((a) => accountId(a) !== id));
}

// password phases, used by modules/password and modules/session

export function setPendingPassword(ctx: AppContext, id: string, pending: string): Account {
  return updateAccount(ctx, id, (a) => ({ ...a, pendingPassword: pending }));
}

export function promotePendingPassword(ctx: AppContext, id: string, newPassword: string): Account {
  return updateAccount(ctx, id, (a) => ({ ...a, password: newPassword, pendingPassword: '' }));
}

export function clearPendingPassword(ctx: AppContext, id: string): Account {
  return updateAccount(ctx, id, (a) => ({ ...a, pendingPassword: '' }));
}

// MeroShare reads

export function getDpList(ctx: AppContext) {
  return ctx.client.call(DpList, undefined, null);
}

export function getBanks(ctx: AppContext, session: SessionToken): Promise<Bank[]> {
  return ctx.client.call(Banks, undefined, session);
}

export function getBankDetail(ctx: AppContext, session: SessionToken, bankId: number): Promise<BankDetailT> {
  return ctx.client.call(BankDetail, bankId, session);
}
