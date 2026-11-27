# platform/scheduler

Owns node-cron. `schedule(expr, job)` runs `job` on the cron schedule and skips a tick while the run before is still going. `getAutoStartInstructions()` prints how to start `ipo auto start` at boot on Linux, macOS and Windows. The daily job itself (its steps) belongs to `modules/automation`.

`writePid` / `clearPid` keep `auto.pid` in the ipo home while `ipo auto start` runs, so `runningPid` (for `ipo auto status`) and `stopRunning` (for `ipo auto stop`, which sends SIGTERM) work from another process.

`auto.pid` holds JSON: the pid and a start marker, the process's command line (`/proc/<pid>/cmdline` on Linux, `ps -ww -o command= -p` on macOS). A pid counts as running only when the process is alive and its command line still matches, so a pid the OS gave to another program is never signalled. A process of another user (EPERM) and an old file with the bare pid count as stale. Windows cannot read the command line: the pid is checked for life only, and `stopRunning` returns a note that says so.
