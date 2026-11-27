import crypto from 'node:crypto';

export interface PasswordPolicy {
  minLength: number;
  maxLength?: number;
  upper: number;
  lower: number;
  digits: number;
  special: number;
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*';

function pick(chars: string): string {
  return chars[crypto.randomInt(chars.length)];
}

/** A random password that meets the policy, from crypto randomness. */
export function generatePassword(policy: PasswordPolicy): string {
  const length = Math.max(policy.minLength, 14, policy.upper + policy.lower + policy.digits + policy.special);
  const size = policy.maxLength ? Math.min(length, policy.maxLength) : length;
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, policy.upper); i++) out.push(pick(UPPER));
  for (let i = 0; i < Math.max(1, policy.lower); i++) out.push(pick(LOWER));
  for (let i = 0; i < Math.max(1, policy.digits); i++) out.push(pick(DIGITS));
  for (let i = 0; i < Math.max(1, policy.special); i++) out.push(pick(SPECIAL));
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  while (out.length < size) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
