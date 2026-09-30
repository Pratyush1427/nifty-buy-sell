"""Keep index constituent lists current from NSE's published CSVs."""
import csv
import io
import urllib.request

from .config import DATA_DIR, NSE_LISTS

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36"


def refresh(log=print):
    """Rewrite data/<list>.csv from NSE. On any failure, keep the existing file."""
    for filename, url in NSE_LISTS.items():
        path = DATA_DIR / filename
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            text = urllib.request.urlopen(req, timeout=20).read().decode("utf-8-sig")
            symbols = sorted({row["Symbol"].strip() + ".NS" for row in csv.DictReader(io.StringIO(text)) if row.get("Symbol")})
            if len(symbols) < 40:
                raise ValueError(f"only {len(symbols)} symbols")
        except Exception as exc:  # network, format change: stale list beats no list
            log(f"  {filename}: kept existing list ({exc})")
            continue
        old = set(path.read_text().split()[1:]) if path.exists() else set()
        path.write_text("symbol\n" + "\n".join(symbols) + "\n")
        added, removed = sorted(set(symbols) - old), sorted(old - set(symbols))
        change = f" (+{', '.join(added)}; -{', '.join(removed)})" if (added or removed) and old else ""
        log(f"  {filename}: {len(symbols)} symbols{change}")
