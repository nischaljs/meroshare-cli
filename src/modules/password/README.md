# modules/password

Changes a MeroShare password safely.

- `getPolicy`: `GET /passwordPolicy/used/`, read by key names (the shape is a guess). Fallback: 8+ characters, 1 capital, 1 small, 1 digit, 1 special.
- `checkPassword(policy, pw, old)`: the problems, empty when fine.
- `changePassword(ctx, session, pw)`: two phases. `pendingPassword` is written encrypted before `POST /meroShare/changePassword/`. A clear refusal (4xx) clears it; no clear answer (network, 5xx, bot page, timeout) keeps it, and `modules/session` tries it at the next login when the old password is refused. Never retried.
- A 2xx is not trusted: one login with the new password proves it. It works: it becomes the password, a `passwordChanged` notice goes out (without the password), and the outcome carries that session. It is refused: the old password is tried once. The old one works: pending is cleared and the outcome is `rejected` ("MeroShare did not accept the new password"). Both refused: both are kept, the health snapshot marks the account blocked, an `accountBlocked` notice goes out, and the outcome is `blocked` (the automation makes no more tries this run). No clear answer at either login: `unknown`, pending kept.
- `passwordChangeUnblocks(report)`: true when every finding that blocks the account is a password flag (expired, or MeroShare asks for a new one). The daily job uses it to log in to a blocked account only when the automatic change can fix it.
- `rotationReason(report, now)` and `rotatePassword`: used by the automation step when `autoPassword` is on (expires within 7 days, or a password flag is set).
