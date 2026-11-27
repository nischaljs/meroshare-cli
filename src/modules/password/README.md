# modules/password

Changes a MeroShare password safely.

- `getPolicy`: `GET /passwordPolicy/used/`, read by key names (the shape is a guess). Fallback: 8+ characters, 1 capital, 1 small, 1 digit, 1 special.
- `checkPassword(policy, pw, old)`: the problems, empty when fine.
- `changePassword(ctx, session, pw)`: two phases. `pendingPassword` is written encrypted before `POST /meroShare/changePassword/`. Success makes it the password; a clear refusal (4xx) clears it; no clear answer keeps it, and `modules/session` tries it at the next login when the old password is refused. Never retried. Sends a `passwordChanged` notice without the password.
- `rotationReason(report, now)` and `rotatePassword`: used by the automation step when `autoPassword` is on (expires within 7 days, or a password flag is set).
