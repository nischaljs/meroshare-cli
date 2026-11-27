# modules/accounts

Owns the `accounts` section of the store (same name and fields as the version 1 file, plus `pendingPassword`).

- `state.ts`: the zod schema. `password`, `pendingPassword`, `crn` and `pin` are `secret()`, so the store encrypts them.
- `accounts.ts`: `listAccounts`, `findAccount` (name, username or number), `addAccount`, `updateAccount`, `removeAccount`, the password phases (`setPendingPassword`, `promotePendingPassword`, `clearPendingPassword`) and the reads `getDpList`, `getBanks`, `getBankDetail`.

An account's id is `dpId:username`; other sections key their data by it.

The commands that use these (`ipo init`, `ipo accounts`) live in `modules/setup`, because they log in through `modules/session`, which itself imports this module.
