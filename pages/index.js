import Link from 'next/link';
import { useMemo } from 'react';
import HoldingsTable, { HoldingsTotals } from '../components/HoldingsTable';
import { FreshnessDot, ModelSelect, PageHeader, SkeletonRows, Tile } from '../components/ui';
import { hrefFor, useApp } from '../lib/client';
import { displaySymbol, istTime, money, percent, signedMoney, timeAgo, tone } from '../lib/format';
import { getStrategy } from '../lib/strategies';
import { usePortfolio } from '../lib/usePortfolio';

/** Portfolio: "How am I doing, and does anything need my attention?" */
export default function PortfolioPage() {
  const { lotsLoaded, lots, openAdd, prefs, setPref } = useApp();
  const { market, positions, summary, allocation, refreshing, error, reload, fundErrors, navDate, fx } = usePortfolio();
  const strategy = getStrategy(prefs.strategy);

  // Brokers keep stocks and mutual funds apart; so do we. ETFs (incl. gold and
  // silver) trade like stocks, so they sit with stocks.
  const stockRows = summary.positions.filter((p) => p.assetClass !== 'funds');
  const fundRows = summary.positions.filter((p) => p.assetClass === 'funds');
  const attention = useAttention(summary, strategy, fundErrors);

  const nseOpen = market?.benchmarks?.find((b) => b.symbol === '^NSEI')?.marketState === 'REGULAR';
  const subtitle = (
    <span className="freshness">
      <FreshnessDot state={error ? 'warn' : nseOpen ? 'live' : 'closed'} />
      {error ? `Couldn't refresh prices (${error})` : market ? `Stock prices ${nseOpen ? 'live' : 'as of last close'}, updated ${timeAgo(market.fetchedAt)}` : 'Loading prices…'}
      {navDate && ` · fund NAVs as of ${new Date(navDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
      <button type="button" className="link accent small" onClick={reload} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </span>
  );

  const actions = (
    <>
      {lots.length > 0 && <a className="btn ghost" href="/api/portfolio?format=csv" download>Export</a>}
      <button type="button" className="btn primary" onClick={() => openAdd()}>+ Add investment</button>
    </>
  );

  if (lotsLoaded && lots.length === 0) {
    return (
      <>
        <PageHeader title="Portfolio" actions={actions} />
        <section className="panel onboarding">
          <h2>Start tracking your investments</h2>
          <p className="muted">Add what you own to see its value, profit and loss, and what each model thinks of it. Everything stays on this computer.</p>
          <div className="onboarding-actions">
            <button type="button" className="onboard-card" onClick={() => openAdd({ kind: 'stock' })}>
              <b>Add a stock</b><span>Any NSE or BSE listing</span>
            </button>
            <button type="button" className="onboard-card" onClick={() => openAdd({ kind: 'fund' })}>
              <b>Add a mutual fund</b><span>Any scheme, by name</span>
            </button>
            <button type="button" className="onboard-card" onClick={() => openAdd({ kind: 'csv' })}>
              <b>Import a CSV</b><span>From your broker or a spreadsheet</span>
            </button>
          </div>
          <p className="muted small">Just exploring? Browse <Link className="link accent" href="/stocks">stocks</Link> or <Link className="link accent" href="/funds">mutual funds</Link>.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Portfolio" subtitle={subtitle} actions={actions} />

      <section className="tiles">
        <Tile label="Current value" value={money(summary.value, { whole: true })}
          sub={summary.unpricedCount ? `${summary.unpricedCount} valued at cost (no price yet)` : `${positions.length} holding${positions.length === 1 ? '' : 's'}`} subTone="muted" />
        <Tile label="Invested" value={money(summary.invested, { whole: true })} sub="what you paid" subTone="muted" />
        <Tile label="Total returns" value={signedMoney(summary.pnl, { whole: true })} tone={tone(summary.pnl)} sub={percent(summary.pnlPct)} />
        <Tile label="1D returns" value={signedMoney(summary.dayPnl, { whole: true })} tone={tone(summary.dayPnl)} sub={percent(summary.dayPnlPct)} />
      </section>

      <section className="grid-2">
        <div className="panel">
          <h2>Allocation</h2>
          {!market && !positions.length ? <SkeletonRows rows={3} /> : <AllocationBar allocation={allocation} />}
        </div>
        <div className="panel">
          <h2>Needs attention</h2>
          {attention.length === 0 ? (
            <p className="muted small calm">Nothing flagged. No holding is a {strategy.label} SELL, and nothing is over a quarter of the portfolio.</p>
          ) : (
            <ul className="attention">
              {attention.slice(0, 6).map((a) => (
                <li key={a.key} className={`att ${a.kind}`}>
                  <span className="att-icon" aria-hidden="true">{a.kind === 'sell' ? '▼' : '!'}</span>
                  <div>
                    <div className="att-title">{a.href ? <Link className="link" href={a.href}>{a.title}</Link> : a.title}</div>
                    <div className="att-text">{a.text}</div>
                  </div>
                </li>
              ))}
              {attention.length > 6 && <li className="muted small">…and {attention.length - 6} more</li>}
            </ul>
          )}
        </div>
      </section>

      {(stockRows.length > 0 || !lotsLoaded) && (
        <section className="panel">
          <div className="panel-head">
            <h2>Stocks &amp; ETFs <span className="count-badge">{stockRows.length}</span></h2>
            <ModelSelect value={prefs.strategy} onChange={(v) => setPref('strategy', v)} />
          </div>
          {!lotsLoaded ? <SkeletonRows /> : (
            <>
              <HoldingsTable positions={stockRows} fx={fx} kind="stocks" />
              <HoldingsTotals positions={stockRows} />
            </>
          )}
        </section>
      )}

      {fundRows.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Mutual funds <span className="count-badge">{fundRows.length}</span></h2>
            <Link className="link accent small" href="/funds">Explore funds →</Link>
          </div>
          <HoldingsTable positions={fundRows} fx={fx} kind="funds" />
          <HoldingsTotals positions={fundRows} />
        </section>
      )}

      {summary.best && (
        <p className="muted small table-foot">
          Best performer {label(summary.best)} <span className="up">{percent(summary.best.pnlPct)}</span>
          {summary.worst && <> · Weakest {label(summary.worst)} <span className={tone(summary.worst.pnlPct)}>{percent(summary.worst.pnlPct)}</span></>}
          {market?.fetchedAt && <> · stock prices {istTime(market.fetchedAt)} IST</>}
        </p>
      )}
    </>
  );
}

const label = (p) => p.name || displaySymbol(p.symbol);

/** Things worth a look, most important first. */
function useAttention(summary, strategy, fundErrors) {
  return useMemo(() => {
    const items = [];
    for (const p of summary.positions) {
      if (p.assetClass !== 'funds' && p.signal === 'SELL') {
        items.push({ key: `sell-${p.symbol}`, kind: 'sell', href: hrefFor(p.symbol), title: `${label(p)}: ${strategy.label} says SELL`, text: p.reason });
      }
    }
    const top = summary.positions[0];
    if (top && summary.positions.length > 1 && top.weight > 25) {
      items.push({ key: 'conc', kind: 'warn', href: hrefFor(top.symbol), title: `${label(top)} is ${top.weight.toFixed(0)}% of your portfolio`, text: 'A single holding above 25% means one bad result moves everything. Consider whether that is intended.' });
    }
    for (const p of summary.positions) {
      if (p.value === null) items.push({ key: `nop-${p.symbol}`, kind: 'warn', href: hrefFor(p.symbol), title: `No price for ${label(p)}`, text: 'Valued at what you paid until a price is available.' });
      if (p.assetClass === 'funds' && /idcw|dividend/i.test(p.name)) {
        items.push({ key: `idcw-${p.symbol}`, kind: 'warn', href: hrefFor(p.symbol), title: `${label(p)} is an IDCW (payout) plan`, text: 'Its NAV drops at every payout, so P/L here understates your total return. Growth plans compound instead.' });
      }
    }
    for (const f of fundErrors) items.push({ key: `ferr-${f.symbol}`, kind: 'warn', title: `Couldn't load fund ${f.code}`, text: f.error });
    return items;
  }, [summary, strategy, fundErrors]);
}

/** Part-to-whole across asset classes: one stacked bar, with a legend that carries the numbers. */
function AllocationBar({ allocation }) {
  if (!allocation.length) return <p className="muted small">No priced holdings yet.</p>;
  return (
    <div className="alloc">
      <div className="alloc-bar" role="img" aria-label={allocation.map((a) => `${a.label} ${a.pct.toFixed(0)}%`).join(', ')}>
        {allocation.map((a) => (
          <span key={a.key} className={`alloc-seg ${a.cls}`} style={{ width: `${a.pct}%` }} title={`${a.label}: ${money(a.value, { whole: true })} (${a.pct.toFixed(1)}%)`} />
        ))}
      </div>
      <ul className="alloc-legend">
        {allocation.map((a) => (
          <li key={a.key}>
            <i className={`swatch sq ${a.cls}`} />
            <span className="alloc-name">{a.label}</span>
            <span className="muted tiny">{a.count} holding{a.count > 1 ? 's' : ''}</span>
            <span className="alloc-val">{money(a.value, { whole: true })}</span>
            <span className="alloc-pct">{a.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
