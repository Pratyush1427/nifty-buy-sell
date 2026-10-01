"""Download and cache daily OHLCV for the training universe."""
import warnings

import pandas as pd
import yfinance as yf

from .config import BENCHMARK, CACHE_DIR, DATA_DIR, HISTORY_START, UNIVERSE_FILES
from .db import connect

warnings.filterwarnings("ignore", message=".*OpenSSL.*")


def universe():
    """Nifty 50 + Sensex constituents (NSE tickers), deduplicated."""
    symbols = []
    for name in UNIVERSE_FILES:
        df = pd.read_csv(DATA_DIR / name)
        symbols += [s.strip().upper() for s in df["symbol"].dropna().astype(str) if s.strip()]
    return sorted(set(s for s in symbols if s.endswith(".NS")))


def held_equities():
    """NSE/BSE stocks in anyone's open picks or watchlist (scored nightly, not trained on)."""
    with connect() as con:
        rows = con.execute(
            "SELECT symbol FROM picks WHERE removed_at IS NULL UNION SELECT symbol FROM watchlist"
        ).fetchall()
    return sorted(r[0] for r in rows if r[0].endswith((".NS", ".BO")))


def download(symbols, start=HISTORY_START):
    """Returns {symbol: DataFrame[Open, High, Low, Close, Volume]} (split/dividend adjusted)."""
    raw = yf.download(
        symbols + [BENCHMARK], start=start, auto_adjust=True, progress=False,
        group_by="ticker", threads=True,
    )
    out = {}
    for s in symbols + [BENCHMARK]:
        if s not in raw.columns.get_level_values(0):
            continue
        df = raw[s].dropna(subset=["Close"])
        df = df[df["Close"] > 0]
        if len(df) > 0:
            df.index = pd.to_datetime(df.index).tz_localize(None)
            out[s] = df[["Open", "High", "Low", "Close", "Volume"]].astype(float)
    return out


def load_prices(symbols, refresh=True):
    """Download (or reuse today's cache) and return the price dict."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / "prices.pkl"
    if not refresh and cache.exists():
        prices = pd.read_pickle(cache)
        if all(s in prices for s in symbols):
            return prices
    prices = download(symbols)
    pd.to_pickle(prices, cache)
    return prices
