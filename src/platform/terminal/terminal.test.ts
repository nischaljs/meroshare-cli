import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generatePassword, PasswordPolicyError } from './public.js';
import { openPaymentPage } from './browser.js';

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test('a generated password never exceeds maxLength and still meets the counts', () => {
  for (let i = 0; i < 200; i++) {
    const pw = generatePassword({ minLength: 8, maxLength: 10, upper: 3, lower: 3, digits: 2, special: 2 });
    assert.equal(pw.length, 10);
    assert.ok(count(pw, /[A-Z]/g) >= 3 && count(pw, /[a-z]/g) >= 3 && count(pw, /\d/g) >= 2 && count(pw, /[!@#$%^&*]/g) >= 2, pw);
  }
  // with no special asked for and no room left, none is forced in
  const tight = generatePassword({ minLength: 3, maxLength: 3, upper: 1, lower: 1, digits: 1, special: 0 });
  assert.equal(tight.length, 3);
});

test('counts that cannot fit throw a clear error', () => {
  assert.throws(
    () => generatePassword({ minLength: 8, maxLength: 6, upper: 2, lower: 2, digits: 2, special: 2 }),
    (e: unknown) => e instanceof PasswordPolicyError && /ask for 8 set characters but allow only 6/.test(e.message),
  );
  assert.throws(() => generatePassword({ minLength: 20, maxLength: 12, upper: 1, lower: 1, digits: 1, special: 1 }), PasswordPolicyError);
});

test('the payment page folder is removed after its time', async () => {
  const file = openPaymentPage({ url: 'https://pay.example.test/', fields: [{ name: 'a', value: 'b' }] }, { open: false, ttlMs: 30 });
  assert.ok(fs.existsSync(file));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(fs.existsSync(path.dirname(file)), false);
});
