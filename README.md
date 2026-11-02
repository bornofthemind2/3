# EdgeFinder

Sports-betting analytics in the style of an arbitrage / +EV tool. It scans odds across the sportsbooks
you use, finds **arbitrage**, **positive-EV bets**, **middles** and **low-hold markets**, and gives you
the exact stakes. Then **you place the bets yourself** in each book's app.

> **What it deliberately does not do:** EdgeFinder never logs in to a sportsbook, never reads your
> account, and never places a bet. Books that detect automated logins or bet placement limit or close
> accounts quickly, and most US books have no public betting API. Odds come from a read-only odds
> feed; balances are entered by you or imported from a statement you download yourself.

*(Previous contents of this README: "Vue-Cheat-Sheet — Cheat Sheet for Vue.js". The PDF is still in the repo.)*

## Quick start

```bash
node --version          # 20 or newer; there are no npm dependencies
npm start               # http://localhost:3000, using the built-in demo odds feed
npm test                # 29 tests
```

### Live odds (The Odds API)

1. Get a key at [the-odds-api.com](https://the-odds-api.com).
2. Provide it as `ODDS_API_KEY`. Either set an environment variable, or `cp .env.example .env` and fill it in
   (`.env` is git-ignored; a real environment variable wins over the file).
3. `npm start`. The status bar switches to **Live: The Odds API**, with credits left and cost per scan.

If you're behind an HTTP proxy (corporate network, or a cloud sandbox), Node's `fetch` ignores
`HTTPS_PROXY` by default. Start with `NODE_USE_ENV_PROXY=1 npm start` (Node 22.21+ / 24+).

**Credits.** Each scan costs `in-season sports × markets × ⌈bookmakers ÷ 10⌉` credits. Only your books plus
the sharp reference books are requested. The defaults (9 Virginia books + Pinnacle = 10 bookmakers, 3 markets) cost
**3 credits per in-season sport per scan**, so about 21 for 7 sports. The live feed rescans every **300 s** by default
(Settings → *Live odds scan*; `0` = only when you press *Scan now*). At 300 s that's about 6,000 credits/day,
so pick the interval to fit your plan. Settings shows the projected credits per day. To cut cost, limit sports
(`ODDS_SPORTS=…`), drop markets (`ODDS_MARKETS=h2h,spreads`), or tick fewer books. The scanner stops
before a scan would overrun your remaining credits.

**Stale prices.** Prices a book hasn't refreshed recently are the usual source of fake arbs. On the live feed,
pre-game prices older than 30 min and in-play prices older than 120 s are ignored (both adjustable in
Settings), and each arb leg shows how old its price is. The status bar also lists any of your books the feed
returned no odds for.

## Features

| Tab | What it does |
|---|---|
| **Arbitrage** | For every market, takes the best price per side **from your books only**. If the implied probabilities sum to under 100%, it's an arb, and the card shows each side's stake for your total. |
| **+EV** | Removes the vig from the sharp books (Pinnacle, Circa, Betfair: reference only, never suggested as bets) to get a fair probability. Lists every price at your books that beats it, with fractional-Kelly stake sizing. |
| **Middles** | Different lines on the same total/spread across books (e.g. Over 44.5 / Under 47.5). Hit probability uses whole-number scores (pushes included), centred on where the market expects the result. |
| **Low Holds** | Lowest-margin markets across your books, for converting bonus bets, clearing rollover and hedging. |
| **Odds Screen** | Live grid: your books plus sharp reference columns, best price highlighted, ▲▼ movement, hold per market, alternate lines. Click a league tag for the line-movement chart. |
| **Wallet** | Per-book balances, deposits/withdrawals, **CSV statement import** (de-duplicated), bet log with won/lost/push settlement, P/L and ROI. "Log bets" on any opportunity checks whether your balances cover every side. |
| **Calculators** | Arbitrage (2/3-way, stake rounding), +EV & Kelly, promo conversion (bonus bet, profit boost, no-sweat), middle, hedge, odds converter, and no-vig fair odds (4 methods). |
| **Settings** | **My books** (default: Virginia-licensed books), sharp reference books, thresholds, de-vig method, Kelly fraction, alerts. |

### Worked example: the arb math

Team A **+110** at Book 1 → 1/2.10 = **47.62%**
Team B **−105** at Book 2 → 1/1.952 = **51.22%**
Sum = **98.84%** < 100% → profit = 1/0.9884 − 1 ≈ **1.17%**

With $1,000 total: stake **$481.79** on A and **$518.21** on B. Either way pays back $1,011.75.
(This exact case is a test in `test/engine.test.js`.)

### Automation and alerts

The scanner re-polls every few seconds on the demo feed and on your chosen interval on the live feed
(see Credits above). New opportunities above your alert thresholds:

- appear as in-app toasts and browser notifications (Settings → *Enable browser notifications*);
- are POSTed to a **webhook**, if you set one: Discord and Slack incoming-webhook URLs work as-is.

### Books

The default "My books" list is the books licensed in Virginia that The Odds API covers: DraftKings, FanDuel,
BetMGM, Caesars, Fanatics, bet365, ESPN BET, BetRivers and Hard Rock Bet. Availability changes, so
untick any you don't use (or that have limited you) in Settings, or edit `src/providers/books.js`.

### CSV import format

Any header order; names are matched loosely. If the file is one book's statement with no book column,
choose the book in the form.

```csv
date,book,type,amount,note
2026-10-01,DraftKings,Deposit,500,
2026-10-05,DraftKings,Withdrawal,(250.00),
```

## Project layout

```
src/lib/odds.js          odds conversion, hold, de-vig (multiplicative / additive / power / Shin)
src/lib/calculators.js   arb stakes, EV, Kelly, hedge, middle, promo conversion
src/lib/engine.js        finds arbs, +EV, middles, low holds from normalized odds
src/providers/           books catalogue, demo simulator, The Odds API adapter
src/scanner.js           polling loop, opportunity ageing, alerts and webhooks
src/store.js             settings + wallet ledger (JSON file), CSV import
src/server.js            REST API + Server-Sent Events + static UI (no dependencies)
public/                  browser UI (vanilla JS; imports src/lib directly, so the calculators share one codebase)
test/                    node:test suites
```

## Caveats

- Lines move in seconds. Confirm both prices in the apps before staking; "Log bets" lets you
  enter the prices you actually got.
- Books can limit accounts that bet arbs or +EV, and may void bets on palpable errors.
- Fair values and middle probabilities are model estimates, not guarantees.
- Gamble responsibly. 1-800-GAMBLER.
