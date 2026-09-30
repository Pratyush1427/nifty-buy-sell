import { useEffect, useRef, useState } from 'react';
import { api, isFund, postJson, searchFundsClient, useApp } from '../lib/client';
import { displaySymbol, money, qty } from '../lib/format';
import SymbolSearch from './SymbolSearch';
import { Message, Segmented } from './ui';

const TABS = [
  { key: 'stock', label: 'Stock' },
  { key: 'fund', label: 'Mutual fund' },
  { key: 'csv', label: 'Import CSV' },
];
const SAMPLE_CSV = 'symbol,shares,avg_price\nTITAN,5,3425\nMF:122639,120.5,62.40';

/**
 * One place to add anything to the portfolio. Opened from the Portfolio page,
 * or pre-filled from a stock or fund page via openAdd({ kind, symbol, name, price }).
 */
export default function AddInvestment() {
  const { addDialog, closeAdd, loadLots, showToast } = useApp();
  const [kind, setKind] = useState('stock');
  const [symbol, setSymbol] = useState('');
  const [picked, setPicked] = useState(null);
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!addDialog) return;
    const preset = addDialog;
    setKind(preset.kind || (preset.symbol && isFund(preset.symbol) ? 'fund' : 'stock'));
    setSymbol(preset.symbol ? (isFund(preset.symbol) ? preset.name || '' : preset.symbol) : '');
    setPicked(preset.symbol ? { symbol: preset.symbol, name: preset.name } : null);
    setPrice(preset.price ? String(Number(preset.price).toFixed(isFund(preset.symbol) ? 4 : 2)) : '');
    setAmount('');
    setMsg(null);
    setTimeout(() => dialogRef.current?.querySelector(preset.symbol ? 'input[name="amount"]' : 'input')?.focus(), 30);
  }, [addDialog]);

  useEffect(() => {
    if (!addDialog) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeAdd(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addDialog, closeAdd]);

  if (!addDialog) return null;

  const switchKind = (k) => { setKind(k); setSymbol(''); setPicked(null); setPrice(''); setAmount(''); setMsg(null); };

  const pickFund = async (item) => {
    setPicked(item);
    try {
      const q = await api(`/api/funds/quotes?symbols=${encodeURIComponent(item.symbol)}`);
      const f = q[item.symbol];
      if (f?.price && !price) setPrice(f.price.toFixed(4));
      if (f?.asOf) setPicked({ ...item, asOf: f.asOf, nav: f.price });
    } catch { /* NAV prefill is a convenience */ }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (kind === 'csv') {
        const r = await postJson('/api/portfolio', { csv });
        showToast(`Imported ${r.imported} holding${r.imported === 1 ? '' : 's'}.${r.warning ? ` ${r.warning}` : ''}`);
      } else {
        const sym = kind === 'fund' ? picked?.symbol : symbol;
        if (!sym) throw new Error(kind === 'fund' ? 'Pick a fund from the list.' : 'Enter a stock symbol.');
        const saved = await postJson('/api/portfolio', { symbol: sym, shares: amount, avg_price: price });
        showToast(saved.warning || `Added ${qty(saved.shares)} ${kind === 'fund' ? 'units of' : 'shares of'} ${picked?.name || displaySymbol(saved.symbol)}.`);
      }
      await loadLots();
      closeAdd();
    } catch (error) {
      setMsg({ kind: 'error', text: error.message, details: error.details });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMsg({ kind: 'error', text: 'That file is over 2 MB.' }); return; }
    setCsv(await file.text());
    setMsg({ kind: 'info', text: `Loaded ${file.name}. Review the rows, then import.` });
    e.target.value = '';
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeAdd(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" ref={dialogRef}>
        <div className="modal-head">
          <h2 id="add-title">Add investment</h2>
          <button type="button" className="btn ghost small icon" onClick={closeAdd} aria-label="Close">✕</button>
        </div>
        <Segmented options={TABS} value={kind} onChange={switchKind} label="Investment type" />

        <form className="form" onSubmit={submit}>
          {kind === 'stock' && (
            <>
              <label>
                <span>Stock</span>
                <SymbolSearch
                  value={symbol}
                  onChange={(v) => { setSymbol(v); setPicked(null); }}
                  onPick={setPicked}
                  inputProps={{ name: 'symbol', required: true, placeholder: 'Name or ticker, e.g. "tata motors"' }}
                />
              </label>
              {picked?.name && <p className="muted tiny">{picked.name} · {displaySymbol(picked.symbol).replace(/\.BO$/, '')}{picked.exchange ? ` · ${picked.exchange}` : ''}</p>}
              <div className="form-row">
                <label><span>Shares</span>
                  <input className="input" name="amount" type="number" min="0" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label><span>Avg. price (₹)</span>
                  <input className="input" name="price" type="number" min="0" step="any" required value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
              </div>
              <p className="muted tiny">NSE symbols get “.NS” added automatically; use “.BO” for BSE-only stocks.</p>
            </>
          )}

          {kind === 'fund' && (
            <>
              <label>
                <span>Fund</span>
                <SymbolSearch
                  value={symbol}
                  onChange={(v) => { setSymbol(v); setPicked(null); }}
                  onPick={pickFund}
                  search={searchFundsClient}
                  keepFullSymbol={false}
                  inputProps={{ name: 'fund', required: true, placeholder: 'Fund name, e.g. "parag parikh flexi"' }}
                />
              </label>
              {picked && (
                <p className="muted tiny">
                  AMFI code {picked.symbol.replace('MF:', '')}{picked.nav ? ` · latest NAV ${money(picked.nav)} on ${picked.asOf}` : ''}
                </p>
              )}
              <div className="form-row">
                <label><span>Units</span>
                  <input className="input" name="amount" type="number" min="0" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label><span>Avg. NAV (₹)</span>
                  <input className="input" name="price" type="number" min="0" step="any" required value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
              </div>
              <p className="muted tiny">Pick the exact plan you hold: Direct or Regular, Growth or IDCW. Units and avg. NAV are in your broker app&rsquo;s holdings or your CAS statement.</p>
            </>
          )}

          {kind === 'csv' && (
            <>
              <p className="muted small" style={{ margin: 0 }}>
                Columns <code>symbol</code>, <code>shares</code> (or <code>qty</code>/<code>units</code>) and <code>avg_price</code> (or <code>average price</code>), in any order.
                Use <code>MF:&lt;AMFI code&gt;</code> for mutual funds. If any row is invalid, nothing is imported.
              </p>
              <textarea className="input mono" rows={7} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="CSV contents" />
              <label className="btn ghost small file-btn">
                Choose file…
                <input type="file" accept=".csv,text/csv" onChange={onFile} hidden />
              </label>
            </>
          )}

          <Message msg={msg} />
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={closeAdd}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : kind === 'csv' ? 'Import' : 'Add to portfolio'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
