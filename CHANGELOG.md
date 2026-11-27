# Changelog

## 1.0.1 (2026-11-27)

- Published from GitHub Actions with npm provenance, so npm shows which commit built it. What `ipo` does has not changed.
- The `bin` paths in package.json no longer start with `./`, which npm warned about when publishing.

## 1.0.0 (2026-11-27)

The first release on npm. Install it with `npm install -g meroshare-cli`; the command is `ipo`.

- `ipo init` sets a master password and adds the family's MeroShare accounts. Passwords, CRN and PIN are encrypted on your computer with AES-256-GCM and go to MeroShare only.
- `ipo apply` applies for the open IPOs from every healthy account, after one yes.
- `ipo result` checks the IPO results for every account in one table.
- `ipo doctor` checks every account (password, MeroShare and DEMAT expiry, transaction PIN) and changes nothing.
- `ipo fix <account>` changes an expired password, opens the renewal payment page or says what to do about the PIN.
- `ipo accounts password <account>` shows the password ipo stored for an account.
- `ipo notify` sets up email alerts from your own email account.
- `ipo auto` runs the daily job: health check, optional automatic password change, renewal warnings 30, 14, 7, 3 and 1 days before, and applies for the IPO kinds you chose. An account with a blocked or wrong password is held until you check it again.
- Writes to MeroShare (an apply, a password change) are sent once and never retried.
