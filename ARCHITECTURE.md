# Architecture

`ipo` is built from sockets and plugs. A socket is a platform folder that owns one kind of outside work (the config file, MeroShare's HTTP API, email, cron, the terminal). A plug is a module that owns one piece of product logic and reaches the outside only through sockets.

## Socket rules

| # | Rule | What it means | Where it is enforced |
|---|---|---|---|
| 1 | No cycles | No import cycle anywhere in `src`, `bin` or `test`. | dependency-cruiser `1-no-cycles` |
| 2 | Platform is a socket | `src/platform/*` never imports a module, the CLI or `bin`. | `2-platform-is-a-socket` |
| 3 | Modules use platform `public.ts` | A module imports a platform folder only through its `public.ts`. | `3-modules-use-platform-public` |
| 4 | Modules use other modules' `public.ts` | A module imports another module only through that module's `public.ts`. Inside its own folder it may import anything. | `4-modules-use-other-modules-public` |
| 5 | CLI uses module `public.ts` | `src/cli` and `bin` import modules only through `public.ts`. | `5-cli-uses-module-public` |
| 6 | CLI uses platform `public.ts` | `src/cli` and `bin` import platform folders only through `public.ts`. | `6-cli-uses-platform-public` |
| 7 | Modules do no I/O | A module imports no `fs`, `crypto`, `http(s)`, `net`, `child_process`, `nodemailer`, `node-cron` or fetch library, and calls no global `fetch`. | `7-modules-no-io`, `7-modules-no-io-builtins`, `test/no-fetch-in-modules.test.ts` (dependency-cruiser cannot see a global `fetch`) |
| 8 | Tests stay out of source | Source never imports a `.test.ts` file or `test/`. A `.test.ts` file may import the fake server. | `8-tests-stay-out-of-source` |

Run them with `npm run lint:deps`. `npm run check` runs the type check, these rules and the tests.

## Layers

```
bin/cli.ts            starts the CLI
src/cli/              the command list and the commander wiring (registry)
src/modules/<name>/   product logic: one folder per job, each with public.ts, README.md, tests
src/platform/<name>/  sockets: store, meroshare, notify, scheduler, terminal, context, command
test/                 the fake MeroShare server, the app harness, cross-cutting tests
```

| Socket | What plugs in | How |
|---|---|---|
| `store` | config sections | `defineSection(name, ({ secret }) => zodSchema)`. The store encrypts `secret()` fields, keeps a revision per section, writes atomically under a lock and migrates old files in memory. |
| `meroshare` | endpoints | `defineEndpoint({ name, method, path, kind: 'read' \| 'write', body, response })`, then `client.call(def, input, session)`. Reads retry on 429, 5xx, network errors and the HTML bot page (3 attempts); writes never retry. Errors are typed (`MeroShareError`, `ResponseShapeError`). |
| `command` | CLI commands | `defineCommand({ name, description, args, options, subcommands, handler })`, listed in `src/cli/commands.ts`. |
| automation (in `modules/automation`) | daily steps | `{ name, order, run(ctx, bag) }` in `DAILY_STEPS`. A failing step is logged and the next one runs. |
| `notify` | notices | `ctx.notifier.send(notice)` with a typed notice kind. The socket prints it and emails it when email is set up and that kind is on. |
| `scheduler` | — | cron, `auto.pid`, and the run lock: `acquireRunLock(home, name)` (`runlock.ts`) lets one long job run at a time across processes; `apply` holds it, a second run gets `RunBusyError`. |
| `terminal` | — | screen output, pacing, random passwords, opening a URL. |
| `context` | — | builds `AppContext` (store, MeroShare client, notifier, clock, sleep, account gap) once per command. |

Each socket's README (`src/platform/<name>/README.md`) has the details.

## Modules

| Module | Owns |
|---|---|
| `accounts` | the `accounts` section, finding an account, the pending password |
| `session` | login, the login flags, which flags block an account, the run's session pool (one login per account per run, `hold`) |
| `health` | `ipo doctor`, expiry dates, PIN and bank state, the cached snapshot and the 30-day banner, renewal reminder dedupe, `moveHealth` (the snapshot and sent reminders follow an account whose username or DP changes) |
| `password` | the two-phase password change and the auto-rotation rule |
| `renewal` | renewal charges, the payment page, the reminder emails |
| `fix` | `ipo fix <account>`: picks and runs one fix |
| `issues` | the open issue list, `hasActed`, category match |
| `apply` | `ipo apply` and auto-apply, one apply run at a time (`lockApply`, on the scheduler's run lock) |
| `results` | `ipo result` |
| `automation` | `ipo auto`, the daily step list, which blocked accounts the daily job holds |
| `notifications` | `ipo notify`, the email wizard |
| `setup` | `ipo init`, `ipo accounts` |

## Where code goes

- Talks to a file, the network, email, cron or the OS: a platform socket.
- A decision about accounts, issues, health or money: the module that owns it. Other modules call it through its `public.ts`.
- A new MeroShare endpoint: `endpoints.ts` in the module that uses it, through `defineEndpoint`.
- Stored data: a section in the owning module (`state.ts`), through `defineSection`.
- Wiring commander: only `src/cli`.

## Data flow: `ipo apply`

1. `bin/cli.ts` → `buildProgram(COMMANDS)`; commander calls `applyCommand.handler`.
2. The handler gets `AppContext` from the `context` socket and unlocks the store with the master password. `lockApply` takes the `apply` run lock; another live apply run makes this one stop with "Another ipo apply is running".
3. `accounts.listAccounts` reads the `accounts` section (secrets decrypted by the store).
4. For each account `session.openSession` logs in through the `meroshare` socket. Blocking flags or a 401 Role Not Authorized make the session blocked; `health` caches what it learned.
5. The first healthy account's session reads the issue list (`issues`). Blocked accounts are skipped with the reason and the fix (`ipo fix <account>`).
6. For each healthy account `apply` re-reads that account's issue list, skips an issue whose `action` is set, and sends the apply write once (no retry).
7. Each result is a notice (`ctx.notifier.send`); the notify socket prints it and emails it if email is on.

## Data flow: the daily run (`ipo auto run`, the scheduler)

1. `runDaily` makes one session pool for the run; the steps run by `order` (health, password, renewal warnings, apply).
2. Health: every account whose last saved check is `blocked` is held in the pool, with no login, unless `autoPassword` is on and a password change fixes the whole block (`passwordChangeUnblocks`). Then `runDoctor` logs in to the rest, once each, and saves their checks. A held account keeps its saved check.
3. Password (when `autoPassword` is on): changes each due password on the pool's session. A held account gets a "skipped" line.
4. Renewal warnings: from the cache, no login.
5. Apply: `autoApply` under the `apply` run lock, on the pool's sessions. A held or blocked account is skipped with the reason and `ipo fix <account>`; the results email lists it.
6. The hold ends when the person's own command (`ipo fix`, `ipo doctor`, `ipo apply`) checks the account again and it is no longer blocked.

## Adding a module

1. Make `src/modules/<name>/` with `public.ts`, `README.md` and a test.
2. Put endpoints in `endpoints.ts` (`defineEndpoint`), stored data in `state.ts` (`defineSection`).
3. Export only what others need from `public.ts`.
4. A command: `defineCommand` in the module, then add it to `src/cli/commands.ts`. A daily step: add it to `DAILY_STEPS`.
5. Test against `test/fake-meroshare` with `startApp` (temp home, fake server, no real host). Run `npm run check`.
