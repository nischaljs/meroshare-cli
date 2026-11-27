# platform/notify: the notify socket

Owns delivery. A module sends a typed notice and never imports nodemailer.

```ts
await notifier.send({ kind: 'renewalDue', account: 'Ram', subject: 'DEMAT expires in 7 days', lines: ['Run: ipo fix Ram'] });
```

- `kind`: one of `applied`, `resultOut`, `allocated`, `notAllocated`, `passwordChanged`, `renewalDue`, `accountBlocked`, `test`. Add a kind here when a module needs a new one.
- Channels: the terminal (one `[notice]` line) always, and email when the `email` section is set and the store is unlocked.
- `email.events[kind] === false` turns a kind off for email. A kind that is not listed is sent, so new kinds reach old configs.
- An email failure never throws; `send` returns `{ email: 'failed', error }`.
- The `email` section (address, encrypted app password, SMTP host and port, events) is defined in `state.ts` here. `ipo notify` (module `notifications`) writes it.
- Tests pass a fake `transport` and `print: null`.
