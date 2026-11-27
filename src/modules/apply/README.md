# modules/apply

Applies for open issues from many accounts.

1. `planApply`: opens a session per account (two at a time, a gap between accounts). A blocked account (a login flag, an expired date, Role Not Authorized, no bank) or a failed login is skipped with the reason and its fix. The health cache is refreshed. The issue list comes from the first healthy account.
2. `runApply(plan, selections)`: for each account and issue, reads the account's own issue list first. A set `action` (`edit`, `inProcess`, `reapply`) means it already acted: nothing is sent. Otherwise reads the bank and sends `POST /meroShare/applicantForm/share/apply` once. The request is a write and is never retried; a 409 or "application in process" counts as already applied. Sends an `applied` notice.
3. `autoKitta`: the kitta automation asks for.

Tokens are opened at the start and used through the prompts; a long pause at a prompt may outlive them.
