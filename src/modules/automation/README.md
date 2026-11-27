# modules/automation

The daily job behind `ipo auto`. It is a list of steps; each step is `{ name, order, run(ctx, bag) }` and they run by `order`:

| order | step | does |
|---|---|---|
| 10 | health | `runDoctor`: logs in to every account, refreshes the health cache |
| 20 | password | only when `autoPassword` is on: changes the password of each account whose report has `rotationReason` (expired, MeroShare asks, rules changed, or 7 days or less left), with the two-phase change |
| 30 | renewal-warnings | renewal reminders at 30/14/7/3/1 days, each once, from the cache (no login) |
| 40 | apply | `autoApply`: open issues in the chosen categories, kitta capped at `maxKitta` |

To add a step, write one and add it to `DAILY_STEPS`. A step that throws is logged and the next one runs. Steps share a `RunBag` (the settings, the health reports, the log lines).

Each account is logged in to about twice a day (health, then apply), and once more when its password changes.

Commands: `ipo auto config`, `start` (cron in this process, writes `auto.pid`), `run` (once now), `stop` (SIGTERM to the pid), `status`.
