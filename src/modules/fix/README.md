# modules/fix

`ipo fix <account>`: logs in, finds what is wrong (login flags plus the health check) and runs one fix.

- Password: shows the server's rules, offers a generated password or one the person types (checked against the rules, typed twice), shows a summary, needs a typed "yes", then `modules/password` changes it in two phases.
- Renewal: lists the payment partners MeroShare offers, shows the charges as MeroShare states them, asks what to renew and for how many years, needs a typed "yes", then `modules/renewal` opens the partner's payment page.
- PIN: explains that the PIN is set on meroshare.cdsc.com.np.
- A block ipo cannot fix (no bank linked, Role Not Authorized): prints the finding and what to do instead (`blockedActions` from `health`), never "nothing to fix". The check it just ran is saved, so the daily job's hold follows it.

A module of its own because it combines password, renewal and health; none of them imports it.
