# modules/issues

Open issues (IPO, FPO, right shares, and others) from `POST /meroShare/companyShare/applicableIssue/` with `VIEW_APPLICABLE_SHARE`.

- `listIssues(ctx, session)`: the list as this account sees it.
- `hasActed(issue)`: `action` empty or missing means not applied; a value (`edit`, `inProcess`, `reapply`) means this account already acted, so apply skips it.
- `matchesCategories(issue, categories)`: the auto-apply filter.
