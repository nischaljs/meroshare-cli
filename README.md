# ipo

A CLI tool to bulk apply for IPOs on MeroShare (Nepal Stock Exchange) across multiple DEMAT accounts at once.

No more logging into each account manually.

<!-- ![ipo apply](assets/apply.png) -->
<!-- ![ipo result](assets/result.png) -->

## Features

- **Bulk Apply** — Apply for IPOs across all your accounts in one go
- **Check Results** — See allotment status for every account in a single table
- **Email Alerts** — Get notified when results come out or you get allotted
- **Auto Apply** — Set preferences and let it apply automatically when new IPOs open
- **Secure** — Your passwords and PINs never leave your machine. Everything is encrypted with AES-256-GCM

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher

## Installation

```bash
git clone https://github.com/nischal/nepse-ipo.git
cd nepse-ipo
npm install
npm link
```

After this, the `ipo` command will be available globally in your terminal.

## Getting Started

### 1. Set up your accounts

```bash
ipo init
```

This will walk you through:

1. Setting a **master password** (used to encrypt everything)
2. Selecting your **DP** (broker/bank) from a searchable list
3. Entering your MeroShare **username** and **password**
4. Entering your **BOID**, **CRN**, and **transaction PIN**

It will validate your login immediately and auto-fetch your bank details.

You can add multiple accounts in one go, or add more later:

```bash
ipo init add       # Add another account
ipo init list      # View all configured accounts
ipo init edit      # Edit an existing account
ipo init remove    # Remove an account
```

### 2. Apply for IPOs

```bash
ipo apply
```

1. Shows all currently open IPOs in a table
2. Asks which ones you want to apply for (Yes/No for each)
3. Asks how many kitta
4. Applies across **all your accounts** simultaneously

<!-- ![ipo apply demo](assets/apply.png) -->

### 3. Check results

```bash
ipo result
```

Shows a table with allotment status for every account:

- **ALLOTTED** — You got shares (shows how many kitta received)
- **NOT ALLOTTED** — Better luck next time
- **ERROR** — Something went wrong (e.g., block failed)

Also offers to open the [public result site](https://iporesult.cdsc.com.np) in your browser for early results (MeroShare can be ~24h behind).

<!-- ![ipo result demo](assets/result.png) -->

### 4. Email notifications (optional)

```bash
ipo notify
```

Set up email alerts so you don't have to keep checking manually. Uses Gmail app passwords (or any SMTP).

Events you can get notified about:
- When an application is submitted
- When results come out
- When you get allotted / not allotted

### 5. Auto-apply (optional)

```bash
ipo auto config    # Set preferences (IPO/FPO/Right, sectors, max kitta)
ipo auto start     # Start the scheduler
ipo auto stop      # Stop it
ipo auto status    # View current config
```

Set your preferences once, and the tool will automatically apply when matching IPOs open.

## Is my data safe?

**Yes. Your credentials never leave your computer.**

- All sensitive data (passwords, PINs, CRN) is **encrypted with AES-256-GCM**
- The encryption key is derived from your master password using **PBKDF2** (100,000 iterations, SHA-512)
- Your master password itself is **never stored** — only a bcrypt hash for verification
- Config is saved at `~/.ipo/config.json` in your home directory with restricted file permissions (`600`)
- Nothing is sent anywhere except directly to MeroShare's own servers (`webbackend.cdsc.com.np`)
- The code is fully open source — you can verify everything yourself

## Troubleshooting

**"Application in process"** — You've already applied for this IPO with that account.

**"Login failed"** — Check your DP, username, and password. You can update them with `ipo init edit`.

**Results showing "NOT ALLOTTED" for everything** — Results may take ~24 hours to appear on MeroShare after the public site. Use `ipo result` to open the public site for early results.

**Min/Max kitta showing "undefined"** — Some IPOs don't specify min/max units in the API. Enter kitta manually (usually 10 for ordinary shares).

## License

MIT
