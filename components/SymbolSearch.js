import { useEffect, useRef, useState } from 'react';

const searchStocks = (q, signal) => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.json());

/**
 * Text input with live suggestions. Defaults to stock search (/api/search);
 * pass `search` for anything else (funds). Typing a full ticker still works
 * if search is unavailable.
 */
export default function SymbolSearch({ value, onChange, onPick, inputProps, search = searchStocks, keepFullSymbol = true }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return undefined; }
    const q = value.trim();
    if (q.length < 2) { setItems([]); return undefined; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      search(q, ctrl.signal)
        .then((list) => { setItems(Array.isArray(list) ? list : []); setActive(0); setOpen(true); })
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // `search` is a stable module-level function in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pick = (item) => {
    skipNext.current = true;
    // Keep the full ticker so NSE vs BSE listings stay unambiguous.
    onChange(keepFullSymbol ? item.symbol : item.name);
    onPick?.(item);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="combo">
      <input
        {...inputProps}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && items.length > 0 && (
        <ul className="combo-list" role="listbox">
          {items.map((item, i) => (
            <li
              key={item.symbol}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combo-name strong-name">{item.name}</span>
              <span className="combo-ex">{item.meta ?? `${String(item.symbol).replace(/\.(NS|BO)$/, '')} · ${item.exchange}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
