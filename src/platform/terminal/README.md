# platform/terminal

Small helpers for the screen and the person's machine:

- `log`, `createTable`, `createSpinner`, `formatStatus`: output.
- `pacedMap(items, { concurrency, gapMs }, fn)`: runs work per account with a limit and a gap between starts.
- `generatePassword(policy)`: a random password from `node:crypto`.
- `openPaymentPage({ url, fields })`: writes an auto-submit HTML form (mode 0600) to a temp folder and opens it with `xdg-open`, `open` or `start` (no shell string). The folder is removed after 60 s (an unref'd timer) and when the process exits normally; a kill by signal can leave it. The form action must be https (or localhost). Every value is HTML-escaped.
