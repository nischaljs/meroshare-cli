import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_CHOICES, notifyCommand } from './public.js';

test('the wizard offers every notice kind a module sends, once', () => {
  const kinds = EVENT_CHOICES.map((c) => c.kind);
  assert.deepEqual([...kinds].sort(), ['accountBlocked', 'allocated', 'applied', 'notAllocated', 'passwordChanged', 'renewalDue', 'resultOut']);
  assert.equal(notifyCommand.name, 'notify');
});
