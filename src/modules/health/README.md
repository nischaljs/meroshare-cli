# modules/health

Account health: expiry dates, PIN state, bank link, and what to fix.

- `checkSession(ctx, session)`: when a login flag blocks the account, findings come from the flags only (no other call). Otherwise reads `GET /meroShare/ownDetail/` (password, MeroShare and DEMAT expiry) and the bank list.
- Severity: `blocked` (flag set, date passed, no bank), `urgent` (7 days or less), `warn` (30 days or less), `ok`, `error` (login or read failed).
- `runDoctor(ctx)`: every account, two at a time with a gap, then saves the snapshots. Read only.
- `expiryBanner(ctx)`: one line from the cached snapshots; no login. The CLI prints it before every command.
- Reminders: `dueReminders(ctx, thresholds)` and `markRemindersSent(ctx, keys)`. A key is `account:kind:expiry:threshold`; when a reminder goes out, every larger threshold is marked too, so each goes once and a late run sends only the most specific one.
- State (`state.ts`, section `health`): `snapshots` per account id and `remindersSent`.
- Command: `ipo doctor`.
