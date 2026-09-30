"""Score the latest trading day with every model and write the results to SQLite."""
import json
import sqlite3

import joblib
import numpy as np
import pandas as pd

from .config import BENCHMARK, DB_PATH, MODEL_PATH, REPORT_PATH, SNAPSHOT_PATH
from .features import FEATURE_LABELS, RANKED, build_panel, market_features, stock_features
from .models import ENSEMBLE

MAX_AGE_DAYS = 7  # skip symbols whose last price is older than this (suspended, delisted)
DRIVER_CANDIDATES = 10
DRIVERS_PER_STOCK = 3


def _latest_rows(panel, prices):
    last_day = prices[BENCHMARK].index.max()
    latest = panel.sort_values("date").groupby("symbol").tail(1)
    return latest[latest["date"] >= last_day - pd.Timedelta(days=MAX_AGE_DAYS)].reset_index(drop=True)


def _extras_rows(extras, prices, universe_latest):
    """Held stocks outside the universe: features as usual, ranks against the universe."""
    mkt = market_features(prices[BENCHMARK])
    rows = []
    for s in extras:
        if s not in prices or len(prices[s]) < 260:
            continue
        f = stock_features(prices[s], mkt).iloc[[-1]].copy()
        f["symbol"] = s
        f.index.name = "date"
        rows.append(f.reset_index())
    if not rows:
        return pd.DataFrame()
    df = pd.concat(rows, ignore_index=True)
    for rank_col, src in RANKED.items():
        ref = universe_latest[src].dropna().values
        df[rank_col] = df[src].apply(lambda v: np.nan if pd.isna(v) or len(ref) == 0 else (ref <= v).mean())
    return df


def _drivers(predict_fn, rows, features, candidates, medians):
    """
    Per-stock explanation: reset each important feature to the universe median
    that day and see how much the probability moves. Positive = pushing it up.
    """
    base = predict_fn(rows[features])
    effects = {}
    for f in candidates:
        probe = rows[features].copy()
        probe[f] = medians[f]
        effects[f] = base - predict_fn(probe)
    out = []
    for i in range(len(rows)):
        ranked = sorted(candidates, key=lambda f: -abs(effects[f][i]))[:DRIVERS_PER_STOCK]
        out.append([
            {"feature": f, "label": FEATURE_LABELS[f], "effect": round(float(effects[f][i]), 4)}
            for f in ranked if abs(effects[f][i]) >= 0.002
        ])
    return base, out


def predict(prices, universe, extras, log=print):
    bundle = joblib.load(MODEL_PATH)
    models, features, version = bundle["models"], bundle["features"], bundle["version"]
    report = json.loads(REPORT_PATH.read_text())

    latest = _latest_rows(build_panel(prices, universe), prices)
    extra_rows = _extras_rows([s for s in extras if s not in set(universe)], prices, latest)
    medians = latest[features].median()  # "typical stock today", the comparison point for drivers
    n = len(latest)

    predictors = {k: (lambda X, m=m: m.predict_proba(X)[:, 1]) for k, m in models.items()}
    base_models = list(predictors.values())
    predictors[ENSEMBLE] = lambda X: np.mean([p(X) for p in base_models], axis=0)

    records = []
    universe_probs = {}
    for key, fn in predictors.items():
        candidates = [x["feature"] for x in report["models"][key].get("importance", [])][:DRIVER_CANDIDATES]
        probs, drivers = _drivers(fn, latest, features, candidates, medians)
        universe_probs[key] = probs
        ranks = (pd.Series(probs).rank(method="min") - 1) / max(n - 1, 1)
        for i, row in latest.iterrows():
            records.append((row.symbol, key, row.date, probs[i], float(ranks[i]), drivers[i], 1))
        if len(extra_rows):
            eprobs, edrivers = _drivers(fn, extra_rows, features, candidates, medians)
            for i, row in extra_rows.iterrows():
                records.append((row.symbol, key, row.date, eprobs[i], float((probs < eprobs[i]).mean()), edrivers[i], 0))

    pd.to_pickle({"version": version, "latest": latest, "medians": medians, "probs": universe_probs}, SNAPSHOT_PATH)
    write_scores(records, version, report)
    log(f"Wrote {len(records)} scores ({len(predictors)} models × {n + len(extra_rows)} stocks) for {latest['date'].max().date()}")


def write_scores(records, version, report=None, replace=True):
    """replace=True rewrites everything (nightly); False upserts a few on-demand scores."""
    with sqlite3.connect(DB_PATH) as con:
        con.executescript("""
            DROP TABLE IF EXISTS ml_predictions;
            CREATE TABLE IF NOT EXISTS ml_scores (
              symbol TEXT NOT NULL, model TEXT NOT NULL, as_of TEXT NOT NULL, prob REAL NOT NULL,
              pct_rank REAL NOT NULL, drivers TEXT, in_universe INTEGER NOT NULL DEFAULT 1,
              PRIMARY KEY (symbol, model)
            );
            CREATE TABLE IF NOT EXISTS ml_model (
              id INTEGER PRIMARY KEY CHECK (id = 1), version TEXT NOT NULL, report TEXT NOT NULL, predicted_at TEXT NOT NULL
            );
        """)
        if replace:
            con.execute("DELETE FROM ml_scores")
        con.executemany(
            "INSERT OR REPLACE INTO ml_scores (symbol, model, as_of, prob, pct_rank, drivers, in_universe) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(s, m, pd.Timestamp(d).date().isoformat(), float(p), r, json.dumps(dr), u) for s, m, d, p, r, dr, u in records],
        )
        if report is None:
            return
        con.execute(
            "INSERT INTO ml_model (id, version, report, predicted_at) VALUES (1, ?, ?, datetime('now')) "
            "ON CONFLICT(id) DO UPDATE SET version = excluded.version, report = excluded.report, predicted_at = excluded.predicted_at",
            (version, json.dumps(report)),
        )
