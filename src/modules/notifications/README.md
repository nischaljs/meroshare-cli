# modules/notifications

`ipo notify`: the email setup wizard. It writes the `email` section, which the notify socket (`src/platform/notify`) owns and reads when it delivers a notice. The app password is a `secret()`, so the store encrypts it. A test email goes through `notifier.test` before anything is saved. Each notice kind can be turned off; a kind that is not listed is sent.
