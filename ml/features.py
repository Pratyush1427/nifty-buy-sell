"""Feature engineering. Every feature on day t uses only data up to and including t."""
import numpy as np
import pandas as pd

from .config import BENCHMARK, HORIZON

# Human-readable names, used to explain individual predictions in the dashboard.
FEATURE_LABELS = {
    "ret_5": "1-week return",
    "ret_20": "1-month return",
    "ret_60": "3-month return",
    "ret_120": "6-month return",
    "ret_250": "1-year return",
    "vol_20": "1-month volatility",
    "vol_60": "3-month volatility",
    "rsi_14": "RSI (14)",
    "macd_hist": "MACD histogram",
    "macd_line": "MACD line",
    "dist_ema20": "distance from 20-day EMA",
    "dist_sma50": "distance from 50 DMA",
    "dist_sma200": "distance from 200 DMA",
    "sma50_200": "50 vs 200 DMA spread",
    "dist_high252": "distance from 52-week high",
    "dist_low252": "distance from 52-week low",
    "bb_pctb": "Bollinger %B",
    "bb_width": "Bollinger band width",
    "volume_ratio": "volume vs 3-month average",
    "rel_20": "1-month return vs Nifty",
    "rel_60": "3-month return vs Nifty",
    "rel_120": "6-month return vs Nifty",
    "beta_120": "6-month beta to Nifty",
    "mkt_ret_20": "Nifty 1-month return",
    "mkt_vol_20": "Nifty 1-month volatility",
    "mkt_dist_sma200": "Nifty vs its 200 DMA",
    "rank_ret_20": "1-month return rank in universe",
    "rank_ret_120": "6-month return rank in universe",
    "rank_vol_20": "volatility rank in universe",
    "rank_rel_60": "3-month relative strength rank",
}
FEATURES = list(FEATURE_LABELS)
RANKED = {"rank_ret_20": "ret_20", "rank_ret_120": "ret_120", "rank_vol_20": "vol_20", "rank_rel_60": "rel_60"}


def _rsi(close, n=14):
    d = close.diff()
    gain = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100)


def _log_ret(close, n):
    return np.log(close / close.shift(n))


def market_features(mkt):
    c = mkt["Close"]
    r = np.log(c).diff()
    return pd.DataFrame({
        "mkt_close": c,
        "mkt_ret": r,
        "mkt_ret_20": _log_ret(c, 20),
        "mkt_ret_60": _log_ret(c, 60),
        "mkt_ret_120": _log_ret(c, 120),
        "mkt_vol_20": r.rolling(20).std() * np.sqrt(252),
        "mkt_dist_sma200": c / c.rolling(200).mean() - 1,
    })


def stock_features(df, mkt):
    """Features and label for one stock, aligned to the stock's trading days."""
    c, v = df["Close"], df["Volume"]
    r = np.log(c).diff()
    m = mkt.reindex(df.index).ffill()

    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    sma20 = c.rolling(20).mean()
    sd20 = c.rolling(20).std(ddof=0)
    sma50 = c.rolling(50).mean()
    sma200 = c.rolling(200).mean()
    hi = c.rolling(252, min_periods=120).max()
    lo = c.rolling(252, min_periods=120).min()

    f = pd.DataFrame(index=df.index)
    for n in (5, 20, 60, 120, 250):
        f[f"ret_{n}"] = _log_ret(c, n)
    f["vol_20"] = r.rolling(20).std() * np.sqrt(252)
    f["vol_60"] = r.rolling(60).std() * np.sqrt(252)
    f["rsi_14"] = _rsi(c)
    f["macd_hist"] = (macd - macd.ewm(span=9, adjust=False).mean()) / c
    f["macd_line"] = macd / c
    f["dist_ema20"] = c / c.ewm(span=20, adjust=False).mean() - 1
    f["dist_sma50"] = c / sma50 - 1
    f["dist_sma200"] = c / sma200 - 1
    f["sma50_200"] = sma50 / sma200 - 1
    f["dist_high252"] = c / hi - 1
    f["dist_low252"] = c / lo - 1
    f["bb_pctb"] = (c - (sma20 - 2 * sd20)) / (4 * sd20).replace(0, np.nan)
    f["bb_width"] = 4 * sd20 / sma20
    vol60 = v.rolling(60).mean().replace(0, np.nan)
    f["volume_ratio"] = v.rolling(20).mean() / vol60
    for n in (20, 60, 120):
        f[f"rel_{n}"] = f[f"ret_{n}"] - m[f"mkt_ret_{n}"]
    cov = r.rolling(120).cov(m["mkt_ret"])
    f["beta_120"] = cov / m["mkt_ret"].rolling(120).var()
    for col in ("mkt_ret_20", "mkt_vol_20", "mkt_dist_sma200"):
        f[col] = m[col]

    # Label: excess log return vs Nifty over the next HORIZON sessions.
    fwd = np.log(c.shift(-HORIZON) / c) - np.log(m["mkt_close"].shift(-HORIZON) / m["mkt_close"])
    f["fwd_excess"] = fwd
    return f


def build_panel(prices, symbols):
    """Stack every stock into one (date, symbol) panel with cross-sectional ranks."""
    mkt = market_features(prices[BENCHMARK])
    frames = []
    for s in symbols:
        if s not in prices or len(prices[s]) < 260:
            continue
        f = stock_features(prices[s], mkt)
        f["symbol"] = s
        frames.append(f)
    panel = pd.concat(frames)
    panel.index.name = "date"
    panel = panel.reset_index()
    # Where the stock stands against the rest of the universe that day (0..1).
    for rank_col, src in RANKED.items():
        panel[rank_col] = panel.groupby("date")[src].rank(pct=True)
    panel = panel.replace([np.inf, -np.inf], np.nan)
    return panel
