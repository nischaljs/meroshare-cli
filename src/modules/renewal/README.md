# modules/renewal

MeroShare and DEMAT renewal.

- `listPartners` (`GET /payment/partner/`), `renewalDetails` (`GET /payment/initialDetails/{partnerConfigId}`), `chargeLines` (the server's charges as it states them; nothing is added up).
- `startPayment`: `POST /payment/` once (never retried) returns `{url, paymentField[]}`; `platform/terminal` writes an auto-submit form to a private temp file and opens it. Wallet details are typed on the partner's page only. The request body (`partnerConfigId`, `paymentTypeList`, `renewalYear`) is a guess.
- `sendRenewalReminders`: at 30, 14, 7, 3 and 1 days before the MeroShare or DEMAT expiry in the cached health check, a `renewalDue` notice with `ipo fix <account>`. Each goes once (see `modules/health` reminders). A failed email is tried again on the next run.
