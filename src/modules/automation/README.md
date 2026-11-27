# modules/automation

The daily job behind `ipo auto`. It is a list of steps; each step is `{ name, order, run(ctx, bag) }` and they run by `order`:

| order | step | does |
|---|---|---|
| 10 | health | holds the accounts the last check found blocked (see below), then `runDoctor`: logs in to every other account, refreshes the health cache |
| 20 | password | only when `autoPassword` is on: changes the password of each account whose report has `rotationReason` (expired, MeroShare asks, rules changed, or 7 days or less left), with the two-phase change |
| 30 | renewal-warnings | renewal reminders at 30/14/7/3/1 days, each once, from the cache (no login) |
| 40 | apply | `autoApply`: open issues in the chosen categories, kitta capped at `maxKitta`. Does nothing when auto-apply is off (`enabled` false) |

To add a step, write one and add it to `DAILY_STEPS`. A step that throws is logged and the next one runs. Steps share a `RunBag` (the settings, the health reports, the log lines, and the run's session pool).

Each account logs in once per run: the health step opens the session, and the password and apply steps reuse it (`createSessionPool` in `modules/session`). A failed login is not tried again in that run: later steps skip the account and the health snapshot records the error. A password change adds one login to prove the new password (two when the new one is refused and the old one is tried).

Blocked accounts are held. Before any login, the health step reads the saved checks (`cachedReports`). An account whose last check is `blocked` is put on hold in the pool (`sessions.hold`): no step logs in with it and its saved check stays as it is. Blocked means a login flag, Role Not Authorized, no bank linked, a password ipo could not confirm after a change, or MeroShare saying the stored password is wrong (a 401 with no pending password). A network error, a timeout or a MeroShare outage is only an `error` and is not held, so one bad day does not stop applies.

What the person sees:
- The run's lines say, per held account, why it is blocked and the action for each finding (`blockedActions` in `health`): `ipo fix <account>` for a flag ipo can fix, `ipo init edit <account>` then `ipo fix <account>` for a wrong or unconfirmed password, the MeroShare website then `ipo doctor` for no bank or Role Not Authorized. They also say it stays held until the person checks it again with `ipo doctor` (or `ipo fix`): a fix made on the MeroShare website is not seen until then.
- One "account blocked" email (kind `accountBlocked`) per block, on the run that finds it, not one a day. The health section keeps the block each email was sent for (`blockedNoticesDue`, `markBlockedNotified`); when the hold ends the entry is dropped, so a later block is emailed again. A block found by the password change itself is emailed there and counts as sent.
- The apply results email, when something else was applied, also lists the held account as skipped.

If the saved checks cannot be read, the step fails closed: every account is held, no step logs in, and the line says apply is skipped in this run.

The hold ends when a command the person runs checks the account again and finds it no longer blocked: `ipo fix`, or `ipo doctor` / `ipo apply`, which log in outside the daily job. One exception: when `autoPassword` is on and a password change fixes everything that blocks the account (`passwordChangeUnblocks`: an expired password, or MeroShare asks for a new one), the account is not held, so the password step can change it. `accountsToHold(reports, settings)` is the rule.

Commands: `ipo auto config`, `start` (cron in this process, writes `auto.pid`), `run` (once now), `stop` (SIGTERM to the pid), `status`.
