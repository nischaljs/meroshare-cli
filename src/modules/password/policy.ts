import type { PasswordPolicy } from '../../platform/terminal/public.js';

/** Used when MeroShare's policy answer cannot be read. */
export const FALLBACK_POLICY: PasswordPolicy = { minLength: 8, upper: 1, lower: 1, digits: 1, special: 1 };

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v);
  if (v === true) return 1;
  return null;
}

function flatten(body: unknown): Record<string, unknown> {
  let b = body;
  if (Array.isArray(b)) b = b[0];
  if (b && typeof b === 'object' && 'object' in b && typeof (b as { object: unknown }).object === 'object') {
    b = (b as { object: unknown }).object;
    if (Array.isArray(b)) b = b[0];
  }
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

/**
 * Reads the policy answer by key names (min/max length, upper, lower, digit, special).
 * The field names are a guess; anything not found keeps the fallback value.
 */
export function parsePolicy(body: unknown): { policy: PasswordPolicy; fromServer: boolean } {
  const src = flatten(body);
  const policy: PasswordPolicy = { ...FALLBACK_POLICY };
  let found = false;
  for (const [key, raw] of Object.entries(src)) {
    const k = key.toLowerCase();
    const v = num(raw);
    if (v === null) continue;
    if (k.includes('length') && k.includes('max')) (policy.maxLength = v), (found = true);
    else if (k.includes('length')) (policy.minLength = v), (found = true);
    else if (k.includes('upper')) (policy.upper = v), (found = true);
    else if (k.includes('lower')) (policy.lower = v), (found = true);
    else if (k.includes('digit') || k.includes('numeric') || k.includes('number')) (policy.digits = v), (found = true);
    else if (k.includes('special') || k.includes('symbol')) (policy.special = v), (found = true);
  }
  return { policy, fromServer: found };
}

function count(re: RegExp, s: string): number {
  return (s.match(re) ?? []).length;
}

/** Problems with a new password, empty when it is fine. */
export function checkPassword(policy: PasswordPolicy, pw: string, old?: string): string[] {
  const out: string[] = [];
  if (pw.length < policy.minLength) out.push(`at least ${policy.minLength} characters`);
  if (policy.maxLength && pw.length > policy.maxLength) out.push(`at most ${policy.maxLength} characters`);
  if (count(/[A-Z]/g, pw) < policy.upper) out.push(`${policy.upper} capital letter(s)`);
  if (count(/[a-z]/g, pw) < policy.lower) out.push(`${policy.lower} small letter(s)`);
  if (count(/[0-9]/g, pw) < policy.digits) out.push(`${policy.digits} digit(s)`);
  if (count(/[^A-Za-z0-9\s]/g, pw) < policy.special) out.push(`${policy.special} special character(s)`);
  if (/\s/.test(pw)) out.push('no spaces');
  if (old !== undefined && pw === old) out.push('different from the current password');
  return out;
}

export function describePolicy(p: PasswordPolicy): string {
  const parts = [`${p.minLength}${p.maxLength ? `-${p.maxLength}` : '+'} characters`];
  if (p.upper) parts.push(`${p.upper} capital`);
  if (p.lower) parts.push(`${p.lower} small`);
  if (p.digits) parts.push(`${p.digits} digit`);
  if (p.special) parts.push(`${p.special} special`);
  return parts.join(', ');
}
