# platform/scheduler

Owns node-cron. `schedule(expr, job)` runs `job` on the cron schedule and skips a tick while the run before is still going. `getAutoStartInstructions()` prints how to start `ipo auto start` at boot on Linux, macOS and Windows. The daily job itself (its steps) belongs to `modules/automation`.
