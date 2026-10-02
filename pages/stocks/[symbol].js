import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import PriceChart from '../../components/PriceChart';
import { ModelSelect, PageHeader, SignalPill, SkeletonRows } from '../../components/ui';
import { api, isIndianStock, isStock, useApp, usePolling } from '../../lib/client';
import { displaySymbol, percent, priceOf, tone } from '../../lib/format';
import { STRATEGIES, STRATEGY_GROUPS, getStrategy } from '../../lib/strategies';

/** Stock detail: price, every model's outlook, and key numbers. */
export default function StockPage() {
  const router = useRouter();
  const symbol = typeof router.query.symbol === 'string' ? router.query.symbol.toUpperCase() : null;
  const { prefs, setPref, watchlist, toggleWatch, openPick, pickedIn } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const strategy = getStrategy(prefs.strategy);

  const load = useCallback(async () => {
    if (!symbol) return;
    try {
      setData(await api(`/api/instrument?symbol=${encodeURIComponent(symbol)}`));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [symbol]);
  usePolling(load, 60 * 1000, Boolean(symbol));

  const stock = data;

  if (error && !data) {
    return (
      <>
        <PageHeader title={displaySymbol(symbol || '')} back={{ href: '/stocks', label: 'Stocks' }} />
        <div className="panel empty">Couldn&rsquo;t load {symbol}: {error}. Check the ticker, or search for it at the top of the page.</div>
      </>
    );
  }
  if (!stock) {
    return (
      <>
        <PageHeader title={displaySymbol(symbol || '')} back={{ href: '/stocks', label: 'Stocks' }} />
        <SkeletonRows rows={8} />
      </>
    );
  }

  const signals = stock.signals || {};
  const overall = signals.overall;
  const current = signals[strategy.key];
  const mlMissing = isIndianStock(stock.symbol) && signals.ensemble?.signal === 'NO_DATA';
  const watched = watchlist.includes(stock.symbol);
  const v = (k, f) => signals[k]?.values?.[f];

  const stats = [
    ['52-week high', priceOf(stock.high52, stock), v('momentum', 'fromHighPct') !== undefined ? `${percent(-v('momentum', 'fromHighPct'))} from high` : null],
    ['52-week low', priceOf(stock.low52, stock), stock.low52 && stock.price ? `${percent(((stock.price - stock.low52) / stock.low52) * 100)} above low` : null],
    ['vs 20-day EMA', percent(v('momentum', 'vsTrendPct')), 'short-term trend'],
    ['vs 50-day average', percent(v('trend', 'vs50Pct')), `50 DMA ${percent(v('trend', 'spreadPct'))} vs 200 DMA`],
    ['RSI (14)', v('rsi', 'rsi') !== undefined ? v('rsi', 'rsi').toFixed(1) : '—', 'below 30 oversold · above 70 overbought'],
    ['Bollinger %B', v('bollinger', 'pctB') !== undefined ? v('bollinger', 'pctB').toFixed(2) : '—', '0 = lower band · 1 = upper band'],
  ];

  return (
    <>
      <PageHeader
        back={{ href: '/stocks', label: 'Stocks' }}
        title={stock.name}
        subtitle={(
          <>
          <div className="id-line">
            {displaySymbol(stock.symbol).replace(/\.BO$/, '')}{stock.exchange && ` · ${stock.exchange}`}{stock.isin && ` · ISIN ${stock.isin}`}
          </div>
          <span className="quote-line">
            <span className="quote-price">{priceOf(stock.price, stock)}</span>
            <span className={tone(stock.changePct)}>{stock.change != null ? `${stock.change >= 0 ? '+' : '−'}${Math.abs(stock.change).toFixed(2)} (${percent(stock.changePct)})` : ''}</span>
            {stock.stale && <span className="stale-tag">stale</span>}
          </span>
          </>
        )}
        actions={(
          <>
            <button type="button" className={`btn ghost ${watched ? 'on' : ''}`} onClick={() => toggleWatch(stock.symbol, stock.name)} aria-pressed={watched}>
              {watched ? '★ Watching' : '☆ Watch'}
            </button>
            {isStock(stock.symbol) && (
              <button type="button" className="btn primary" onClick={() => openPick({ symbol: stock.symbol, name: stock.name })}>+ Add to bucket</button>
            )}
          </>
        )}
      />

      {pickedIn.has(stock.symbol) && (
        <p className="in-buckets small">In your bucket{pickedIn.get(stock.symbol).length > 1 ? 's' : ''}: <b>{pickedIn.get(stock.symbol).join(', ')}</b></p>
      )}

      <section className="verdict-hero panel">
        <div className="vh-main">
          <span className="label">Overall model outlook</span>
          <div className="vh-row">
            <SignalPill signal={overall?.signal || 'NO_DATA'} size="lg" />
            <p className="vh-reason">{overall?.reason}</p>
          </div>
        </div>
        {strategy.key !== 'overall' && current && (
          <div className="vh-side">
            <span className="label">{strategy.label} (your chosen model)</span>
            <div className="vh-row"><SignalPill signal={current.signal} /><span className="small">{current.reason}</span></div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Price and {strategy.label} view</h2>
          <ModelSelect value={strategy.key} onChange={(k) => setPref('strategy', k)} />
        </div>
        <PriceChart symbol={stock.symbol} refreshKey={stock.asOf} strategy={strategy} showTitle={false} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Each model’s outlook</h2>
          {mlMissing && (
            <span className="muted small">No ML outlook yet: stocks in a bucket or watchlist are scored in tonight’s run.</span>
          )}
        </div>
        {Object.values(signals).some((x) => x.signal === 'NA') && (
          <p className="muted small verdict-note">The ML models score individual stocks, not indices or commodities.</p>
        )}
        {STRATEGY_GROUPS.filter((g) => g.key !== 'overall').map((g) => (
          <div key={g.key} className="verdict-group">
            <div className="sg-label">{g.label}</div>
            <div className="verdict-grid">
              {STRATEGIES.filter((st) => st.group === g.key).map((st) => {
                const s = signals[st.key];
                return (
                  <button
                    key={st.key}
                    type="button"
                    className={`verdict ${strategy.key === st.key ? 'active' : ''} ${s?.signal === 'NA' ? 'na' : ''}`}
                    onClick={() => setPref('strategy', st.key)}
                    title={`Show ${st.label} on the chart and use it for outlooks`}
                  >
                    <span className="verdict-top">
                      <span className="verdict-name">{st.label}</span>
                      <SignalPill signal={s?.signal || 'NO_DATA'} />
                    </span>
                    <span className="verdict-reason">{s?.reason}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Key numbers</h2>
        <div className="stat-grid">
          {stats.map(([k, val, sub]) => (
            <div key={k} className="mstat">
              <div className="label">{k}</div>
              <div className="mstat-value">{val ?? '—'}</div>
              {sub && <div className="mstat-sub">{sub}</div>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
