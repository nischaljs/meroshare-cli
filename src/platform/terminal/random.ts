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

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

/**
 * A random password that meets the policy, from crypto randomness. Never longer than
 * `maxLength`. Each class appears at least once when there is room. Throws
 * `PasswordPolicyError` when the required counts cannot fit.
 */
export function generatePassword(policy: PasswordPolicy): string {
  const classes: [string, number][] = [
    [UPPER, Math.max(0, policy.upper)],
    [LOWER, Math.max(0, policy.lower)],
    [DIGITS, Math.max(0, policy.digits)],
    [SPECIAL, Math.max(0, policy.special)],
  ];
  const required = classes.reduce((n, [, c]) => n + c, 0);
  const max = policy.maxLength;
  if (max !== undefined && max > 0) {
    if (required > max) {
      throw new PasswordPolicyError(`The password rules ask for ${required} set characters but allow only ${max} in all.`);
    }
    if (policy.minLength > max) {
      throw new PasswordPolicyError(`The password rules ask for at least ${policy.minLength} characters but allow only ${max}.`);
    }
  }
  const wanted = Math.max(policy.minLength, 14, required);
  const size = max !== undefined && max > 0 ? Math.min(wanted, max) : wanted;
  const out: string[] = [];
  for (const [chars, count] of classes) for (let i = 0; i < count; i++) out.push(pick(chars));
  for (const [chars, count] of classes) if (count === 0 && out.length < size) out.push(pick(chars));
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  while (out.length < size) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
