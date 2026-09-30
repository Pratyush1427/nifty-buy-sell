"""Walk-forward evaluation of every decision model, and final training of the ML models."""
import json
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.metrics import roc_auc_score

from .config import (
    BUY_PCT_RANK, EMBARGO_DAYS, FIRST_TEST_YEAR, HORIZON, MODEL_PATH, REPORT_PATH, SELL_PCT_RANK,
)
from .decisions import RULES, ml_vote, overall_vote
from .features import FEATURE_LABELS, FEATURES
from .models import ENSEMBLE, ENSEMBLE_DESCRIPTION, ENSEMBLE_LABEL, MODELS

RULE_LABELS = {"momentum": "52W breakout", "trend": "50/200 DMA", "macd": "MACD", "rsi": "RSI", "bollinger": "Bollinger"}
ML_KEYS = list(MODELS) + [ENSEMBLE]


def labelled(panel):
    df = panel.dropna(subset=["fwd_excess", "ret_120", "vol_60"]).copy()
    df["y"] = (df["fwd_excess"] > 0).astype(int)
    return df


def pct_rank_by_date(df, col):
    """Share of the other stocks that day this one out-ranks: top = 1, bottom = 0."""
    g = df.groupby("date")[col]
    return (g.rank(method="min") - 1) / (g.transform("count") - 1).clip(lower=1)


def sampled(df):
    """Dates spaced HORIZON sessions apart, so each 20-day outcome is independent of the next."""
    dates = np.sort(df["date"].unique())[::HORIZON]
    return df[df["date"].isin(dates)]


def _quintile_stats(df, score_col):
    rows = []
    for _, day in sampled(df).groupby("date"):
        if len(day) < 20:
            continue
        pr = day[score_col].rank(pct=True)
        top, bot = day[pr > BUY_PCT_RANK], day[pr <= SELL_PCT_RANK]
        rows.append((top["fwd_excess"].mean(), bot["fwd_excess"].mean(),
                     (top["fwd_excess"] > 0).mean(), (day["fwd_excess"] > 0).mean()))
    p = pd.DataFrame(rows, columns=["top", "bottom", "top_hit", "base_hit"])
    spread = p["top"] - p["bottom"]
    return {
        "periods": int(len(p)),
        "spread_pct": round(float(spread.mean() * 100), 3),
        "spread_tstat": round(float(spread.mean() / (spread.std(ddof=1) / np.sqrt(len(p)))), 2) if len(p) > 2 else None,
        "spread_positive_share": round(float((spread > 0).mean()), 3),
        "top_hit_rate": round(float(p["top_hit"].mean()), 4),
        "base_hit_rate": round(float(p["base_hit"].mean()), 4),
    }


def _decision_stats(df, vote_col):
    """How a BUY/HOLD/SELL model's calls played out: the leaderboard row."""
    s = sampled(df)
    buy, sell = s[s[vote_col] == 1], s[s[vote_col] == -1]
    spreads = []
    for _, day in s.groupby("date"):
        b, sl = day[day[vote_col] == 1]["fwd_excess"], day[day[vote_col] == -1]["fwd_excess"]
        if len(b) and len(sl):
            spreads.append(b.mean() - sl.mean())
    spreads = np.array(spreads)
    pct = lambda x: round(float(np.expm1(x.mean()) * 100), 3) if len(x) else None
    return {
        "buy_signals": int(len(buy)),
        "buy_hit_rate": round(float((buy["fwd_excess"] > 0).mean()), 4) if len(buy) else None,
        "buy_excess_pct": pct(buy["fwd_excess"]),
        "sell_signals": int(len(sell)),
        "sell_hit_rate": round(float((sell["fwd_excess"] > 0).mean()), 4) if len(sell) else None,
        "sell_excess_pct": pct(sell["fwd_excess"]),
        "edge_pct": round(float(spreads.mean() * 100), 3) if len(spreads) else None,
        "edge_tstat": round(float(spreads.mean() / (spreads.std(ddof=1) / np.sqrt(len(spreads)))), 2) if len(spreads) > 2 else None,
        "edge_periods": int(len(spreads)),
        "base_hit_rate": round(float((s["fwd_excess"] > 0).mean()), 4),
    }


def walk_forward(panel, log=print):
    df = labelled(panel)
    last_year = df["date"].max().year
    folds = []
    for year in range(FIRST_TEST_YEAR, last_year + 1):
        start = pd.Timestamp(f"{year}-01-01")
        train = df[df["date"] < start - pd.Timedelta(days=EMBARGO_DAYS)]
        test = df[(df["date"] >= start) & (df["date"] < pd.Timestamp(f"{year + 1}-01-01"))].copy()
        if len(test) == 0 or len(train) < 20000:
            continue
        t0 = time.time()
        for key, (_, _, factory) in MODELS.items():
            test[f"p_{key}"] = factory().fit(train[FEATURES], train["y"]).predict_proba(test[FEATURES])[:, 1]
        test[f"p_{ENSEMBLE}"] = test[[f"p_{k}" for k in MODELS]].mean(axis=1)
        folds.append(test)
        aucs = "  ".join(f"{k} {roc_auc_score(test['y'], test[f'p_{k}']):.3f}" for k in ML_KEYS)
        log(f"  {year}: train {len(train):>7,}  test {len(test):>6,}  AUC {aucs}  ({time.time() - t0:.0f}s)")
    oos = pd.concat(folds)

    # Every decision model votes on the same out-of-sample rows.
    for key in ML_KEYS:
        oos[f"r_{key}"] = pct_rank_by_date(oos, f"p_{key}")
        oos[f"v_{key}"] = ml_vote(oos[f"r_{key}"])
    for key, rule in RULES.items():
        oos[f"v_{key}"] = rule(oos)
    oos["v_overall"] = overall_vote([oos[f"v_{k}"] for k in RULES] + [oos[f"v_{ENSEMBLE}"]])

    models = {}
    for key in ML_KEYS:
        label, desc = (MODELS[key][0], MODELS[key][1]) if key in MODELS else (ENSEMBLE_LABEL, ENSEMBLE_DESCRIPTION)
        by_year = []
        for year, part in oos.groupby(oos["date"].dt.year):
            q = _quintile_stats(part, f"p_{key}")
            by_year.append({"year": int(year), "auc": round(float(roc_auc_score(part["y"], part[f"p_{key}"])), 4),
                            "spread_pct": q["spread_pct"], "top_hit_rate": q["top_hit_rate"], "base_hit_rate": q["base_hit_rate"]})
        models[key] = {
            "label": label,
            "description": desc,
            "auc": round(float(roc_auc_score(oos["y"], oos[f"p_{key}"])), 4),
            **_quintile_stats(oos, f"p_{key}"),
            "by_year": by_year,
        }

    leaderboard = [{"key": "overall", "label": "Overall", "kind": "overall", **_decision_stats(oos, "v_overall")}]
    leaderboard += [{"key": k, "label": RULE_LABELS[k], "kind": "rule", **_decision_stats(oos, f"v_{k}")} for k in RULES]
    leaderboard += [{"key": k, "label": models[k]["label"], "kind": "ml", **_decision_stats(oos, f"v_{k}")} for k in ML_KEYS]

    momentum = oos.assign(m=oos["rank_ret_120"].fillna(0.5))
    report = {
        "horizon_sessions": HORIZON,
        "target": f"Beats the Nifty 50 over the next {HORIZON} sessions",
        "test_period": f"{oos['date'].min().date()} to {oos['date'].max().date()}",
        "rows": int(len(oos)),
        "models": models,
        "momentum_baseline": {"auc": round(float(roc_auc_score(oos["y"], momentum["m"])), 4), **_quintile_stats(momentum, "m")},
        "leaderboard": leaderboard,
    }
    return report, oos


def fit_final(panel, report, log=print):
    df = labelled(panel)
    recent = df[df["date"] >= df["date"].max() - pd.Timedelta(days=365)]
    sample = recent.sample(min(10000, len(recent)), random_state=7)

    fitted = {}
    for key, (label, _, factory) in MODELS.items():
        t0 = time.time()
        fitted[key] = factory().fit(df[FEATURES], df["y"])
        # Global importance: how much AUC drops when each feature is shuffled.
        imp = permutation_importance(fitted[key], sample[FEATURES], sample["y"], scoring="roc_auc", n_repeats=3, random_state=7)
        report["models"][key]["importance"] = sorted(
            ({"feature": f, "label": FEATURE_LABELS[f], "importance": round(float(v), 5)} for f, v in zip(FEATURES, imp.importances_mean)),
            key=lambda x: -x["importance"],
        )[:10]
        log(f"  trained {label} ({time.time() - t0:.0f}s)")
    # The ensemble's importance: average of the three, re-ranked.
    agg = {}
    for key in MODELS:
        for item in report["models"][key]["importance"]:
            agg[item["feature"]] = agg.get(item["feature"], 0) + item["importance"] / len(MODELS)
    report["models"][ENSEMBLE]["importance"] = [
        {"feature": f, "label": FEATURE_LABELS[f], "importance": round(v, 5)} for f, v in sorted(agg.items(), key=lambda x: -x[1])[:10]
    ]

    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    report.update({
        "version": version,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "train_rows": int(len(df)),
        "train_period": f"{df['date'].min().date()} to {df['date'].max().date()}",
        "symbols": int(df["symbol"].nunique()),
        "features": len(FEATURES),
        "signal_rule": f"ML models: BUY = top {round((1 - BUY_PCT_RANK) * 100)}% of the universe by probability, "
                       f"SELL = bottom {round(SELL_PCT_RANK * 100)}%.",
    })
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"models": fitted, "features": FEATURES, "version": version}, MODEL_PATH, compress=3)
    REPORT_PATH.write_text(json.dumps(report, indent=2, default=str))
    log(f"Saved models {version} ({len(df):,} rows, {report['symbols']} stocks)")
    return fitted, report
