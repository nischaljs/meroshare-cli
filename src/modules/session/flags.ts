import { z } from 'zod';

const truthy = z.preprocess(
  (v) => v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1' || v === 'Y' || v === 'y',
  z.boolean(),
);

/** The account-state flags in MeroShare's login answer. A missing flag reads as false. */
export const FlagsSchema = z.object({
  passwordExpired: truthy,
  passwordPolicyChanged: truthy,
  changePassword: truthy,
  accountExpired: truthy,
  dematExpired: truthy,
  isTransactionPINNotSetBefore: truthy,
  isTransactionPINReset: truthy,
});
export type LoginFlags = z.infer<typeof FlagsSchema>;

export type FixKind = 'password' | 'renewal' | 'pin';

export interface BlockReason {
  flag: keyof LoginFlags;
  message: string;
  fix: FixKind;
}

const BLOCKING: { flag: keyof LoginFlags; message: string; fix: FixKind }[] = [
  { flag: 'passwordExpired', message: 'MeroShare password has expired', fix: 'password' },
  { flag: 'changePassword', message: 'MeroShare asks for a new password', fix: 'password' },
  { flag: 'accountExpired', message: 'MeroShare account has expired', fix: 'renewal' },
  { flag: 'dematExpired', message: 'DEMAT account has expired', fix: 'renewal' },
  { flag: 'isTransactionPINNotSetBefore', message: 'Transaction PIN is not set', fix: 'pin' },
  { flag: 'isTransactionPINReset', message: 'Transaction PIN was reset and must be set again', fix: 'pin' },
];

export function parseFlags(body: unknown): LoginFlags {
  const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return FlagsSchema.parse(src);
}

/** The flags that stop the account. `passwordPolicyChanged` alone does not. */
export function blockingReasons(flags: LoginFlags): BlockReason[] {
  return BLOCKING.filter((b) => flags[b.flag]).map((b) => ({ ...b }));
}

export function noFlags(): LoginFlags {
  return parseFlags({});
}
