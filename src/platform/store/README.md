# platform/store: the config socket

The only code that touches `config.json`. It owns:

- the folder: `IPO_HOME`, else `~/.ipo` (mode 0700, file 0600)
- the lock file `config.json.lock`: it holds a random token and only its holder removes it. A lock older than 15 s is treated as left by a crash; a waiter takes it over by an atomic rename, so only one waiter wins
- atomic writes: temp file, fsync, rename. A crash before the rename leaves the old file whole.
- encryption: AES-256-GCM, key from the master password (PBKDF2). The master password is kept as a PBKDF2 hash.
- migration: an old file is brought to the current `version` in memory and written in the new format on the next save.
- revisions: one counter per section.

## What plugs in

A module declares its section with a zod schema in its own `state.ts`:

```ts
export const AccountsSection = defineSection('accounts', ({ secret }) =>
  z.array(z.object({ name: z.string(), password: secret() })).default([]),
);
```

- `secret()` marks a string the store encrypts on write and decrypts on read. Modules never call crypto.
- The schema must accept `undefined` (`.default(...)`), so a missing section reads as its default.
- New fields need a default, so older files still parse.

## How to use it

```ts
const accounts = store.section(AccountsSection);
const { value, revision } = accounts.read();
accounts.update((list) => { list.push(a); }, { revision }); // StaleRevisionError if someone wrote in between
```

- `update(fn)` without `revision` reads and writes under the lock in one step (safe for small merges).
- Pass the `revision` you read when the change depends on what you showed the person.
- Secrets read as `LOCKED` until `store.unlock(masterPassword)`. Writing a section with a locked secret throws `StoreLockedError`.

## Versions

| version | change |
|---|---|
| 1 (no field) | the original format |
| 2 | adds `version` and `revisions`; sections keep their names (`accounts`, `auto`, `email`) and new fields come from schema defaults |
