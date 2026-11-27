# modules/session

Logs an account in and reads the account-state flags from the login answer.

- `openSession(ctx, account)`: login through the MeroShare socket. Returns the token, the flags and `blocked` (the reasons that stop the account).
- Blocking flags: `passwordExpired`, `changePassword`, `accountExpired`, `dematExpired`, `isTransactionPINNotSetBefore`, `isTransactionPINReset`. `passwordPolicyChanged` is a warning only.
- `requireUsable(session)` throws `AccountBlockedError` with the reasons. Callers check it before any other call.
- Recovery: when the stored password is refused and `pendingPassword` is set (a change whose answer was lost), the pending password is tried once and kept on success.
- `openSessions(ctx, accounts)` opens many, two at a time, with `ctx.accountGapMs` between starts, and never throws.
- Plugs into the MeroShare socket: `Login` (POST `/meroShare/auth/`), `Logout` (best effort, path not confirmed).
