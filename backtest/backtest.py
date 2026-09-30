"""
Simple backtester for ATH + trend strategy across Nifty 50.

Usage:
  python backtest.py --start 2018-01-01 --end 2026-09-01

Outputs a CSV of trades at `backtest/trades.csv` and prints a short summary.
"""
import argparse
import pandas as pd
import numpy as np
import yfinance as yf
from tqdm import tqdm
from datetime import datetime
from pathlib import Path
from .nifty50 import get_nifty50_tickers


def ema(series, span):
    return series.ewm(span=span, adjust=False).mean()


def run_backtest(tickers, start, end, stop_pct=0.08, capital_per_trade=10000, fee_pct=0.0005):
    trades = []

    for tk in tqdm(tickers, desc='Tickers'):
        try:
            df = yf.download(tk, start=start, end=end, progress=False)
            if df.empty:
                continue
            df = df.dropna(subset=['Close', 'Open', 'High', 'Low', 'Volume']).copy()
            df['ema20'] = ema(df['Close'], 20)
            df['ema50'] = ema(df['Close'], 50)
            df['vol20'] = df['Volume'].rolling(20).mean()
            df['high_52w'] = df['Close'].rolling(252).max()
            df['trailing_high'] = df['High'].rolling(20).max()

            position = None

            for i in range(20, len(df) - 1):
                row = df.iloc[i]
                prev = df.iloc[i - 1]

                if position is None:
                    entry_signal = (
                        row['Close'] > row['ema20'] and
                        row['ema20'] > row['ema50'] and
                        row['Close'] > row['high_52w'] * 0.98 and
                        row['Volume'] > row['vol20'] * 1.10 and
                        row['Close'] > prev['Close']
                    )

                    if entry_signal and i + 1 < len(df):
                        entry_price = df.iloc[i + 1]['Open']
                        trailing_stop = entry_price * (1 - stop_pct)
                        position = {
                            'entry_price': entry_price,
                            'entry_date': df.iloc[i + 1].name,
                            'stop_price': trailing_stop,
                        }
                    continue

                # Exit logic: break below EMA20, break below stop, or trailing stop break
                if position is not None:
                    exit_row = df.iloc[i + 1] if i + 1 < len(df) else row
                    exit_price = exit_row['Open'] if i + 1 < len(df) else row['Close']
                    exit_date = exit_row.name if i + 1 < len(df) else row.name

                    stop_break = exit_price <= position['stop_price']
                    ema_break = row['Close'] <= row['ema20']
                    trail_break = row['Close'] <= (row['trailing_high'] * 0.96)

                    if stop_break or ema_break or trail_break:
                        shares = int(capital_per_trade / position['entry_price']) if position['entry_price'] > 0 else 0
                        if shares <= 0:
                            position = None
                            continue

                        proceeds = shares * exit_price
                        cost = shares * position['entry_price']
                        fees = (proceeds + cost) * fee_pct
                        pnl = proceeds - cost - fees
                        trades.append({
                            'symbol': tk,
                            'entry_date': position['entry_date'].strftime('%Y-%m-%d'),
                            'entry_price': position['entry_price'],
                            'exit_date': exit_date.strftime('%Y-%m-%d') if hasattr(exit_date, 'strftime') else str(exit_date),
                            'exit_price': exit_price,
                            'shares': shares,
                            'pnl': pnl,
                            'return_pct': pnl / (cost if cost > 0 else 1),
                        })
                        position = None

        except Exception:
            continue

    trades_df = pd.DataFrame(trades)
    return trades_df


def summarize(trades_df, capital_per_trade=10000):
    if trades_df.empty:
        print('No trades found.')
        return
    total_pnl = trades_df['pnl'].sum()
    num = len(trades_df)
    wins = (trades_df['pnl'] > 0).sum()
    win_rate = wins / num
    avg_return = trades_df['return_pct'].mean()

    # approximate annualized return: assume period from first entry to last exit
    first = pd.to_datetime(trades_df['entry_date']).min()
    last = pd.to_datetime(trades_df['exit_date']).max()
    days = max((last - first).days, 1)
    total_capital = capital_per_trade * num
    total_return = total_pnl / total_capital
    annualized = (1 + total_return) ** (365.0 / days) - 1

    print('Trades:', num)
    print('Wins:', wins, f'({win_rate:.2%})')
    print('Total PnL:', f'{total_pnl:.2f}')
    print('Avg trade return:', f'{avg_return:.2%}')
    print('Approx annualized return on deployed capital:', f'{annualized:.2%}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', default='2018-01-01')
    parser.add_argument('--end', default=datetime.today().strftime('%Y-%m-%d'))
    parser.add_argument('--stop-pct', type=float, default=0.08)
    parser.add_argument('--capital-per-trade', type=int, default=10000)
    parser.add_argument('--out', default='backtest/trades.csv')
    args = parser.parse_args()

    tickers = get_nifty50_tickers()
    print('Tickers count:', len(tickers))
    trades = run_backtest(tickers, args.start, args.end, stop_pct=args.stop_pct, capital_per_trade=args.capital_per_trade)
    outp = Path(args.out)
    outp.parent.mkdir(parents=True, exist_ok=True)
    trades.to_csv(outp, index=False)
    summarize(trades, capital_per_trade=args.capital_per_trade)


if __name__ == '__main__':
    main()
