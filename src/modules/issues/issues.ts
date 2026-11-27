import type { AppContext } from '../../platform/context/public.js';
import type { Session } from '../session/public.js';
import { ApplicableIssues, type Issue } from './endpoints.js';

/** The issues this account can see, with its own `action` on each. */
export function listIssues(ctx: AppContext, session: Session): Promise<Issue[]> {
  return ctx.client.call(ApplicableIssues, undefined, session);
}

/** True when this account already applied (or has a form in process or to reapply). */
export function hasActed(issue: Issue): boolean {
  return typeof issue.action === 'string' && issue.action.trim() !== '';
}

/** Category filter of auto-apply: the issue's share type contains one of the categories. Empty means all. */
export function matchesCategories(issue: Issue, categories: string[]): boolean {
  if (!categories.length) return true;
  const type = `${issue.shareTypeName} ${issue.shareGroupName}`.toLowerCase();
  return categories.some((c) => type.includes(c.toLowerCase()));
}
