import Link from 'next/link';
import { useEffect, useState } from 'react';
import HoldingsTable, { HoldingsTotals } from '../../components/HoldingsTable';
import { PageHeader, Segmented, SkeletonRows, Tile } from '../../components/ui';
import { api, fundCodeOf, isFund, useApp } from '../../lib/client';
import { money, percent, signedMoney, tone } from '../../lib/format';
import { usePortfolio } from '../../lib/usePortfolio';

const PLAN_FILTERS = [
  { key: 'all', label: 'All plans' },
  { key: 'direct', label: 'Direct Growth only' },
];

/** Mutual funds: your funds first (like a broker's MF dashboard), then explore. */
export default function FundsPage() {
  const { openAdd, watchlist, toggleWatch, lotsLoaded } = useApp();
  const { positions, fx, navDate } = usePortfolio();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [planFilter, setPlanFilter] = useState('all');
  const [watchQuotes, setWatchQuotes] = useState({});

  const myFunds = positions.filter((p) => p.assetClass === 'funds').sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const t = myFunds.reduce((s, p) => ({
    value: s.value + (p.value ?? p.invested),
    invested: s.invested + p.invested,
    day: s.day + (p.dayChange ?? 0),
    prev: s.prev + (p.value !== null && p.dayChange !== null ? p.value - p.dayChange : 0),
  }), { value: 0, invested: 0, day: 0, prev: 0 });
  const watchedFunds = watchlist.filter(isFund);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setResults(null); return undefined; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/funds/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }).then((x) => x.json());
        setResults(Array.isArray(r) ? r : []);
      } catch { /* aborted */ } finally { setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    if (!watchedFunds.length) { setWatchQuotes({}); return; }
    api(`/api/funds/quotes?symbols=${encodeURIComponent(watchedFunds.join(','))}`).then(setWatchQuotes).catch(() => {});
  }, [watchedFunds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = (results || []).filter((f) => planFilter === 'all' || (f.plan === 'Direct' && f.option === 'Growth'));
  const ret = t.value - t.invested;

  return (
    <>
      <PageHeader
        title="Mutual funds"
        subtitle={navDate
          ? `NAVs as of ${new Date(navDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · published by AMFI once a day, after market close`
          : 'NAVs are published by AMFI once a day, after market close'}
        actions={<button type="button" className="btn primary" onClick={() => openAdd({ kind: 'fund' })}>+ Add fund</button>}
      />

      {!lotsLoaded ? <SkeletonRows rows={4} /> : myFunds.length > 0 ? (
        <>
          <section className="tiles">
            <Tile label="Current value" value={money(t.value, { whole: true })} sub={`${myFunds.length} fund${myFunds.length > 1 ? 's' : ''}`} subTone="muted" />
            <Tile label="Invested" value={money(t.invested, { whole: true })} sub="what you paid" subTone="muted" />
            <Tile label="Total returns" value={signedMoney(ret, { whole: true })} tone={tone(ret)} sub={percent(t.invested ? (ret / t.invested) * 100 : null)} />
            <Tile label="1D returns" value={signedMoney(t.day, { whole: true })} tone={tone(t.day)} sub={percent(t.prev ? (t.day / t.prev) * 100 : null)} />
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Your funds <span className="count-badge">{myFunds.length}</span></h2>
            </div>
            <HoldingsTable positions={myFunds} fx={fx} kind="funds" />
            <HoldingsTotals positions={myFunds} />
          </section>
        </>
      ) : (
        <section className="panel empty-cta">
          <div>
            <h2>You haven&rsquo;t added any funds</h2>
            <p className="muted small">Add the funds you hold, using the units and average NAV from your broker app or CAS statement, to track them here next to your stocks.</p>
          </div>
          <button type="button" className="btn primary" onClick={() => openAdd({ kind: 'fund' })}>+ Add a fund you own</button>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Explore funds</h2>
          <Segmented options={PLAN_FILTERS} value={planFilter} onChange={setPlanFilter} label="Plans" />
        </div>
        <input
          className="input big"
          type="search"
          placeholder='Search any fund, e.g. "parag parikh flexi", "nifty 50 index", "hdfc mid cap"'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search mutual funds"
        />
        <p className="muted tiny search-hint">
          Names are shown the way brokers list them: fund name, then <b>Direct</b> or <b>Regular</b>, then <b>Growth</b> or <b>IDCW</b>.
          Make sure all three match what you hold.
        </p>
        {q.trim().length > 0 && q.trim().length < 3 && <p className="muted small">Keep typing…</p>}
        {searching && !results && <SkeletonRows rows={3} />}
        {results && (shown.length === 0 ? (
          <p className="muted small">
            No {planFilter === 'direct' ? 'Direct Growth ' : ''}funds match &ldquo;{q}&rdquo;.
            {planFilter === 'direct' && results.length > 0 && <> <button type="button" className="link accent" onClick={() => setPlanFilter('all')}>Show all {results.length} plans</button></>}
          </p>
        ) : (
          <ul className="fund-results">
            {shown.slice(0, 15).map((f) => (
              <li key={f.code}>
                <Link href={`/funds/${f.code}`} className="fund-result">
                  <span className="fr-name">{f.name}</span>
                  <span className="fr-tags">
                    {f.plan === 'Regular' && <span className="chip warn" title="Regular plans include distributor commission">Higher fees</span>}
                    {f.option === 'IDCW' && <span className="chip" title="Pays out instead of compounding">Payout</span>}
                    <span className="muted tiny">AMFI {f.code}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="grid-2">
        <div className="panel">
          <h2>Fund watchlist</h2>
          {watchedFunds.length === 0 ? (
            <p className="muted small">Open any fund and press <b>☆ Watch</b> to follow it here.</p>
          ) : (
            <ul className="watch-funds">
              {watchedFunds.map((sym) => {
                const f = watchQuotes[sym];
                return (
                  <li key={sym}>
                    <Link href={`/funds/${fundCodeOf(sym)}`} className="link">{f?.name || sym}</Link>
                    <span className="muted tiny">{[f?.category, f?.assetClass].filter(Boolean).join(' · ')}</span>
                    <span className="wf-nav">{f?.price ? money(f.price) : '—'}</span>
                    <span className={`wf-chg ${tone(f?.changePct)}`}>{percent(f?.changePct)}</span>
                    <button type="button" className="btn ghost small icon" onClick={() => toggleWatch(sym, f?.name || sym)} aria-label="Remove from watchlist">✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="panel explainer">
          <h2>How funds are judged here</h2>
          <p className="small">
            Funds don&rsquo;t get BUY/SELL signals. Those are for short-term trading, and funds are held for years.
            Each fund page shows whether it has <b>beaten the Nifty 50 after fees</b> over 3 and 5 years, how deep its <b>worst fall</b> was,
            and whether you&rsquo;re in the <b>cheaper Direct plan</b>.
          </p>
        </div>
      </section>
    </>
  );
}
