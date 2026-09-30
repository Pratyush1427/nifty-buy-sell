# Backtest microservice

This folder contains a simple backtester for the ATH + trend strategy.

Quick start

1. Create a virtualenv and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backtest/requirements.txt
```

2. Run the backtest:

```bash
python -m backtest.backtest --start 2018-01-01 --end 2026-09-01
```

Results
- Trades are written to `backtest/trades.csv`.
- The script prints a short summary: number of trades, win rate, total PnL.

Notes and caveats
- This is a minimal scaffold to validate the strategy. It is NOT production-grade.
- Backtest hygiene to add: slippage models, execution at next bar price, transaction costs per exchange, handling corporate actions, survivorship bias checks, and portfolio-level equity curve calculation.
