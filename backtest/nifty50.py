import pandas as pd
from pathlib import Path


def _clean_symbol(raw):
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() == 'nan':
        return None
    s = s.replace(' ', '').upper()
    if not s.endswith('.NS'):
        s = s + '.NS'
    if s == 'NAN.NS':
        return None
    # Yahoo uses the NSE symbol verbatim, e.g. M&M.NS and BAJAJ-AUTO.NS.
    return s


def get_nifty50_tickers():
    """
    Try to load a Nifty 50 ticker list.
    Priority:
    1. data/nifty50.csv (workspace)
    2. Wikipedia table
    3. Fallback sample list
    Returns list of Yahoo tickers (with .NS suffix).
    """
    csv_path = Path(__file__).resolve().parents[1] / 'data' / 'nifty50.csv'

    # 1) local file
    try:
        df = pd.read_csv(csv_path)
        if 'symbol' in df.columns:
            symbols = []
            for raw in df['symbol'].astype(str).tolist():
                cleaned = _clean_symbol(raw)
                if cleaned:
                    symbols.append(cleaned)
            if symbols:
                return symbols
    except Exception:
        pass

    # 2) try Wikipedia
    try:
        tables = pd.read_html('https://en.wikipedia.org/wiki/NIFTY_50')
        for t in tables:
            if 'Symbol' in t.columns or 'Company' in t.columns:
                # try to find symbol-like column
                for col in ['Symbol', 'Code', 'Ticker']:
                    if col in t.columns:
                        syms = t[col].astype(str).tolist()
                        return [s.strip() + ('.NS' if not s.strip().endswith('.NS') else '') for s in syms if s.strip()]
    except Exception:
        pass

    # 3) fallback sample subset
    sample = [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS',
        'HINDUNILVR.NS', 'KOTAKBANK.NS', 'SBIN.NS', 'HDFC.NS', 'ITC.NS'
    ]
    return sample


if __name__ == '__main__':
    print('\n'.join(get_nifty50_tickers()))
