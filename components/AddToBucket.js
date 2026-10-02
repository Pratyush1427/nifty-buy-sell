import { useEffect, useRef, useState } from 'react';
import { closingDay, istClock } from '../lib/closingDay';
import { postJson, searchFundsClient, useApp } from '../lib/client';
import { displaySymbol } from '../lib/format';
import SymbolSearch from './SymbolSearch';
import { Message, Segmented } from './ui';

const TABS = [
  { key: 'stock', label: 'Stock or ETF' },
  { key: 'fund', label: 'Mutual fund' },
];
// One-tap picks for the metals, which most people don't know the tickers for.
const METALS = [
  { symbol: 'GOLDBEES.NS', name: 'Nippon India Gold BeES' },
  { symbol: 'SILVERBEES.NS', name: 'Nippon India Silver BeES' },
];
const NEW = '__new__';

/** "Locks in at today's close" / "…at the close on Mon 5 Oct", from the same rule the server uses. */
export function lockInText(now = new Date()) {
  const day = closingDay(now);
  if (day === istClock(now).date) return 'today’s closing price (after 3:30 pm IST)';
  const d = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `the closing price on ${d}`;
}

/**
 * Add an instrument to a bucket. Opened from the buckets page (optionally for
 * one bucket) or from a stock/fund page via openPick({ symbol, name, bucketId }).
 */
export default function AddToBucket() {
  const { pickDialog, closePick, buckets, loadBuckets, showToast } = useApp();
  const [kind, setKind] = useState('stock');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState(null);
  const [bucketId, setBucketId] = useState('');
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!pickDialog) return;
    const p = pickDialog;
    setKind(p.kind || (p.symbol?.startsWith('MF:') ? 'fund' : 'stock'));
    setText('');
    setPicked(p.symbol ? { symbol: p.symbol, name: p.name } : null);
    setBucketId(p.bucketId || buckets[0]?.id || NEW);
    setNewName(buckets.length ? '' : 'My first bucket');
    setMsg(null);
    setTimeout(() => dialogRef.current?.querySelector('input')?.focus(), 30);
    // Only when the dialog opens, not when buckets reload behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickDialog]);

  useEffect(() => {
    if (!pickDialog) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closePick(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickDialog, closePick]);

  if (!pickDialog) return null;
  const preset = Boolean(pickDialog.symbol);
  const symbol = (preset ? pickDialog.symbol : picked?.symbol) || (kind === 'stock' ? text.trim() : '');

  const submit = async (e) => {
    e.preventDefault();
    if (!symbol) return setMsg({ kind: 'error', text: kind === 'fund' ? 'Pick a fund from the list.' : 'Enter a stock or ETF.' });
    setBusy(true);
    setMsg(null);
    try {
      let target = bucketId;
      let bucketName = buckets.find((b) => b.id === bucketId)?.name;
      if (bucketId === NEW) {
        const created = await postJson('/api/buckets', { name: newName });
        target = created.id;
        bucketName = created.name;
      }
      const pick = await postJson('/api/picks', { bucketId: target, symbol });
      await loadBuckets();
      showToast(pick.warning || `Added ${picked?.name || displaySymbol(pick.symbol)} to “${bucketName}”. It locks in at ${lockInText()}.`);
      closePick();
    } catch (error) {
      setMsg({ kind: 'error', text: error.message });
      await loadBuckets(); // a bucket may have been created before the pick failed
    } finally {
      setBusy(false);
    }
    return null;
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closePick(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pick-title" ref={dialogRef}>
        <div className="modal-head">
          <h2 id="pick-title">{preset ? `Add ${pickDialog.name || displaySymbol(pickDialog.symbol)} to a bucket` : 'Add to a bucket'}</h2>
          <button type="button" className="btn ghost small icon" onClick={closePick} aria-label="Close">✕</button>
        </div>

        <form className="form" onSubmit={submit}>
          {!preset && (
            <>
              <Segmented options={TABS} value={kind} onChange={(k) => { setKind(k); setText(''); setPicked(null); setMsg(null); }} label="Instrument type" />
              {kind === 'stock' ? (
                <>
                  <label>
                    <span>Stock or ETF</span>
                    <SymbolSearch
                      value={text}
                      onChange={(v) => { setText(v); setPicked(null); }}
                      onPick={setPicked}
                      inputProps={{ name: 'symbol', placeholder: 'Name or ticker, e.g. "tata motors"' }}
                    />
                  </label>
                  <div className="chips" aria-label="Gold and silver">
                    {METALS.map((m) => (
                      <button key={m.symbol} type="button" className={`chip ${picked?.symbol === m.symbol ? 'good' : ''}`} onClick={() => { setPicked(m); setText(m.name); }}>
                        {m.name.includes('Gold') ? 'Gold' : 'Silver'} · {displaySymbol(m.symbol)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <label>
                  <span>Mutual fund</span>
                  <SymbolSearch
                    value={text}
                    onChange={(v) => { setText(v); setPicked(null); }}
                    onPick={setPicked}
                    search={searchFundsClient}
                    keepFullSymbol={false}
                    inputProps={{ name: 'fund', placeholder: 'Fund name, e.g. "parag parikh flexi"' }}
                  />
                </label>
              )}
              {picked?.name && <p className="muted tiny" style={{ margin: 0 }}>{picked.name} · {displaySymbol(picked.symbol)}</p>}
            </>
          )}

          <fieldset className="form" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="small" style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Bucket</legend>
            {buckets.map((b) => (
              <label key={b.id} className="ack">
                <input type="radio" name="bucket" checked={bucketId === b.id} onChange={() => setBucketId(b.id)} />
                <span>{b.name} <span className="muted tiny">· {b.openCount} pick{b.openCount === 1 ? '' : 's'}</span></span>
              </label>
            ))}
            {buckets.length < 5 && (
              <label className="ack">
                <input type="radio" name="bucket" checked={bucketId === NEW} onChange={() => setBucketId(NEW)} />
                <span>New bucket</span>
              </label>
            )}
            {bucketId === NEW && (
              <input className="input" maxLength={40} required placeholder="e.g. Banks I like, Gold hedge" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New bucket name" />
            )}
          </fieldset>

          <p className="muted tiny" style={{ margin: 0 }}>
            Pretend only: no money or quantity. It locks in at <strong>{lockInText()}</strong> (or the next trading day’s, if the market is shut), and every pick in a bucket counts equally.
          </p>
          <Message msg={msg} />
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={closePick}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add to bucket'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
