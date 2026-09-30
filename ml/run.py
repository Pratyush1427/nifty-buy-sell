"""
Command-line entry point.

  python -m ml.run             refresh index lists, download data, evaluate, train, predict
  python -m ml.run --predict   refresh prices and re-score with the saved models
  python -m ml.run --nightly   what the scheduled job runs: predict, retraining weekly
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone

from .config import MODEL_PATH, REPORT_PATH, RETRAIN_AFTER_DAYS
from .constituents import refresh as refresh_lists
from .data import held_equities, load_prices, universe
from .features import build_panel
from .predict import predict
from .train import fit_final, walk_forward


def model_age_days():
    if not REPORT_PATH.exists() or not MODEL_PATH.exists():
        return None
    trained = datetime.fromisoformat(json.loads(REPORT_PATH.read_text())["trained_at"])
    return (datetime.now(timezone.utc) - trained).days


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--predict", action="store_true", help="only re-score with the saved models")
    ap.add_argument("--nightly", action="store_true", help=f"predict; retrain if models are over {RETRAIN_AFTER_DAYS} days old")
    ap.add_argument("--cached", action="store_true", help="reuse cached prices instead of downloading")
    args = ap.parse_args()

    t0 = time.time()
    print(f"[{datetime.now():%Y-%m-%d %H:%M}] ml.run {' '.join(sys.argv[1:]) or '(full)'}")
    age = model_age_days()
    retrain = not args.predict and not (args.nightly and age is not None and age < RETRAIN_AFTER_DAYS)
    if age is None:
        retrain = True

    if retrain:
        print("Index lists:")
        refresh_lists()
    syms = universe()
    extras = [s for s in held_equities() if s not in syms]
    print(f"Universe: {len(syms)} stocks (+{len(extras)} held outside it)")
    prices = load_prices(syms + extras, refresh=not args.cached)
    print(f"Prices: {len(prices)} series, latest {max(p.index.max() for p in prices.values()).date()}")

    if retrain:
        panel = build_panel(prices, syms)
        print(f"Panel: {len(panel):,} stock-days, {panel['symbol'].nunique()} stocks")
        print("Walk-forward evaluation (each year predicted by models trained only on earlier data):")
        report, _ = walk_forward(panel)
        print("Final training on all data:")
        _, report = fit_final(panel, report)
        summarise(report)
    else:
        print(f"Using saved models ({age} days old)")

    predict(prices, syms, extras)
    print(f"Done in {time.time() - t0:.0f}s")


def summarise(r):
    print()
    print(f"Out-of-sample {r['test_period']}, non-overlapping {r['horizon_sessions']}-session periods")
    print(f"  {'Model':<20} {'AUC':>6} {'Top-20% beat Nifty':>19} {'Top-bottom /20d':>16} {'t':>6}")
    for m in r["models"].values():
        print(f"  {m['label']:<20} {m['auc']:>6.3f} {m['top_hit_rate']:>18.1%} {m['spread_pct']:>+15.2f}% {m['spread_tstat']:>6}")
    b = r["momentum_baseline"]
    print(f"  {'6-month momentum':<20} {b['auc']:>6.3f} {b['top_hit_rate']:>18.1%} {b['spread_pct']:>+15.2f}% {b['spread_tstat']:>6}")
    print()
    print(f"  {'Decision model':<20} {'BUY beat Nifty':>15} {'SELL beat Nifty':>16} {'BUY-SELL /20d':>14} {'t':>6}   (all stocks {r['leaderboard'][0]['base_hit_rate']:.1%})")
    fmt = lambda v, f: "—" if v is None else format(v, f)
    for row in sorted(r["leaderboard"], key=lambda x: -(x["edge_pct"] or -99)):
        print(f"  {row['label']:<20} {fmt(row['buy_hit_rate'], '>14.1%')} {fmt(row['sell_hit_rate'], '>15.1%')} "
              f"{fmt(row['edge_pct'], '>+13.2f')}% {fmt(row['edge_tstat'], '>6')}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
