# modules/automation

The daily job behind `ipo auto`. It is a list of steps; each step is `{ name, order, run(ctx, bag) }` and they run by `order`:

| order | step | does |
|---|---|---|
| 10 | health | `runDoctor`: logs in to every account, refreshes the health cache |
| 20 | password | only when `autoPassword` is on: changes the password of each account whose report has `rotationReason` (expired, MeroShare asks, rules changed, or 7 days or less left), with the two-phase change |
| 30 | renewal-warnings | renewal reminders at 30/14/7/3/1 days, each once, from the cache (no login) |
| 40 | apply | `autoApply`: open issues in the chosen categories, kitta capped at `maxKitta`. Does nothing when auto-apply is off (`enabled` false) |

To add a step, write one and add it to `DAILY_STEPS`. A step that throws is logged and the next one runs. Steps share a `RunBag` (the settings, the health reports, the log lines, and the run's session pool).

Each account logs in once per run: the health step opens the session, and the password and apply steps reuse it (`createSessionPool` in `modules/session`). A failed login is not tried again in that run: later steps skip the account and the health snapshot records the error. A password change adds one login to prove the new password (two when the new one is refused and the old one is tried).

Commands: `ipo auto config`, `start` (cron in this process, writes `auto.pid`), `run` (once now), `stop` (SIGTERM to the pid), `status`.
