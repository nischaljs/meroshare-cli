import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasActed, matchesCategories, IssueSchema } from './public.js';

const issue = (over = {}) => IssueSchema.parse({ companyShareId: 1, companyName: 'X', shareTypeName: 'IPO', ...over });

test('an action of any kind means the account already acted', () => {
  assert.equal(hasActed(issue()), false);
  assert.equal(hasActed(issue({ action: null })), false);
  assert.equal(hasActed(issue({ action: ' ' })), false);
  assert.equal(hasActed(issue({ action: 'edit' })), true);
  assert.equal(hasActed(issue({ action: 'reapply' })), true);
});

test('categories match the share type; none means all', () => {
  assert.equal(matchesCategories(issue(), []), true);
  assert.equal(matchesCategories(issue(), ['ipo']), true);
  assert.equal(matchesCategories(issue({ shareTypeName: 'FPO' }), ['IPO']), false);
});
