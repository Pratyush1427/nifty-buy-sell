import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import Sparkline from '../../components/Sparkline';
import SymbolSearch from '../../components/SymbolSearch';
import { FreshnessDot, ModelSelect, PageHeader, Segmented, SignalPill, SkeletonRows } from '../../components/ui';
import { api, hrefFor, postJson, useApp, usePolling } from '../../lib/client';
import { displaySymbol, istTime, percent, priceOf, timeAgo, tone } from '../../lib/format';
import { getStrategy } from '../../lib/strategies';

const OPEN_MS = 60 * 1000;
const CLOSED_MS = 5 * 60 * 1000;
const WATCH = 'watchlist';
const FALLBACK_TABS = [
  { key: 'nifty50', label: 'Nifty 50' }, { key: 'nifty200', label: 'Nifty 200' }, { key: 'sensex', label: 'Sensex' },
  { key: 'gold', label: 'Gold' }, { key: 'silver', label: 'Silver' }, { key: WATCH, label: 'Watchlist' },
];

// `score` comes from the active model: higher = more bullish under its rules.
const SORTS = {
  strength: { label: 'Strongest signal first', fn: (a, b) => (b.score ?? -1e9) - (a.score ?? -1e9) },
  weakest: { label: 'Weakest signal first', fn: (a, b) => (a.score ?? 1e9) - (b.score ?? 1e9) },
  change: { label: 'Biggest gainers today', fn: (a, b) => (b.changePct ?? -999) - (a.changePct ?? -999) },
  losers: { label: 'Biggest losers today', fn: (a, b) => (a.changePct ?? 999) - (b.changePct ?? 999) },
  name: { label: 'Name A–Z', fn: (a, b) => a.name.localeCompare(b.name) },
};

function formatValue(col, v) {
  if (v === null || v === undefined) return '—';
  if (col.fmt === 'votes') return `${v.buy}▲ ${v.hold}■ ${v.sell}▼`;
  if (col.fmt === 'pct') return percent(col.invert ? -v : v, { digits: col.digits ?? 2, signed: col.signed !== false });
  return v.toFixed(col.digits ?? 2);
}

/** Stocks: "What's worth a look?" A scannable list; detail lives on each stock's page. */
export default function StocksPage() {
  const router = useRouter();
  const { prefs, prefsReady, setPref, lots, watchlist, toggleWatch, loadWatchlist, showToast } = useApp();
  const [market, setMarket] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [watchInput, setWatchInput] = useState('');

  const tab = prefs.stockTab || 'nifty50';
  const sort = SORTS[prefs.sort] ? prefs.sort : 'strength';
  const strategy = getStrategy(prefs.strategy);
  const held = useMemo(() => new Set(lots.map((l) => l.symbol)), [lots]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setMarket(await api(`/api/market?universe=${encodeURIComponent(tab)}`));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [tab]);

  const anyOpen = (market?.benchmarks || []).some((b) => b.marketState === 'REGULAR');
  usePolling(load, anyOpen ? OPEN_MS : CLOSED_MS, prefsReady);

  const tabs = market?.universes || FALLBACK_TABS;
  const activeTab = tabs.find((t) => t.key === tab) || tabs[0];
  const loaded = market?.universe?.key === tab;

  const rows = useMemo(() => {
    if (!loaded) return [];
    return market.stocks.filter((s) => s.inUniverse).map((s) => ({ ...s, ...s.signals?.[strategy.key] }));
  }, [market, loaded, strategy.key]);

  const counts = useMemo(() => {
    const c = { ALL: rows.length, BUY: 0, HOLD: 0, SELL: 0 };
    rows.forEach((s) => { if (s.signal in c) c[s.signal] += 1; });
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows
      .filter((s) => filter === 'ALL' || s.signal === filter)
      .filter((s) => !q || s.symbol.includes(q) || s.name.toUpperCase().includes(q))
      .sort(SORTS[sort].fn);
  }, [rows, filter, search, sort]);

  const switchTab = (key) => { setPref('stockTab', key); setFilter('ALL'); setSearch(''); };

  const addWatch = async (symbol) => {
    if (!symbol.trim()) return;
    try {
      const r = await postJson('/api/watchlist', { symbol: symbol.trim() });
      showToast(r.added ? `Added ${displaySymbol(r.symbol)} to your watchlist.` : `${displaySymbol(r.symbol)} is already on your watchlist.`);
      setWatchInput('');
      await loadWatchlist();
      load();
    } catch (e) {
      showToast(e.message);
    }
  };

  const staleCount = rows.filter((s) => s.stale).length;
  const failed = rows.filter((s) => s.error && !(s.price > 0));
  const feedPaused = market?.feed?.status === 'paused';

  return (
    <>
      <PageHeader
        title="Stocks"
        subtitle={(
          <span className="freshness">
            <FreshnessDot state={error || feedPaused ? 'warn' : anyOpen ? 'live' : 'closed'} />
            {error || feedPaused ? 'Feed interrupted, showing saved prices' : anyOpen ? 'Market open' : 'Market closed'}
            {market && ` · updated ${timeAgo(market.fetchedAt)}`}
            <button type="button" className="link accent small" onClick={load} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </span>
        )}
        actions={<ModelSelect value={strategy.key} onChange={(v) => setPref('strategy', v)} />}
      />

      <nav className="bench-strip" aria-label="Indices">
        {(market?.benchmarks || []).map((b) => (
          <button type="button" key={b.tab} className={`bench ${tab === b.tab ? 'active' : ''}`} onClick={() => switchTab(b.tab)} aria-pressed={tab === b.tab}>
            <span className="bench-label">{b.label}{b.stale && <span className="stale-tag">stale</span>}</span>
            <span className="bench-price">{b.price ? priceOf(b.price, b) : '—'}</span>
            <span className={`bench-change ${tone(b.changePct)}`}>{b.price ? percent(b.changePct) : b.error ? 'unavailable' : '…'}</span>
          </button>
        ))}
        {market?.fx?.USD && (
          <div className="bench fx" title="Used to convert US$ holdings to ₹">
            <span className="bench-label">USD / INR</span>
            <span className="bench-price">₹{market.fx.USD.toFixed(2)}</span>
            <span className="bench-change muted">FX rate</span>
          </div>
        )}
      </nav>

      {(error || feedPaused || staleCount > 0 || failed.length > 0) && (
        <div className="banner warn" role="status">
          {error && <div>Couldn&rsquo;t reach the server ({error}). Showing the last snapshot.</div>}
          {feedPaused && <div>Yahoo Finance isn&rsquo;t responding, so saved prices are shown. Retrying at {istTime(market.feed.retryAt)} IST.</div>}
          {staleCount > 0 && !feedPaused && <div>{staleCount} stock{staleCount === 1 ? ' is' : 's are'} showing last saved prices.</div>}
          {failed.length > 0 && <div>No data for: {failed.map((s) => displaySymbol(s.symbol)).join(', ')}.</div>}
        </div>
      )}

      <section className="panel">
        <div className="tabs" role="tablist" aria-label="Stock lists">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => switchTab(t.key)}>
              {t.label}{t.key === WATCH && <span className="count"> {watchlist.filter((s) => !s.startsWith('MF:')).length}</span>}
            </button>
          ))}
        </div>

        {activeTab?.note && <p className="muted small tab-note">{activeTab.note}</p>}
        {tab === WATCH && (
          <form className="watch-add" onSubmit={(e) => { e.preventDefault(); addWatch(watchInput); }}>
            <SymbolSearch
              value={watchInput}
              onChange={setWatchInput}
              onPick={(item) => addWatch(item.symbol)}
              inputProps={{ placeholder: 'Add any NSE/BSE stock, e.g. "irctc" or "suzlon"', 'aria-label': 'Add to watchlist' }}
            />
            <button type="submit" className="btn primary" disabled={!watchInput.trim()}>Add</button>
          </form>
        )}

        <div className="filters">
          <Segmented
            label="Signal filter"
            value={filter}
            onChange={setFilter}
            options={[['ALL', 'All'], ['BUY', 'Buy'], ['HOLD', 'Hold'], ['SELL', 'Sell']].map(([key, l]) => ({ key, label: l, count: counts[key] }))}
          />
          <input className="input search" type="search" placeholder="Filter by name or symbol" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter list" />
          <select className="input" value={sort} onChange={(e) => setPref('sort', e.target.value)} aria-label="Sort">
            {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
          </select>
        </div>

        {!loaded && <SkeletonRows />}
        {loaded && tab === WATCH && rows.length === 0 && (
          <div className="empty">Your watchlist is empty. Add any NSE or BSE stock above, or use the search at the top of the page.</div>
        )}
        {loaded && rows.length > 0 && visible.length === 0 && (
          <div className="empty">
            Nothing matches. <button type="button" className="link accent" onClick={() => { setFilter('ALL'); setSearch(''); }}>Clear filters</button>
          </div>
        )}

        {loaded && visible.length > 0 && (
          <div className="table-scroll">
            <table className="table watch">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>60 days</th>
                  <th className="num">LTP</th>
                  <th className="num">1D</th>
                  {strategy.columns.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                  <th>{strategy.label}</th>
                  {tab === WATCH && <th aria-label="Remove" />}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.symbol} className="clickable" onClick={() => router.push(hrefFor(s.symbol))}>
                    <td>
                      <a className="link name-primary" href={hrefFor(s.symbol)} onClick={(e) => { e.preventDefault(); router.push(hrefFor(s.symbol)); }}>{s.name}</a>
                      {held.has(s.symbol) && <span className="held-tag">held</span>}
                      {s.currency !== 'INR' && <span className="held-tag other">{s.currency}</span>}
                      <div className="muted tiny">{displaySymbol(s.symbol).replace(/\.BO$/, '')}{s.exchange ? ` · ${s.exchange}` : ''}</div>
                    </td>
                    <td><Sparkline data={s.spark} /></td>
                    <td className="num">{priceOf(s.price, s)}{s.stale && <span className="stale-tag" title="Last saved price">stale</span>}</td>
                    <td className={`num ${tone(s.changePct)}`}>{percent(s.changePct)}</td>
                    {strategy.columns.map((c) => {
                      const v = s.values?.[c.key];
                      return <td key={c.key} className={`num ${c.tone ? tone(v) : ''}`}>{formatValue(c, v)}</td>;
                    })}
                    <td>
                      <SignalPill signal={s.signal} />
                      <div className="muted tiny reason-cell">{s.reason || s.error}</div>
                    </td>
                    {tab === WATCH && (
                      <td className="actions">
                        <button
                          type="button"
                          className="btn ghost small icon"
                          onClick={(e) => { e.stopPropagation(); toggleWatch(s.symbol, displaySymbol(s.symbol)).then(load); }}
                          aria-label={`Remove ${displaySymbol(s.symbol)} from watchlist`}
                          title="Remove from watchlist"
                        >✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loaded && market && <p className="muted small table-foot">Prices as of {istTime(market.fetchedAt)} IST. Click a stock for its chart and every model&rsquo;s view.</p>}
      </section>
    </>
  );
}
