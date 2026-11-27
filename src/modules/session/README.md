# modules/session

Logs an account in and reads the account-state flags from the login answer.

- `openSession(ctx, account)`: login through the MeroShare socket. Returns the token, the flags and `blocked` (the reasons that stop the account).
- Blocking flags: `passwordExpired`, `changePassword`, `accountExpired`, `dematExpired`, `isTransactionPINNotSetBefore`, `isTransactionPINReset`. `passwordPolicyChanged` is a warning only.
- `requireUsable(session)` throws `AccountBlockedError` with the reasons. Callers check it before any other call.
- Recovery: when the stored password is refused and `pendingPassword` is set (a change whose answer was lost), the pending password is tried once and kept on success.
- `loginWithPassword(ctx, account, pw)`: one login with that exact password, no fallback and no store write. The password module uses it to prove a change.
- `createSessionPool(ctx)`: the sessions of one run. `get(account)` logs in on the first call and gives the same outcome (session or failure) after that, so an account logs in at most once per run; `getMany` paces only the new ones; `replace` swaps in a session from a later login; `fail` makes later steps skip the account; `closeAll` logs out every session. A login counts as one attempt even when it tries the stored and then the pending password (two tries at most).
- `openSessions(ctx, accounts)` opens many, two at a time, with `ctx.accountGapMs` between starts, and never throws.
- Plugs into the MeroShare socket: `Login` (POST `/meroShare/auth/`), `Logout` (best effort, path not confirmed).
