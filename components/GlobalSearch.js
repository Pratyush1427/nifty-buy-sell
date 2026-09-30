import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { hrefFor, searchFundsClient } from '../lib/client';
import { displaySymbol } from '../lib/format';

/** One box for everything: stocks (Yahoo) and mutual funds (AMFI), grouped. */
export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState({ stocks: [], funds: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGroups({ stocks: [], funds: [] }); return undefined; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const [stocks, funds] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }).then((r) => r.json()).catch(() => []),
        searchFundsClient(term, ctrl.signal).catch(() => []),
      ]);
      setGroups({
        stocks: (Array.isArray(stocks) ? stocks : []).filter((s) => /\.(NS|BO)$/.test(s.symbol)).slice(0, 5),
        funds: funds.slice(0, 5),
      });
      setActive(0);
      setOpen(true);
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  // "/" focuses search from anywhere, a common convention.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flat = [...groups.stocks.map((s) => ({ ...s, kind: 'stock' })), ...groups.funds.map((f) => ({ ...f, kind: 'fund' }))];
  const go = (item) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(hrefFor(item.symbol));
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || !flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % flat.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + flat.length) % flat.length); }
    if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
  };

  let idx = -1;
  const section = (title, items) => items.length > 0 && (
    <li className="gs-group" role="presentation">
      <div className="gs-title">{title}</div>
      <ul role="group">
        {items.map((item) => {
          idx += 1;
          const i = idx;
          return (
            <li
              key={item.symbol}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); go(item); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combo-name strong-name">{item.name}</span>
              <span className="combo-ex">{item.kind === 'stock' ? `${displaySymbol(item.symbol).replace(/\.BO$/, '')} · ${item.exchange}` : `AMFI ${item.symbol.replace('MF:', '')}`}</span>
            </li>
          );
        })}
      </ul>
    </li>
  );

  return (
    <div className="global-search combo">
      <input
        ref={inputRef}
        className="input"
        type="search"
        placeholder="Search stocks & funds   /"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => flat.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        role="combobox"
        aria-expanded={open}
        aria-label="Search stocks and mutual funds"
        autoComplete="off"
      />
      {open && (
        <ul className="combo-list gs-list" role="listbox">
          {flat.length === 0 ? <li className="gs-empty">No matches</li> : (
            <>
              {section('Stocks', groups.stocks)}
              {section('Mutual funds', groups.funds)}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
