# modules/apply

Applies for open issues from many accounts.

1. `planApply`: opens a session per account (two at a time, a gap between accounts). A blocked account (a login flag, an expired date, Role Not Authorized, no bank) or a failed login is skipped with the reason and its fix. The health cache is refreshed. The issue list comes from the first healthy account.
2. `runApply(plan, selections)`: for each account and issue, reads the account's own issue list first. A set `action` (`edit`, `inProcess`, `reapply`) means it already acted: nothing is sent. Otherwise reads the bank and sends `POST /meroShare/applicantForm/share/apply` once. The request is a write and is never retried; a 409 or "application in process" counts as already applied. Sends an `applied` notice.
3. `autoKitta`: the kitta automation asks for.

One apply run at a time: `lockApply(ctx)` holds the scheduler's run lock (`apply`, in the store's folder) from the logins to the last result, in the `apply` command and in `autoApply` (auto run, the scheduler). A second run gets `ApplyBusyError`, says "Another ipo apply is running" and sends nothing.

The `apply` prompt caps the kitta at `maxUnit`. When MeroShare gives no `maxUnit`, there is no cap of ours and the prompt says "max not given by MeroShare". MeroShare's issue data has no multiple or step field (only `minUnit`, `maxUnit`, `sharePerUnit`, `shareValue`), so kitta is not rounded to one.

Tokens are opened at the start and used through the prompts; a long pause at a prompt may outlive them.
