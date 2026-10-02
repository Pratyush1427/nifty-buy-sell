import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { lockInText } from '../components/AddToBucket';
import { ModelSelect, PageHeader, SignalPill, SkeletonRows } from '../components/ui';
import { api, hrefFor, isFund, postJson, useApp, usePolling } from '../lib/client';
import { displaySymbol, money, percent, tone } from '../lib/format';
import { getStrategy } from '../lib/strategies';

const MAX_BUCKETS = 5;
const day = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

/** My buckets: pretend collections of picks, valued at end-of-day closing prices. */
export default function BucketsPage() {
  const { buckets, bucketsLoaded, loadBuckets, openPick, prefs, setPref, showToast } = useApp();
  const strategy = getStrategy(prefs.strategy);
  const outlooks = useOutlooks(buckets, strategy.key);
  const [creating, setCreating] = useState(false);

  const createBucket = async (name) => {
    try {
      await postJson('/api/buckets', { name });
      await loadBuckets();
      setCreating(false);
      return true;
    } catch (error) {
      showToast(error.message);
      return false;
    }
  };

  const actions = (
    <>
      {buckets.length > 0 && buckets.length < MAX_BUCKETS && (
        <button type="button" className="btn ghost" onClick={() => setCreating(true)}>New bucket</button>
      )}
      {buckets.length > 0 && <button type="button" className="btn primary" onClick={() => openPick()}>+ Add a pick</button>}
    </>
  );

  if (!bucketsLoaded) {
    return (
      <>
        <PageHeader title="My buckets" />
        <SkeletonRows rows={5} />
      </>
    );
  }

  if (buckets.length === 0) {
    return (
      <>
        <PageHeader title="My buckets" />
        <section className="panel onboarding">
          <h2>Build your first bucket</h2>
          <p className="muted" style={{ maxWidth: 560 }}>
            A bucket is a pretend collection for an idea, like “Banks I like” or “Gold as a hedge”. Add stocks, mutual funds,
            gold or silver, and see how the idea would have done at real closing prices. No money, no quantities: just learning.
          </p>
          <ol className="how-it-works">
            <li><b>Name an idea</b><span>Up to {MAX_BUCKETS} buckets</span></li>
            <li><b>Add picks</b><span>Stocks, ETFs, funds, gold, silver</span></li>
            <li><b>Each pick locks in at a close</b><span>Then track it day by day</span></li>
          </ol>
          <NewBucketForm onCreate={createBucket} initial="My first bucket" />
          <p className="muted small">Or browse <Link className="link accent" href="/stocks">stocks</Link> and <Link className="link accent" href="/funds">mutual funds</Link> first.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My buckets"
        subtitle={<span className="muted">A game with pretend picks, valued at end-of-day closing prices. Not investment advice.</span>}
        actions={actions}
      />
      {creating && (
        <section className="panel">
          <h2>New bucket</h2>
          <NewBucketForm onCreate={createBucket} onCancel={() => setCreating(false)} />
        </section>
      )}
      <div className="bucket-toolbar">
        <ModelSelect value={prefs.strategy} onChange={(v) => setPref('strategy', v)} />
      </div>
      {buckets.map((b) => (
        <Bucket key={b.id} bucket={b} outlooks={outlooks} strategy={strategy} onAdd={() => openPick({ bucketId: b.id })} />
      ))}
      <p className="muted tiny table-foot">
        Returns use closing prices only: from each pick’s entry close to the latest close (or its exit close once removed).
        A bucket’s return is the plain average of its picks, removed ones included. Model outlooks are experimental and are not recommendations.
      </p>
    </>
  );
}

function NewBucketForm({ onCreate, onCancel, initial = '' }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    if (!(await onCreate(name))) setBusy(false);
  };
  return (
    <form className="new-bucket" onSubmit={submit}>
      <input className="input" maxLength={40} required autoFocus placeholder="e.g. Banks I like" value={name} onChange={(e) => setName(e.target.value)} aria-label="Bucket name" />
      <button className="btn primary" disabled={busy}>Create bucket</button>
      {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

/**
 * Display names for every pick (stocks from the market feed, funds from AMFI),
 * plus the model outlook, under the chosen model, for every stock in a bucket.
 */
function useOutlooks(buckets, strategyKey) {
  const all = useMemo(() => [...new Set(buckets.flatMap((b) => b.picks.map((p) => p.symbol)))].sort(), [buckets]);
  const stocks = all.filter((s) => !isFund(s)).join(',');
  const funds = all.filter(isFund).join(',');
  const [market, setMarket] = useState(null);
  const [fundInfo, setFundInfo] = useState({});
  const load = useCallback(async () => {
    try {
      const [m, f] = await Promise.all([
        stocks ? api(`/api/market?universe=held&symbols=${encodeURIComponent(stocks)}`) : null,
        funds ? api(`/api/funds/quotes?symbols=${encodeURIComponent(funds)}`) : {},
      ]);
      setMarket(m);
      setFundInfo(f);
    } catch {
      /* names and outlooks are nice-to-haves; the table still shows symbols and returns */
    }
  }, [stocks, funds]);
  usePolling(load, 10 * 60 * 1000, true);
  return useMemo(() => {
    const map = {};
    for (const s of market?.stocks || []) map[s.symbol] = { name: s.name, ...(s.signals?.[strategyKey] || {}) };
    for (const [sym, f] of Object.entries(fundInfo || {})) if (f?.name) map[sym] = { name: f.name };
    return map;
  }, [market, fundInfo, strategyKey]);
}

function Bucket({ bucket, outlooks, strategy, onAdd }) {
  const { loadBuckets, showToast } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(bucket.name);
  const open = bucket.picks.filter((p) => p.status !== 'closed');
  const closed = bucket.picks.filter((p) => p.status === 'closed');
  const priced = bucket.picks.filter((p) => p.returnPct != null).length;

  const rename = async (e) => {
    e.preventDefault();
    try {
      await postJson('/api/buckets', { id: bucket.id, name }, 'PATCH');
      await loadBuckets();
      setRenaming(false);
    } catch (error) {
      showToast(error.message);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${bucket.name}” and all its picks? This can’t be undone.`)) return;
    try {
      await api(`/api/buckets?id=${bucket.id}`, { method: 'DELETE' });
      await loadBuckets();
      showToast(`Deleted “${bucket.name}”.`);
    } catch (error) {
      showToast(error.message);
    }
  };

  return (
    <section className="panel bucket">
      <div className="bucket-head">
        <div className="bucket-title">
          {renaming ? (
            <form className="new-bucket" onSubmit={rename}>
              <input className="input" maxLength={40} required autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Bucket name" />
              <button className="btn primary small">Save</button>
              <button type="button" className="btn ghost small" onClick={() => { setRenaming(false); setName(bucket.name); }}>Cancel</button>
            </form>
          ) : (
            <h2>{bucket.name}</h2>
          )}
          <span className="muted small">
            {open.length} pick{open.length === 1 ? '' : 's'}
            {bucket.pendingCount > 0 && ` · ${bucket.pendingCount} locking in`}
            {closed.length > 0 && ` · ${closed.length} removed`}
          </span>
        </div>
        <div className="bucket-return">
          <span className="label">Bucket return</span>
          <b className={tone(bucket.returnPct)}>{priced ? percent(bucket.returnPct) : '—'}</b>
          <span className="muted tiny">{priced ? `average of ${priced} pick${priced === 1 ? '' : 's'}` : 'after the first close'}</span>
        </div>
        <div className="bucket-actions">
          <button type="button" className="btn primary small" onClick={onAdd}>+ Add pick</button>
          {!renaming && <button type="button" className="btn ghost small" onClick={() => setRenaming(true)}>Rename</button>}
          <button type="button" className="btn ghost small danger" onClick={remove}>Delete</button>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="empty">No picks yet. <button type="button" className="link accent" onClick={onAdd}>Add a stock, fund, gold or silver</button>.</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Pick</th>
                <th>Outlook ({strategy.label})</th>
                <th>Entered</th>
                <th className="num">Entry close</th>
                <th className="num">Latest close</th>
                <th className="num">Return</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {open.map((p) => <PickRow key={p.id} pick={p} outlook={outlooks[p.symbol]} />)}
            </tbody>
          </table>
        </div>
      )}

      {closed.length > 0 && (
        <details className="closed-picks">
          <summary className="small">Removed picks ({closed.length}), still counted in the bucket’s return</summary>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Pick</th><th>Entered</th><th className="num">Entry close</th><th>Exited</th><th className="num">Exit close</th><th className="num">Return</th></tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={p.id}>
                    <td><Link className="link" href={hrefFor(p.symbol)}>{outlooks[p.symbol]?.name || displaySymbol(p.symbol)}</Link></td>
                    <td>{day(p.entry_date)}</td>
                    <td className="num">{money(p.entry_price)}</td>
                    <td>{p.exit_price ? day(p.exit_date) : <span className="muted">at {day(p.exit_date)} close</span>}</td>
                    <td className="num">{money(p.exit_price)}</td>
                    <td className={`num ${tone(p.returnPct)}`}>{percent(p.returnPct)}{!p.exit_price && p.returnPct != null && <span className="muted tiny"> so far</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function PickRow({ pick, outlook }) {
  const { loadBuckets, showToast } = useApp();
  const label = outlook?.name || displaySymbol(pick.symbol);
  const pending = pick.status === 'pending';

  const removePick = async () => {
    const msg = pending
      ? `Remove ${label}? It hasn’t locked in yet, so it will simply be dropped.`
      : `Remove ${label}? It exits at ${lockInText()}, and its result stays in this bucket’s record.`;
    if (!window.confirm(msg)) return;
    try {
      await api(`/api/picks?id=${pick.id}`, { method: 'DELETE' });
      await loadBuckets();
    } catch (error) {
      showToast(error.message);
    }
  };

  return (
    <tr>
      <td>
        <Link className="link" href={hrefFor(pick.symbol)}><b>{label}</b></Link>
        <div className="muted tiny">{isFund(pick.symbol) ? `Mutual fund · AMFI ${pick.symbol.slice(3)}` : displaySymbol(pick.symbol)}</div>
      </td>
      <td>{isFund(pick.symbol) ? <span className="muted tiny">Funds have no outlook</span> : <SignalPill signal={outlook?.signal || 'LOADING'} title={outlook?.reason} />}</td>
      {pending ? (
        <td colSpan={3}>
          <span className="chip warn" title={`At the close on ${day(pick.entry_date)}, or the next trading day’s if the market is shut that day`}>
            Locks in at the next close
          </span>
        </td>
      ) : (
        <>
          <td>{day(pick.entry_date)}</td>
          <td className="num">{money(pick.entry_price)}</td>
          <td className="num">{money(pick.lastClose)}<div className="muted tiny">{day(pick.lastCloseDate)}</div></td>
        </>
      )}
      <td className={`num ${tone(pick.returnPct)}`}><b>{pending ? '—' : percent(pick.returnPct)}</b></td>
      <td className="actions"><button type="button" className="btn ghost small" onClick={removePick} aria-label={`Remove ${label}`}>Remove</button></td>
    </tr>
  );
}
