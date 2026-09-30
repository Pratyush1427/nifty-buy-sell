# Nifty Buy/Sell

A light-themed dashboard for Indian investors: track stocks, mutual funds, gold and silver in one
portfolio, see live P/L, and get BUY / HOLD / SELL signals for stocks from ten decision models
(five technical rules, four ML models and an overall vote), each with an honest track record.

## Pages

| Page | Question it answers |
|---|---|
| **Portfolio** (`/`) | How am I doing? Value, P/L, allocation by asset class, what needs attention, every holding |
| **Stocks** (`/stocks`) | What's worth a look? Index lists (Nifty 50/200, Sensex, gold, silver, watchlist) with signals |
| **Stock** (`/stocks/SYMBOL`) | Should I act? Overall verdict, chart with the chosen model's view, every model's call, key numbers |
| **Mutual funds** (`/funds`) | Search every AMFI scheme, your funds, fund watchlist |
| **Fund** (`/funds/CODE`) | Is it any good? Growth vs the Nifty 50, returns 1M–5Y, worst fall, volatility |
| **Models** (`/models`) | How are signals decided? Pick the model used everywhere; leaderboard and ML reports |

Search stocks and funds from anywhere with the box in the header (press `/`). **+ Add investment**
adds a stock, a mutual fund (by name; units and average NAV) or a CSV. Mutual funds get no
BUY/SELL signals by design; they are judged on long-term returns against the index.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

The app works without Python; the ML models are optional:

```bash
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt
npm run ml             # train and score (a few minutes); see "ML pipeline" below
```

Everything you enter stays on your machine in `data/portfolio.db` (SQLite, git-ignored).

## Decision models

Choose the model on the **Models** page (or with the *Signals by* picker on Portfolio and
Stocks); it drives every signal, the list columns and sorting, and the chart overlays. Each
stock's page shows what every model says about it, and the Models page shows each model's
out-of-sample track record.

| Model | Group | BUY | SELL |
|---|---|---|---|
| **Overall** (default) | overall | net ≥ 2 BUY votes from the 5 rules + ML ensemble | net ≥ 2 SELL votes |
| **52W breakout** | rule | within 2% of the 52-week closing high and above the 20-day EMA | below the 20-day EMA |
| **50/200 DMA** | rule | price > 50 DMA > 200 DMA | price < 50 DMA < 200 DMA |
| **MACD** (12, 26, 9) | rule | MACD above signal line and above zero | below both |
| **RSI** (14) | rule | RSI < 30 (oversold) | RSI > 70 (overbought) |
| **Bollinger** (20, 2σ) | rule | close below the lower band | close above the upper band |
| **ML ensemble** | ML | top 20% by average probability of the three models | bottom 20% |
| **Gradient boosting** | ML | top 20% by P(beat Nifty over 20 sessions) | bottom 20% |
| **Logistic regression** | ML | ″ | ″ |
| **Random forest** | ML | ″ | ″ |

Anything else is HOLD; not enough history gives *No data*. Rules live in `lib/strategies.js`
(indicators in `lib/indicators.js`, cross-checked against pandas) and are mirrored in
`ml/decisions.py` so that every model, rule or ML, is scored on the same test.

## ML pipeline

`ml/` trains three scikit-learn classifiers on the **Nifty 200** (current constituents,
refreshed from NSE on each full run) to estimate the probability that a stock beats the
Nifty 50 over the next 20 sessions, from 30 price/volume features (returns, volatility, RSI,
MACD, moving-average gaps, distance from 52-week high/low, relative strength, beta, market
regime, cross-sectional ranks).

```bash
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt
npm run ml             # refresh index lists, download 16y of prices, evaluate, train, score
npm run ml:predict     # re-score with the saved models (~10s)
npm run ml:schedule    # install the nightly job (weekdays 18:30; retrains weekly)
npm run ml:unschedule  # remove it; `scripts/schedule-ml.sh status` shows the last run
```

- **Walk-forward evaluation:** each year from 2016 is predicted by models trained only on
  earlier data, with a 40-day gap so no training label overlaps the test year. Outcomes are
  measured on non-overlapping 20-session periods. The leaderboard (select *Overall*) compares
  every decision model: how often its BUYs and SELLs beat the Nifty, and the BUY-minus-SELL
  return with a t-statistic. The full report is `data/ml/report.json`.
- **Explanations:** each score lists the features pushing it up or down, measured by resetting
  each feature to that day's universe median.
- **Honest expectations:** edges are small (a few percentage points of hit rate) and mostly not
  statistically significant. Treat the models as one input, not a forecast.
- **Known bias:** training on today's index members (survivorship bias) flatters history.
- Held NSE/BSE stocks outside the Nifty 200 are scored too, flagged as outside the training set.

## Tabs

Configured in `lib/universes.js`. Each tab has a benchmark (shown in the top strip) and a
list of instruments, either a CSV in `data/` or a fixed list:

| Tab | Benchmark | Instruments |
|---|---|---|
| Nifty 50 | `^NSEI` | `data/nifty50.csv` (refreshed from NSE by `npm run ml`) |
| Nifty 200 | `^CNX200` | `data/nifty200.csv` (refreshed from NSE by `npm run ml`) |
| Sensex | `^BSESN` | `data/sensex.csv` (NSE tickers of the Sensex 30) |
| Gold | `GC=F` (COMEX, US$) | NSE gold ETFs + COMEX gold |
| Silver | `SI=F` (COMEX, US$) | NSE silver ETFs + COMEX silver |
| Watchlist | — | any NSE/BSE stocks you add (stored in SQLite) |
| My holdings | — | everything you hold |

**Stocks outside every list** work too: *Look up any stock* in the header opens the chart and
every model's verdict for any NSE/BSE ticker, with buttons to add it to the watchlist or your
holdings. The ML models only score the Nifty 200 nightly, so for anything else press
**Score with ML models** (or add it to the watchlist/holdings, which scores it automatically):
`python -m ml.score SYMBOL` runs in ~3 s against the latest universe snapshot, and the stock is
included in every nightly run from then on. Such scores are flagged as outside the training
universe (the models learned from large caps), and stocks with under a year of history are
skipped.

Adding a tab (Bank Nifty, crude, …) is one entry in that file. Update the CSVs when an index
is rebalanced. US$ instruments are converted to ₹ for portfolio totals using `USDINR=X`.

## How it fits together

- `lib/market.js` — Yahoo Finance feed. One batched quote call for all symbols (60s cache),
  daily history per symbol (30 min cache, 8 at a time), in-flight de-duplication, 12s timeouts.
  The last good response is saved in SQLite (`market_cache`), so an outage or restart shows
  real prices marked **stale** — never invented numbers. After a network failure the feed
  pauses (15s, doubling to 5 min) instead of hammering Yahoo, and symbols Yahoo can't find
  aren't re-requested for 5 minutes.
- `lib/holdings.js` — validation, CSV parsing, SQLite CRUD. Lots are stored individually and
  combined per symbol (weighted average cost) in `lib/analytics.js`.
- `lib/funds.js` — mutual funds from [mfapi.in](https://www.mfapi.in) (AMFI NAVs, full history), cached
  for 6 hours in memory and SQLite. Funds are stored as holdings with symbol `MF:<AMFI scheme code>`.
  Equity funds are compared with `NIFTYBEES.NS` (dividend-adjusted), a proxy for the Nifty 50 TRI.
- `data/nifty50.csv` — the index universe (Yahoo tickers, e.g. `M&M.NS`, `BAJAJ-AUTO.NS`).
  Update it when the index is rebalanced.

## API

| Route | Purpose |
|---|---|
| `GET /api/market?universe=nifty50&symbols=A.NS,B.NS` | benchmarks, FX, and signals for a tab plus extra symbols |
| `GET /api/search?q=tata` | symbol autocomplete (NSE first) |
| `GET /api/instrument?symbol=X` | price and every model's verdict for any one stock |
| `GET /api/funds/search?q=` | mutual fund search (relevance, then Direct-Growth first) |
| `GET /api/funds/CODE` | fund detail: NAV history, returns vs benchmark, risk |
| `GET /api/funds/quotes?symbols=MF:1,MF:2` | latest NAVs (portfolio valuation) |
| `GET /api/models` | ML evaluation report and leaderboard |
| `GET/POST/DELETE /api/watchlist` | list / add `{symbol}` / remove `?symbol=` |
| `POST /api/ml-score` | `{symbol}`: run the ML models on a stock outside the Nifty 200 |
| `GET /api/chart?symbol=INFY` | ~1y of daily closes with the trend line and 52W high |
| `GET /api/portfolio` | list lots (`?format=csv` to download a backup) |
| `POST /api/portfolio` | `{symbol, shares, avg_price}` — add one lot (symbol is checked against Yahoo first) |
| `POST /api/portfolio` | `{csv}` or `{holdings: [...]}` — bulk import, all-or-nothing |
| `PUT /api/portfolio` | `{id, ...fields}` — edit a lot |
| `DELETE /api/portfolio?id=…` / `?symbol=…` | remove a lot / all lots of a symbol |

Symbols are normalised: `infy` → `INFY.NS`. Use `.BO` for BSE listings; indices (`^NSEI`),
futures (`GC=F`) and FX (`USDINR=X`) are passed through.

CSV import accepts a header with `symbol`, `shares`/`qty`/`quantity` and
`avg_price`/`average price` in any order (extra broker-export columns are ignored), or
headerless `symbol,shares,avg_price` rows. Mutual funds use `MF:<AMFI scheme code>` as the symbol.

## Backtest

See `backtest/README.md`.
