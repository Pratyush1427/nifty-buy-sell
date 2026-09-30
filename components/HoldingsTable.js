import Link from 'next/link';
import { Fragment, useState } from 'react';
import { api, hrefFor, postJson, useApp } from '../lib/client';
import { displaySymbol, money, percent, priceOf, qty, signedMoney, tone } from '../lib/format';
import { SignalPill } from './ui';

/**
 * Holdings table, one row per instrument (purchases combined), with the
 * columns and words brokers use. kind="stocks" covers stocks and ETFs;
 * kind="funds" covers mutual funds. "Edit" reveals individual purchases.
 */
export default function HoldingsTable({ positions, fx, kind = 'stocks' }) {
  const { loadLots, showToast } = useApp();
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const funds = kind === 'funds';

  const remove = async (query, label) => {
    try {
      const { deleted } = await api(`/api/portfolio?${query}`, { method: 'DELETE' });
      await loadLots();
      showToast(`Removed ${label}.`, {
        label: 'Undo',
        run: async () => {
          await postJson('/api/portfolio', { holdings: deleted.map(({ symbol, shares, avg_price: p }) => ({ symbol, shares, avg_price: p })) });
          await loadLots();
          showToast(`Restored ${label}.`);
        },
      });
    } catch (error) {
      showToast(`Couldn't remove: ${error.message}`);
    }
  };

  const saveEdit = async () => {
    try {
      await postJson('/api/portfolio', editing, 'PUT');
      setEditing(null);
      await loadLots();
      showToast('Purchase updated.');
    } catch (error) {
      setEditing({ ...editing, error: error.message });
    }
  };

  const cols = 9; // both variants have nine columns
  return (
    <div className="table-scroll">
      <table className="table holdings">
        <thead>
          <tr>
            <th>{funds ? 'Fund' : 'Company'}</th>
            <th className="num">{funds ? 'Units' : 'Shares'}</th>
            <th className="num">{funds ? 'Avg. NAV' : 'Avg. price'}</th>
            <th className="num">{funds ? 'NAV' : 'LTP'}</th>
            {funds && <th className="num">Invested</th>}
            <th className="num">Current value</th>
            <th className="num">Returns</th>
            <th className="num">1D returns</th>
            {!funds && <th>Signal</th>}
            <th aria-label="Edit" />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const name = p.name || displaySymbol(p.symbol);
            return (
              <Fragment key={p.symbol}>
                <tr>
                  <td className="holding-cell">
                    <Link className="link name-primary" href={hrefFor(p.symbol)}>{name}</Link>
                    <div className="muted tiny">
                      {funds
                        ? [p.fund?.category, p.fund?.assetClass].filter(Boolean).join(' · ') || 'Mutual fund'
                        : <>{displaySymbol(p.symbol).replace(/\.BO$/, '')} · {p.symbol.endsWith('.BO') ? 'BSE' : 'NSE'}{p.assetClass === 'metals' && ' · ETF'}</>}
                    </div>
                  </td>
                  <td className="num">{qty(Number(p.qty.toFixed(3)))}</td>
                  <td className="num">{priceOf(p.avgCost, p)}</td>
                  <td className="num" title={funds && p.fund?.asOf ? `NAV on ${p.fund.asOf}` : undefined}>
                    {priceOf(p.price, p)}
                    {p.stale && <span className="stale-tag" title="Last saved price">stale</span>}
                  </td>
                  {funds && <td className="num">{money(p.invested, { whole: true })}</td>}
                  <td className="num strong">{money(p.value ?? p.invested, { whole: true })}</td>
                  <td className={`num ${tone(p.pnl)}`}>
                    {signedMoney(p.pnl, { whole: true })}
                    <div className="tiny">{percent(p.pnlPct)}</div>
                  </td>
                  <td className={`num ${tone(p.dayChange)}`}>
                    {signedMoney(p.dayChange, { whole: true })}
                    <div className="tiny">{percent(p.dayChangePct)}</div>
                  </td>
                  {!funds && <td><SignalPill signal={p.signal} title={p.reason} /></td>}
                  <td className="actions">
                    <button type="button" className="btn ghost small" onClick={() => { setExpanded(expanded === p.symbol ? null : p.symbol); setEditing(null); }} aria-expanded={expanded === p.symbol}>
                      Edit {expanded === p.symbol ? '▴' : '▾'}
                    </button>
                  </td>
                </tr>
                {expanded === p.symbol && (
                  <tr className="lots-row">
                    <td colSpan={cols}>
                      <div className="reason">
                        {p.lots.length > 1 ? `${p.lots.length} purchases, combined above at their average price.` : 'One purchase.'}
                        {p.currency !== 'INR' && ` Priced in ${p.currency}; totals converted at ₹${fx[p.currency]?.toFixed(2) ?? '?'}.`}
                      </div>
                      <div className="lots">
                        {p.lots.map((lot) => (editing?.id === lot.id ? (
                          <div key={lot.id} className="lot editing">
                            <input className="input tiny-input" type="number" step="any" min="0" aria-label={funds ? 'Units' : 'Shares'} value={editing.shares}
                              onChange={(e) => setEditing({ ...editing, shares: e.target.value, error: null })} />
                            <span>@</span>
                            <input className="input tiny-input" type="number" step="any" min="0" aria-label={funds ? 'Average NAV' : 'Average price'} value={editing.avg_price}
                              onChange={(e) => setEditing({ ...editing, avg_price: e.target.value, error: null })}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }} />
                            <button type="button" className="btn primary small" onClick={saveEdit}>Save</button>
                            <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Cancel</button>
                            {editing.error && <span className="down tiny">{editing.error}</span>}
                          </div>
                        ) : (
                          <div key={lot.id} className="lot">
                            <span>{qty(lot.shares)} {funds ? 'units' : 'shares'} @ {priceOf(lot.avg_price, p)}</span>
                            <span className="muted tiny">added {lot.created_at ? new Date(`${lot.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-IN') : ''}</span>
                            <button type="button" className="btn ghost small" onClick={() => setEditing({ id: lot.id, shares: lot.shares, avg_price: lot.avg_price })}>Change</button>
                            <button type="button" className="btn danger small" onClick={() => remove(`id=${encodeURIComponent(lot.id)}`, `${qty(lot.shares)} ${funds ? 'units of' : '×'} ${name}`)}>Remove</button>
                          </div>
                        )))}
                        {p.lots.length > 1 && (
                          <button type="button" className="btn danger ghost small" onClick={() => remove(`symbol=${encodeURIComponent(p.symbol)}`, `all of ${name}`)}>Remove all</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Subtotal line under a holdings table, in broker terms. */
export function HoldingsTotals({ positions }) {
  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const current = positions.reduce((s, p) => s + (p.value ?? p.invested), 0);
  const day = positions.reduce((s, p) => s + (p.dayChange ?? 0), 0);
  const ret = current - invested;
  return (
    <div className="holdings-totals">
      <span>Invested <b>{money(invested, { whole: true })}</b></span>
      <span>Current <b>{money(current, { whole: true })}</b></span>
      <span>Returns <b className={tone(ret)}>{signedMoney(ret, { whole: true })} ({percent(invested ? (ret / invested) * 100 : null)})</b></span>
      <span>1D <b className={tone(day)}>{signedMoney(day, { whole: true })}</b></span>
    </div>
  );
}
