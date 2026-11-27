# modules/health

Account health: expiry dates, PIN state, bank link, and what to fix.

- `checkSession(ctx, session)`: when a login flag blocks the account, findings come from the flags only (no other call). Otherwise reads `GET /meroShare/ownDetail/` (password, MeroShare and DEMAT expiry) and the bank list.
- Dates: calendar days are counted in Nepal time (UTC+05:45) for both the stored date and today, whatever the machine's zone (`dates.ts`).
- Severity: `blocked` (a login flag, a MeroShare refusal, no bank), `urgent` (7 days or less, or a date that has passed: a computed date never blocks, so apply still tries and MeroShare decides), `warn` (30 days or less), `ok`, `error` (login or read failed).
- `runDoctor(ctx, pool?)`: every account, two at a time with a gap, then saves the snapshots. Read only. With a pool (the daily job) the sessions stay open in it for later steps; without one they are closed. An account the pool holds makes no login: its cached report is returned and not saved again.
- `expiryBanner(ctx)`: one line from the cached snapshots; no login. The CLI prints it before every command.
- Reminders: `dueReminders(ctx, thresholds)` and `markRemindersSent(ctx, keys)`. A key is `account:kind:expiry:threshold`; when a reminder goes out, every larger threshold is marked too, so each goes once and a late run sends only the most specific one.
- State (`state.ts`, section `health`): `snapshots` per account id and `remindersSent`. `moveHealth(ctx, fromId, toId)` moves both when `ipo init edit` changes an account's DP or username.
- Command: `ipo doctor`.
