import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { lockInText } from '../components/AddToBucket';
import { Message, ModelSelect, PageHeader, SignalPill, SkeletonRows, Tile } from '../components/ui';
import { istClock } from '../lib/closingDay';
import { ASSET_CLASSES, api, assetClassOf, hrefFor, isFund, postJson, useApp, usePolling } from '../lib/client';
import { displaySymbol, money, percent, qty, signedMoney, tone } from '../lib/format';
import { GOLD, isGold, isUs } from '../lib/kinds';
import { getStrategy } from '../lib/strategies';

const MAX_BUCKETS = 5;
const day = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const qtyLabel = (p) => (isGold(p.symbol) ? `${qty(p.quantity)} g` : qty(p.quantity));

/** My buckets: pretend collections of picks with the user's quantity and buy price, valued at closing prices. */
export default function BucketsPage() {
  const { buckets, bucketsLoaded, loadBuckets, openPick, prefs, setPref, showToast } = useApp();
  const strategy = getStrategy(prefs.strategy);
  const info = useInstrumentInfo(buckets, strategy.key);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

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
            A bucket is a collection for an idea, like “Banks I like” or “Gold as a hedge”. Add stocks, mutual funds,
            gold or silver with a quantity and buy price, and see how the idea does at real closing prices. Just for learning.
          </p>
          <ol className="how-it-works">
            <li><b>Name an idea</b><span>Up to {MAX_BUCKETS} buckets</span></li>
            <li><b>Add picks</b><span>Quantity, and your buy price (or the closing price)</span></li>
            <li><b>Track the P&amp;L</b><span>Value, profit and loss, and allocation at each close</span></li>
          </ol>
          <NewBucketForm onCreate={createBucket} initial="My first bucket" />
          <p className="muted small">Or browse <Link className="link accent" href="/stocks">stocks</Link> and <Link className="link accent" href="/funds">mutual funds</Link> first.</p>
        </section>
      </>
    );
  }

  const withValue = buckets.filter((b) => b.value != null);
  const withDay = buckets.filter((b) => b.dayChange != null);
  const totals = {
    invested: sum(withValue.map((b) => b.invested)),
    value: sum(withValue.map((b) => b.value)),
    day: sum(withDay.map((b) => b.dayChange)),
    dayBase: sum(withDay.map((b) => b.value - b.dayChange)),
  };
  const totalPnl = totals.value - totals.invested;
  const pickCount = sum(buckets.map((b) => b.openCount));

  return (
    <>
      <PageHeader
        title="My buckets"
        subtitle={<span className="muted">Valued at end-of-day closing prices. A learning tool, not investment advice.</span>}
        actions={(
          <>
            {buckets.length < MAX_BUCKETS && <button type="button" className="btn ghost" onClick={() => setCreating(true)}>New bucket</button>}
            <button type="button" className="btn primary" onClick={() => openPick()}>+ Add a pick</button>
          </>
        )}
      />

      {withValue.length > 0 && (
        <section className="tiles">
          <Tile label="Current value" value={money(totals.value, { whole: true })} sub={`${pickCount} pick${pickCount === 1 ? '' : 's'} in ${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`} subTone="muted" />
          <Tile label="Invested" value={money(totals.invested, { whole: true })} sub="at your buy prices" subTone="muted" />
          <Tile label="Total P&L" value={signedMoney(totalPnl, { whole: true })} tone={tone(totalPnl)} sub={percent(totals.invested ? (totalPnl / totals.invested) * 100 : null)} />
          <Tile label="Day’s change" value={signedMoney(totals.day, { whole: true })} tone={tone(totals.day)} sub={totals.dayBase ? percent((totals.day / totals.dayBase) * 100) : 'at the latest close'} />
        </section>
      )}

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
        <Bucket key={b.id} bucket={b} info={info} strategy={strategy} onAdd={() => openPick({ bucketId: b.id })} onEdit={setEditing} />
      ))}
      <p className="muted tiny table-foot">
        Values use end-of-day closing prices, in ₹. US stocks convert at the USD/INR rate of each date, so their ₹ P&amp;L
        includes the rupee’s move. Gold uses an estimated Indian price per gram. Buy prices you type are your own record
        and aren’t checked; nothing here connects to a broker. Removed picks keep counting at their exit price, so a bucket’s P&amp;L includes them.
        Model outlooks are experimental and are not recommendations.
      </p>
      {editing && <EditPick pick={editing} name={info[editing.symbol]?.name} onClose={() => setEditing(null)} />}
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
function useInstrumentInfo(buckets, strategyKey) {
  const all = useMemo(() => [...new Set(buckets.flatMap((b) => b.picks.map((p) => p.symbol)))].sort(), [buckets]);
  const stocks = all.filter((s) => !isFund(s) && !isGold(s)).join(',');
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
      /* names and outlooks are nice-to-haves; the table still shows symbols and values */
    }
  }, [stocks, funds]);
  usePolling(load, 10 * 60 * 1000, true);
  return useMemo(() => {
    const map = {};
    for (const s of market?.stocks || []) map[s.symbol] = { name: s.name, ...(s.signals?.[strategyKey] || {}) };
    for (const [sym, f] of Object.entries(fundInfo || {})) if (f?.name) map[sym] = { name: f.name };
    map[GOLD.symbol] = { name: GOLD.name };
    return map;
  }, [market, fundInfo, strategyKey]);
}

/** Part-to-whole by asset class, by current value. */
function Allocation({ picks, info }) {
  const open = picks.filter((p) => p.status !== 'closed' && p.value != null);
  const total = sum(open.map((p) => p.value));
  if (!total) return null;
  const parts = ASSET_CLASSES.map((c) => {
    const items = open.filter((p) => assetClassOf(p.symbol, info[p.symbol]?.name || '') === c.key);
    return { ...c, count: items.length, pct: (sum(items.map((p) => p.value)) / total) * 100 };
  }).filter((c) => c.count > 0);
  return (
    <div className="alloc compact">
      <div className="alloc-bar" role="img" aria-label={parts.map((a) => `${a.label} ${a.pct.toFixed(0)}%`).join(', ')}>
        {parts.map((a) => <span key={a.key} className={`alloc-seg ${a.cls}`} style={{ width: `${a.pct}%` }} title={`${a.label}: ${a.pct.toFixed(1)}%`} />)}
      </div>
      <ul className="alloc-legend inline">
        {parts.map((a) => (
          <li key={a.key}><i className={`swatch sq ${a.cls}`} /><span>{a.label}</span><span className="muted">{a.pct.toFixed(0)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

function Bucket({ bucket, info, strategy, onAdd, onEdit }) {
  const { loadBuckets, showToast } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(bucket.name);
  const open = bucket.picks.filter((p) => p.status !== 'closed');
  const closed = bucket.picks.filter((p) => p.status === 'closed');

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
            {bucket.pendingCount > 0 && ` · ${bucket.pendingCount} waiting for a closing price`}
            {closed.length > 0 && ` · ${closed.length} removed`}
          </span>
        </div>
        <div className="bucket-actions">
          <button type="button" className="btn primary small" onClick={onAdd}>+ Add pick</button>
          {!renaming && <button type="button" className="btn ghost small" onClick={() => setRenaming(true)}>Rename</button>}
          <button type="button" className="btn ghost small danger" onClick={remove}>Delete</button>
        </div>
      </div>

      {bucket.value != null && (
        <div className="bucket-stats">
          <div><span className="label">Invested</span><b>{money(bucket.invested, { whole: true })}</b></div>
          <div><span className="label">Value</span><b>{money(bucket.value, { whole: true })}</b></div>
          <div><span className="label">P&amp;L</span><b className={tone(bucket.pnl)}>{signedMoney(bucket.pnl, { whole: true })}</b> <span className={`small ${tone(bucket.pnl)}`}>{percent(bucket.returnPct)}</span></div>
          <div><span className="label">Day’s change</span><b className={tone(bucket.dayChange)}>{bucket.dayChange != null ? signedMoney(bucket.dayChange, { whole: true }) : '—'}</b> <span className={`small ${tone(bucket.dayChange)}`}>{percent(bucket.dayChangePct)}</span></div>
          <Allocation picks={bucket.picks} info={info} />
        </div>
      )}

      {open.length === 0 ? (
        <div className="empty">No picks yet. <button type="button" className="link accent" onClick={onAdd}>Add a stock, fund, gold or silver</button>.</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Pick · outlook ({strategy.label})</th>
                <th className="num">Qty</th>
                <th className="num">Avg buy</th>
                <th className="num">Invested</th>
                <th className="num">Latest close</th>
                <th className="num">Value</th>
                <th className="num">P&amp;L</th>
                <th className="num">Day</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {open.map((p) => <PickRow key={p.id} pick={p} info={info[p.symbol]} onEdit={() => onEdit(p)} />)}
            </tbody>
          </table>
        </div>
      )}

      {closed.length > 0 && (
        <details className="closed-picks">
          <summary className="small">Removed picks ({closed.length}), still counted in the bucket’s P&amp;L</summary>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Pick</th><th className="num">Qty</th><th className="num">Avg buy</th><th>Exited</th><th className="num">Exit close</th><th className="num">P&amp;L</th></tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={p.id}>
                    <td><Link className="link" href={hrefFor(p.symbol)}>{info[p.symbol]?.name || displaySymbol(p.symbol)}</Link></td>
                    <td className="num">{qtyLabel(p)}</td>
                    <td className="num">{money(p.entry_price, { currency: p.currency })}</td>
                    <td>{p.exit_price ? day(p.exit_date) : <span className="muted">at {day(p.exit_date)} close</span>}</td>
                    <td className="num">{money(p.exit_price, { currency: p.currency })}</td>
                    <td className={`num ${tone(p.pnl)}`}>
                      {signedMoney(p.pnl, { whole: true })} <span className="tiny">{percent(p.returnPct)}</span>
                      {!p.exit_price && p.pnl != null && <span className="muted tiny"> so far</span>}
                    </td>
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

function PickRow({ pick, info, onEdit }) {
  const { loadBuckets, showToast } = useApp();
  const label = info?.name || displaySymbol(pick.symbol);
  const pending = pick.status === 'pending';

  const removePick = async () => {
    const msg = pending
      ? `Remove ${label}? It hasn’t got a buy price yet, so it will simply be dropped.`
      : `Remove ${label}? It exits at ${lockInText(new Date(), isUs(pick.symbol) || isGold(pick.symbol) ? 'US' : 'IN')}, and its P&L stays in this bucket’s record.`;
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
      <td className="pick-cell">
        <Link className="link" href={hrefFor(pick.symbol)}><b>{label}</b></Link>
        {!isFund(pick.symbol) && !isGold(pick.symbol) && <> <SignalPill signal={info?.signal || 'LOADING'} title={info?.reason} /></>}
        <div className="muted tiny">
          {isFund(pick.symbol) ? `Mutual fund · AMFI ${pick.symbol.slice(3)}` : isGold(pick.symbol) ? '24K, estimated Indian price' : isUs(pick.symbol) ? `${displaySymbol(pick.symbol)} · US · USD` : displaySymbol(pick.symbol)}
          {' · '}bought {day(pick.entry_date)}
        </div>
      </td>
      <td className="num">{qtyLabel(pick)}</td>
      {pending ? (
        <td colSpan={4}>
          <span className="chip warn" title={`The closing price on ${day(pick.entry_date)}, or the next trading day’s if the market is shut that day`}>
            Buy price: next closing price
          </span>
        </td>
      ) : (
        <>
          <td className="num">
            {money(pick.entry_price, { currency: pick.currency })}
            <div className="muted tiny">{pick.price_source === 'manual' ? 'your price' : 'closing price'}{isGold(pick.symbol) ? ' /g' : ''}</div>
          </td>
          <td className="num">
            {money(pick.invested, { whole: true })}
            {pick.fxEntry && <div className="muted tiny">{money(pick.quantity * pick.entry_price, { currency: 'USD', whole: true })} @ ₹{pick.fxEntry.toFixed(2)}</div>}
          </td>
          <td className="num">{money(pick.lastClose, { currency: pick.currency })}<div className="muted tiny">{isGold(pick.symbol) ? 'per gram · ' : ''}{day(pick.lastCloseDate)}</div></td>
          <td className="num">
            {money(pick.value, { whole: true })}
            {pick.fxLatest && <div className="muted tiny">{money(pick.quantity * pick.lastClose, { currency: 'USD', whole: true })} @ ₹{pick.fxLatest.toFixed(2)}</div>}
          </td>
        </>
      )}
      <td className={`num ${tone(pick.pnl)}`}>
        <b>{pending ? '—' : signedMoney(pick.pnl, { whole: true })}</b>
        {!pending && <div className="tiny">{percent(pick.returnPct)}</div>}
      </td>
      <td className={`num ${tone(pick.dayChange)}`}>
        {pick.dayChange != null ? signedMoney(pick.dayChange, { whole: true }) : '—'}
        {pick.dayChangePct != null && <div className="tiny">{percent(pick.dayChangePct)}</div>}
      </td>
      <td className="actions">
        <div className="row-actions">
          <button type="button" className="link accent small" onClick={onEdit} aria-label={`Edit ${label}`}>Edit</button>
          <button type="button" className="link small muted" onClick={removePick} aria-label={`Remove ${label}`}>Remove</button>
        </div>
      </td>
    </tr>
  );
}

/** Change a pick's quantity, buy price or buy date. A blank price means "use the closing price". */
function EditPick({ pick, name, onClose }) {
  const { loadBuckets, showToast } = useApp();
  const [quantity, setQuantity] = useState(String(pick.quantity));
  const [price, setPrice] = useState(pick.price_source === 'manual' ? String(pick.entry_price) : '');
  const [date, setDate] = useState(pick.entry_date);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await postJson('/api/picks', { id: pick.id, quantity, price: price.trim() || null, date }, 'PATCH');
      await loadBuckets();
      showToast(`Updated ${name || displaySymbol(pick.symbol)}.`);
      onClose();
    } catch (error) {
      setMsg({ kind: 'error', text: error.message });
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="modal-head">
          <h2 id="edit-title">Edit {name || displaySymbol(pick.symbol)}</h2>
          <button type="button" className="btn ghost small icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="form" onSubmit={save}>
          <div className="form-row three">
            <label><span>{isGold(pick.symbol) ? 'Grams' : isFund(pick.symbol) ? 'Units' : 'Shares'}</span>
              <input className="input" type="number" min="0" step="any" required autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label><span>{isUs(pick.symbol) ? 'Buy price ($)' : isGold(pick.symbol) ? 'Price per gram (₹)' : 'Buy price (₹)'}</span>
              <input className="input" type="number" min="0" step="any" placeholder="closing price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label><span>Buy date</span>
              <input className="input" type="date" min="2000-01-01" max={istClock().date} required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <p className="muted tiny" style={{ margin: 0 }}>Leave the price blank to use the closing price of the buy date.</p>
          <Message msg={msg} />
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
