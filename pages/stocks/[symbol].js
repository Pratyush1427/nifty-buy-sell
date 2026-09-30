import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import PriceChart from '../../components/PriceChart';
import { ModelSelect, PageHeader, SignalPill, SkeletonRows } from '../../components/ui';
import { api, isStock, postJson, useApp, usePolling } from '../../lib/client';
import { displaySymbol, money, percent, priceOf, qty, signedMoney, tone } from '../../lib/format';
import { STRATEGIES, STRATEGY_GROUPS, getStrategy } from '../../lib/strategies';

/** Stock detail: "Should I act on this one?" */
export default function StockPage() {
  const router = useRouter();
  const symbol = typeof router.query.symbol === 'string' ? router.query.symbol.toUpperCase() : null;
  const { prefs, setPref, lots, watchlist, toggleWatch, openAdd, showToast } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mlBusy, setMlBusy] = useState(false);
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
  const position = useMemo(() => {
    if (!stock) return null;
    const mine = lots.filter((l) => l.symbol === stock.symbol);
    if (!mine.length) return null;
    const units = mine.reduce((s, l) => s + Number(l.shares), 0);
    const cost = mine.reduce((s, l) => s + Number(l.shares) * Number(l.avg_price), 0);
    const value = stock.price ? units * stock.price : null;
    return { units, avg: cost / units, cost, value, pnl: value !== null ? value - cost : null, pnlPct: value !== null ? ((value - cost) / cost) * 100 : null, lots: mine.length };
  }, [stock, lots]);

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
  const mlMissing = isStock(stock.symbol) && signals.ensemble?.signal === 'NO_DATA';
  const watched = watchlist.includes(stock.symbol);
  const v = (k, f) => signals[k]?.values?.[f];

  const scoreWithMl = async () => {
    setMlBusy(true);
    try {
      const r = await postJson('/api/ml-score', { symbol: stock.symbol });
      const skipped = r.skipped?.find((x) => x.symbol === stock.symbol);
      showToast(skipped ? `ML models skipped ${stock.name}: ${skipped.reason}.` : `ML scores ready for ${stock.name}.`);
      await load();
    } catch (e) {
      showToast(`Couldn't score: ${e.message}`);
    } finally {
      setMlBusy(false);
    }
  };

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
              <button type="button" className="btn primary" onClick={() => openAdd({ kind: 'stock', symbol: stock.symbol, name: stock.name, price: stock.price })}>+ Add to portfolio</button>
            )}
          </>
        )}
      />

      {position && (
        <section className="position-strip">
          <div><span className="label">You own</span><b>{qty(position.units)}</b> <span className="muted small">@ {money(position.avg)} avg</span></div>
          <div><span className="label">Value</span><b>{money(position.value, { whole: true })}</b></div>
          <div><span className="label">P/L</span><b className={tone(position.pnl)}>{signedMoney(position.pnl, { whole: true })}</b> <span className={`small ${tone(position.pnl)}`}>{percent(position.pnlPct)}</span></div>
        </section>
      )}

      <section className="verdict-hero panel">
        <div className="vh-main">
          <span className="label">Overall verdict</span>
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
          <h2>What each model says</h2>
          {mlMissing && (
            <button type="button" className="btn primary small" onClick={scoreWithMl} disabled={mlBusy}>
              {mlBusy ? 'Scoring…' : 'Score with ML models'}
            </button>
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
                    title={`Show ${st.label} on the chart and use it for signals`}
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
