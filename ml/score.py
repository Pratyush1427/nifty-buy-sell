"""
Score individual stocks on demand, against the latest universe snapshot.

  python -m ml.score IRCTC.NS 543320.BO

Prints one JSON line: {"scored": [...], "skipped": [{"symbol", "reason"}]}.
Scores are upserted into ml_scores (marked outside the training universe).
"""
import json
import sys

import joblib
import numpy as np
import pandas as pd

from .config import BENCHMARK, MODEL_PATH, REPORT_PATH, SNAPSHOT_PATH
from .data import download
from .models import ENSEMBLE
from .predict import _drivers, _extras_rows, write_scores

DRIVER_CANDIDATES = 10
MIN_SESSIONS = 260  # a year of history for 52-week and 200-day features


def score(symbols):
    if not SNAPSHOT_PATH.exists() or not MODEL_PATH.exists():
        raise RuntimeError("No trained models yet: run `npm run ml` first.")
    snap = pd.read_pickle(SNAPSHOT_PATH)
    bundle = joblib.load(MODEL_PATH)
    if snap["version"] != bundle["version"]:
        raise RuntimeError("Model snapshot is out of date: run `npm run ml:predict`.")
    models, features = bundle["models"], bundle["features"]
    report = json.loads(REPORT_PATH.read_text())

    universe = set(snap["latest"]["symbol"])
    skipped = [{"symbol": s, "reason": "already scored nightly (Nifty 200 member)"} for s in symbols if s in universe]
    todo = [s for s in symbols if s not in universe]
    if not todo:
        return {"scored": [], "skipped": skipped}

    prices = download(todo)
    ready = []
    for s in todo:
        n = len(prices.get(s, []))
        if n == 0:
            skipped.append({"symbol": s, "reason": "no price history on Yahoo Finance"})
        elif n < MIN_SESSIONS:
            skipped.append({"symbol": s, "reason": f"only {n} sessions of history; the models need about a year"})
        else:
            ready.append(s)
    if not ready:
        return {"scored": [], "skipped": skipped}

    rows = _extras_rows(ready, prices, snap["latest"])
    predictors = {k: (lambda X, m=m: m.predict_proba(X)[:, 1]) for k, m in models.items()}
    base_models = list(predictors.values())
    predictors[ENSEMBLE] = lambda X: np.mean([p(X) for p in base_models], axis=0)

    records = []
    for key, fn in predictors.items():
        candidates = [x["feature"] for x in report["models"][key].get("importance", [])][:DRIVER_CANDIDATES]
        probs, drivers = _drivers(fn, rows, features, candidates, snap["medians"])
        ref = snap["probs"][key]
        for i, row in rows.iterrows():
            records.append((row.symbol, key, row.date, probs[i], float((ref < probs[i]).mean()), drivers[i], 0))
    write_scores(records, bundle["version"], replace=False)

    scored = [
        {"symbol": s, "ensemble_prob": round(float(r[3]), 4), "ensemble_pct_rank": round(r[4], 3)}
        for s in ready for r in records if r[0] == s and r[1] == ENSEMBLE
    ]
    return {"scored": scored, "skipped": skipped}


def main():
    symbols = [s.strip().upper() for s in sys.argv[1:] if s.strip()]
    try:
        result = score(symbols)
    except Exception as exc:  # reported to the caller as JSON, not a traceback
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
