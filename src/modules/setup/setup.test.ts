import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initCommand, accountsCommand } from './public.js';

test('setup commands plug in with their subcommands', () => {
  assert.equal(initCommand.name, 'init');
  assert.equal(accountsCommand.name, 'accounts');
  assert.ok((initCommand.subcommands ?? []).length > 0);
  assert.ok((accountsCommand.subcommands ?? []).some((s) => s.name === 'password'));
});
