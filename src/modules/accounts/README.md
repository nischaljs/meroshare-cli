# modules/accounts

Owns the `accounts` section of the store (same name and fields as the version 1 file, plus `pendingPassword`).

- `state.ts`: the zod schema. `password`, `pendingPassword`, `crn` and `pin` are `secret()`, so the store encrypts them.
- `accounts.ts`: `listAccounts`, `findAccount` (name, username or number), `addAccount`, `updateAccount`, `removeAccount`, the password phases (`setPendingPassword`, `promotePendingPassword`, `clearPendingPassword`) and the reads `getDpList`, `getBanks`, `getBankDetail`.
- `commands.ts`: `ipo init` (setup, add, list, edit, remove) and `ipo accounts password <account>`, which shows the stored password after the master password.

An account's id is `dpId:username`; other sections key their data by it.
