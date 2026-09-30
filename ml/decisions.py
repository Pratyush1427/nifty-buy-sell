"""
Python mirror of the dashboard's decision models (lib/strategies.js), so every
one of them can be scored on the same out-of-sample test. Each returns a
Series of +1 (BUY), 0 (HOLD), -1 (SELL) over a feature panel.
"""
import numpy as np
import pandas as pd

from .config import BUY_PCT_RANK, SELL_PCT_RANK


def _vote(buy, sell):
    return pd.Series(np.select([buy, sell], [1, -1], 0), index=buy.index)


RULES = {
    "momentum": lambda f: _vote((f["dist_high252"] >= -0.02) & (f["dist_ema20"] > 0), f["dist_ema20"] < 0),
    "trend": lambda f: _vote((f["dist_sma50"] > 0) & (f["sma50_200"] > 0), (f["dist_sma50"] < 0) & (f["sma50_200"] < 0)),
    "macd": lambda f: _vote((f["macd_hist"] > 0) & (f["macd_line"] > 0), (f["macd_hist"] < 0) & (f["macd_line"] < 0)),
    "rsi": lambda f: _vote(f["rsi_14"] < 30, f["rsi_14"] > 70),
    "bollinger": lambda f: _vote(f["bb_pctb"] < 0, f["bb_pctb"] > 1),
}


def ml_vote(pct_rank):
    return _vote(pct_rank > BUY_PCT_RANK, pct_rank <= SELL_PCT_RANK)


def overall_vote(votes):
    """Five rules + the ML ensemble, one vote each. BUY/SELL needs a net margin of 2."""
    net = sum(votes)
    return _vote(net >= 2, net <= -2)
