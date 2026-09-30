"""Shared settings for the ML pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "ml"
DB_PATH = DATA_DIR / "portfolio.db"
MODEL_PATH = CACHE_DIR / "models.joblib"
REPORT_PATH = CACHE_DIR / "report.json"
LOG_PATH = CACHE_DIR / "nightly.log"
# Latest day's universe features and scores, so single stocks can be scored
# on demand (ml/score.py) without rebuilding the whole panel.
SNAPSHOT_PATH = CACHE_DIR / "latest.pkl"

BENCHMARK = "^NSEI"
# Training universe. The Nifty 200 contains the Nifty 50 and most of the Sensex.
UNIVERSE_FILES = ["nifty200.csv", "nifty50.csv", "sensex.csv"]
HISTORY_START = "2010-01-01"

# NSE publishes current index constituents here; refreshed on every full run.
NSE_LISTS = {
    "nifty50.csv": "https://archives.nseindia.com/content/indices/ind_nifty50list.csv",
    "nifty200.csv": "https://archives.nseindia.com/content/indices/ind_nifty200list.csv",
}

# What the models predict: will the stock beat the Nifty over the next
# HORIZON sessions? Relative (not absolute) return strips out market moves,
# which no stock-level feature can forecast.
HORIZON = 20

# Walk-forward evaluation: for each test year, train only on data that ended
# EMBARGO_DAYS before the year starts, so no label overlaps the test period.
FIRST_TEST_YEAR = 2016
EMBARGO_DAYS = 40

# ML signal mapping: BUY the top 20% of the universe by probability, SELL the bottom 20%.
BUY_PCT_RANK = 0.8
SELL_PCT_RANK = 0.2

# The nightly job re-scores every weekday and retrains when the model is older than this.
RETRAIN_AFTER_DAYS = 7
