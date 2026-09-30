// Browser-side helpers and app-wide state shared by every page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_STRATEGY, STRATEGIES } from './strategies';

export async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.details = body.details;
    throw err;
  }
  return body;
}

export const postJson = (url, body, method = 'POST') => api(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const isStock = (symbol) => /\.(NS|BO)$/.test(symbol || '');
export const isFund = (symbol) => /^MF:\d+$/.test(symbol || '');
export const fundCodeOf = (symbol) => String(symbol || '').replace(/^MF:/, '');
export const hrefFor = (symbol) => (isFund(symbol) ? `/funds/${fundCodeOf(symbol)}` : `/stocks/${encodeURIComponent(symbol)}`);

export const ASSET_CLASSES = [
  { key: 'stocks', label: 'Stocks', cls: 'series-1' },
  { key: 'funds', label: 'Mutual funds', cls: 'series-2' },
  { key: 'metals', label: 'Gold & silver', cls: 'series-3' },
];

export function assetClassOf(symbol, name = '') {
  if (isFund(symbol)) return 'funds';
  if (/=F$/.test(symbol) || /(GOLD|SILVER)/i.test(`${symbol} ${name}`)) return 'metals';
  return 'stocks';
}

const PREFS_KEY = 'nifty-dashboard-prefs';
function readPrefs() {
  try { return JSON.parse(window.localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function writePrefs(p) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/**
 * App-wide state: preferences (the model that drives signals), toasts, the
 * user's holdings and watchlist, and the "Add investment" dialog.
 */
export function AppProvider({ children }) {
  const [prefs, setPrefs] = useState({ strategy: DEFAULT_STRATEGY });
  const [prefsReady, setPrefsReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [lots, setLots] = useState([]);
  const [lotsLoaded, setLotsLoaded] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [addDialog, setAddDialog] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    const p = readPrefs();
    if (!STRATEGIES.some((s) => s.key === p.strategy)) p.strategy = DEFAULT_STRATEGY;
    setPrefs((cur) => ({ ...cur, ...p }));
    setPrefsReady(true);
  }, []);

  const setPref = useCallback((key, value) => {
    setPrefs((cur) => {
      const next = { ...cur, [key]: value };
      writePrefs(next);
      return next;
    });
  }, []);

  const showToast = useCallback((text, action) => {
    clearTimeout(toastTimer.current);
    setToast({ text, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 8000 : 4000);
  }, []);

  const loadLots = useCallback(async () => {
    try {
      setLots(await api('/api/portfolio'));
    } catch (error) {
      showToast(`Couldn't load holdings: ${error.message}`);
    } finally {
      setLotsLoaded(true);
    }
  }, [showToast]);

  const loadWatchlist = useCallback(async () => {
    try { setWatchlist((await api('/api/watchlist')).map((w) => w.symbol)); } catch { /* non-critical */ }
  }, []);

  useEffect(() => { loadLots(); loadWatchlist(); }, [loadLots, loadWatchlist]);

  const toggleWatch = useCallback(async (symbol, label = symbol) => {
    try {
      if (watchlist.includes(symbol)) {
        await api(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
        showToast(`Removed ${label} from your watchlist.`, {
          label: 'Undo',
          run: async () => { await postJson('/api/watchlist', { symbol }); loadWatchlist(); },
        });
      } else {
        await postJson('/api/watchlist', { symbol });
        showToast(`Added ${label} to your watchlist.`);
      }
      await loadWatchlist();
    } catch (error) {
      showToast(error.message);
    }
  }, [watchlist, showToast, loadWatchlist]);

  const value = useMemo(() => ({
    prefs, prefsReady, setPref,
    toast, setToast, showToast,
    lots, lotsLoaded, loadLots,
    watchlist, loadWatchlist, toggleWatch,
    addDialog, openAdd: (preset = {}) => setAddDialog(preset), closeAdd: () => setAddDialog(null),
  }), [prefs, prefsReady, setPref, toast, showToast, lots, lotsLoaded, loadLots, watchlist, loadWatchlist, toggleWatch, addDialog]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Poll `fn` every `ms` while the tab is visible (and once when it becomes visible). */
export function usePolling(fn, ms, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    fn();
    const tick = () => { if (document.visibilityState === 'visible') fn(); };
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [fn, ms, enabled]);
}

/** Fund search in the shape SymbolSearch expects (no ticker; plan and option as meta). */
export const searchFundsClient = (q, signal) => fetch(`/api/funds/search?q=${encodeURIComponent(q)}`, { signal })
  .then((r) => r.json())
  .then((list) => (Array.isArray(list) ? list : []).map((f) => ({
    symbol: f.symbol, name: f.name, meta: `AMFI ${f.code}`,
  })));
