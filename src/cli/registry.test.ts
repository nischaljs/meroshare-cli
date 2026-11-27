import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgram } from './registry.js';
import { COMMANDS } from './commands.js';
import { defineCommand } from '../platform/command/public.js';
import type { AppContext } from '../platform/context/public.js';

test('every command in the list becomes a CLI command; help builds no context', () => {
  let built = 0;
  const program = buildProgram(COMMANDS, { context: () => { built++; return {} as AppContext; } });
  assert.deepEqual(program.commands.map((c) => c.name()), COMMANDS.map((c) => c.name));
  assert.ok(program.commands.find((c) => c.name() === 'doctor'));
  assert.ok(program.commands.find((c) => c.name() === 'fix'));
  program.helpInformation();
  assert.equal(built, 0);
});

test('a handler error exits 1 with the plain message', async () => {
  const codes: number[] = [];
  const ctx = { store: { exists: () => false } } as unknown as AppContext;
  const cmd = defineCommand({ name: 'boom', description: 'x', handler: async () => { throw new Error('nope'); } });
  const program = buildProgram([cmd], { context: () => ctx, exit: ((c: number) => void codes.push(c)) as (c: number) => never });
  const err = console.error;
  console.error = () => {};
  try {
    await program.parseAsync(['node', 'ipo', 'boom']);
  } finally {
    console.error = err;
  }
  assert.deepEqual(codes, [1]);
});
