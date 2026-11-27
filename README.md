<!-- Images: https://raw.githubusercontent.com/nischaljs/nepse-ipo/HEAD/docs/media/<file> (absolute, so they also show on npm) -->

# meroshare-cli

Apply for an IPO on MeroShare for every account in your family, with one command: `ipo`. Everything stays on your own computer. Your passwords go to MeroShare and nowhere else.

![The ipo command in a terminal: ipo doctor finds one account blocked by an expired password and one whose DEMAT expires in 9 days, ipo fix changes the expired password after a typed yes, and ipo apply applies from all three accounts.](https://raw.githubusercontent.com/nischaljs/nepse-ipo/HEAD/docs/media/demo.gif)

[![npm version](https://img.shields.io/npm/v/meroshare-cli)](https://www.npmjs.com/package/meroshare-cli)
[![license: MIT](https://img.shields.io/npm/l/meroshare-cli)](#license)
[![node](https://img.shields.io/node/v/meroshare-cli)](https://nodejs.org/)

## Your data stays with you

This is the first thing to know, so it comes first.

- **It runs only on your computer.** There is no ipo website, no ipo server and no ipo account. Nobody, including the person who wrote it, can see your accounts.
- **Your passwords, CRN and PIN are locked on your computer.** They are encrypted with a master password that only you know. It is never stored or sent anywhere.
- **It talks only to MeroShare.** The only addresses in the code are CDSC's own: `meroshare.cdsc.com.np`, `webbackend.cdsc.com.np` (the MeroShare website uses it too) and `iporesult.cdsc.com.np` (results).
- **Email is yours, and optional.** If you turn on alerts, they go from your own email account to you. Nothing is copied to anyone else.
- **Payment happens in your browser.** For a renewal, ipo opens MeroShare's payment page and you pay there yourself. ipo never sees your eSewa, Khalti or bank details.
- **No tracking, no analytics, no data collection.** Not even a count of how many people use it.
- **You can check all of this.** The code is open. Run `grep -rn "https://" src` in this repository to see every address it can reach.

How the file is locked, and what happens if you forget the master password: [Your data and safety](#your-data-and-safety).

## Why

Many of us look after MeroShare for the whole family: our own account, a parent's, a brother's. Each IPO means logging in to each one, one by one. Then one day an account does not work, because its password expired or its DEMAT needed renewal, and you find out too late.

- **One command for every account.** `ipo apply` applies from all of them.
- **Never miss an IPO.** Turn on automatic mode and it checks every day.
- **No surprise blocks.** It tells you before a password, a MeroShare account or a DEMAT expires, and changes passwords for you if you allow it.

## Install

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install -g meroshare-cli
```

Then three commands:

```bash
ipo init     # set a master password and add your accounts
ipo doctor   # check every account
ipo apply    # apply for the open IPOs from every account
```

## What it does for you

| | Automatic | Needs you |
| --- | --- | --- |
| Apply for an IPO | Yes, from every healthy account. In automatic mode it only applies to the kinds you chose. | You say yes once (not in automatic mode). |
| Check results | `ipo result` checks every account in one table. | Nothing. |
| MeroShare password expires | Yes, if you turn on automatic password change. It sets a new strong password and emails you. | If it is off, run `ipo fix <account>` and type yes. |
| MeroShare or DEMAT renewal | It warns you 30, 14, 7, 3 and 1 days before, and `ipo fix` opens the payment page. | You pay in eSewa, Khalti or ConnectIPS. |
| Transaction PIN | `ipo doctor` tells you when it is missing. | You set it on the MeroShare website. |

## Commands

| Command | What it does |
| --- | --- |
| `ipo init` | Set up: master password and accounts. Also `ipo init add`, `list`, `edit`, `remove`. |
| `ipo apply` | Apply for open IPOs from every account. |
| `ipo result` | Check IPO results for every account. |
| `ipo doctor` | Check every account. Reads only, changes nothing. |
| `ipo fix <account>` | Fix one account: a new password, the renewal page, or what to do about the PIN. |
| `ipo accounts password <account>` | Show the password ipo stored for an account. |
| `ipo notify` | Set up email alerts (a Gmail app password or any SMTP server). |
| `ipo auto` | The daily job: `config`, `start`, `run`, `stop`, `status`. |

## Automatic mode

```bash
ipo auto config   # what to apply for (IPO, FPO, right shares), sectors, kitta, password change
ipo auto start    # keep running and do the daily job (add --now to also run it once now)
ipo auto run      # do the daily job once, now
ipo auto status   # show your settings
ipo auto stop     # stop it
```

Every day (10:00 by default) it does four things, in this order:

1. Checks the health of every account.
2. Changes a MeroShare password that expires within 7 days, or that MeroShare asks to change. Only if you turned this on.
3. Sends renewal warnings, 30, 14, 7, 3 and 1 days before, each once.
4. Applies for open IPOs that match your settings.

**Run it on a computer in Nepal.** MeroShare blocks traffic from outside Nepal, so a cloud server or GitHub Actions will not work. A home computer or a small box that stays on is enough.

## Your data and safety

- **What is stored:** your accounts (DP, username, BOID, bank), their passwords, CRN and PIN, your email settings and your choices. Nothing else.
- **Where:** one file, `~/.ipo/config.json`, on your own computer. The folder can be read only by you (`700`) and so can the file (`600`).
- **How:** every password, CRN and PIN is encrypted with AES-256-GCM. The key comes from your master password through PBKDF2 (100,000 rounds, SHA-512). The master password itself is never stored, only a salted hash to check it.
- **Where data goes:** only to MeroShare (CDSC) and, if you set it up, to your own email. There is no server of ours, and no tracking.
- **Writes are never retried.** An apply or a password change is sent once. If the network fails, ipo tells you and does not try again by itself, so nothing is applied twice.
- **It asks first.** Every apply, password change and payment waits for your yes.
- **Unofficial.** This tool is not made by or connected to CDSC or MeroShare. Use it at your own risk.

**Forgot the master password?** It cannot be recovered, because it is not stored anywhere. Run `ipo init` again: it replaces the old file, and you add your accounts again. If ipo had changed a MeroShare password for you, reset that password on the MeroShare website.

## नेपालीमा

`ipo` ले परिवारका सबै MeroShare खाताबाट एउटै command मा IPO भरिदिन्छ। पासवर्ड वा DEMAT को म्याद सकिन लाग्यो भने पहिल्यै भनिदिन्छ, त्यसैले खाता अचानक बन्द हुँदैन।

**सबै कुरा तपाईंकै कम्प्युटरमा रहन्छ।** तपाईंका पासवर्ड, CRN र PIN तपाईंकै कम्प्युटरमा ताल्चा लगाएर (encrypt गरेर) राखिन्छन्, र ताल्चाको चाबी तपाईंको master password मात्र हो। यी कुरा MeroShare बाहेक अरू कसैलाई पठाइँदैन। हाम्रो कुनै server छैन, कुनै tracking छैन, यो tool बनाउनेले पनि तपाईंको खाता देख्न सक्दैन।

यसरी सुरु गर्नुहोस् (पहिले [Node.js](https://nodejs.org/) राख्नुहोस्):

```bash
npm install -g meroshare-cli
ipo init     # master password राख्ने र खाताहरू थप्ने
ipo doctor   # सबै खाता ठीक छन् कि छैनन् हेर्ने
ipo apply    # खुला IPO सबै खाताबाट भर्ने
```

हरेक दिन आफैँ IPO भर्न `ipo auto start` चलाउनुहोस्। यो नेपालभित्रकै कम्प्युटरमा चलाउनुपर्छ, किनकि MeroShare ले विदेशबाट आउने request रोक्छ।

## For developers

![How ipo is built: the cli on top, the modules in the middle, and the platform sockets store, meroshare, notify, scheduler and terminal at the bottom. Imports only go down.](https://raw.githubusercontent.com/nischaljs/nepse-ipo/HEAD/docs/media/architecture.svg)

![One ipo apply, step by step: the command, then session, health, issues and apply, each calling MeroShare through the meroshare socket, then store and notify.](https://raw.githubusercontent.com/nischaljs/nepse-ipo/HEAD/docs/media/flow.gif)

- **Sockets** (`src/platform/*`) are the only code that touches the outside world: the config file, MeroShare, email, cron and the terminal.
- **Modules** (`src/modules/*`) hold the product logic. Each one plugs into the sockets and talks to another module only through its `public.ts`.
- **The cli** (`src/cli`) wires the commands together. `npm run lint:deps` fails any import that breaks these rules.

The full picture, with the rules and the data flow: [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
npm install
npm test          # the tests, on a fake MeroShare server (never the real one)
npm run check     # type check, dependency rules and tests
```

To contribute, open an issue or a pull request. Keep a change inside one module where you can, add a test next to it, and run `npm run check` before you push.

The pictures here can be made again: `scripts/demo/record.sh` records the terminal GIF on the fake server (needs [vhs](https://github.com/charmbracelet/vhs)), and `docs/media/src/render-flow.sh` renders the flow animation from `docs/media/src/flow.html`.

## License

MIT
