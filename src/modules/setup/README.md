# modules/setup

`ipo init` (setup, add, list, edit, remove) and `ipo accounts password <account>`.

Adding or editing an account logs in once (`modules/session`) to check the details and read the bank: if MeroShare reports a block (an expired password, account or DEMAT), the account is saved anyway with a warning and no bank, so `ipo fix` can repair it. The data itself belongs to `modules/accounts`.

`ipo accounts password <account>` shows the stored password after the master password, and says when a password change is still pending.
