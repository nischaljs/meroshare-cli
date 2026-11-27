# platform

The sockets. Platform code never imports a module or the CLI. Only platform may import `node:fs`, `node:crypto`, `node:http(s)`, `node:child_process`, `nodemailer` or `node-cron`, or call `fetch`.

| folder | owns |
|---|---|
| `store` | config file, lock, revisions, encryption, migration |
| `meroshare` | every HTTP call to MeroShare and the result site |
| `notify` | delivery of notices (terminal, email) |
| `scheduler` | cron |
| `terminal` | screen output, pacing, random passwords, opening the payment page |
