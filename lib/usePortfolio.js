import { useCallback, useMemo, useState } from 'react';
import { buildPositions, summarise } from './analytics';
import { ASSET_CLASSES, api, assetClassOf, isFund, useApp, usePolling } from './client';

const OPEN_MS = 60 * 1000;
const CLOSED_MS = 5 * 60 * 1000;

/**
 * Values every holding: live quotes and every model's signals for stocks
 * (via /api/market), latest NAVs for mutual funds (via /api/funds/quotes).
 */
export function usePortfolio() {
  const { lots, lotsLoaded, prefs } = useApp();
  const [market, setMarket] = useState(null);
  const [funds, setFunds] = useState({});
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const symbols = useMemo(() => [...new Set(lots.map((l) => l.symbol))].sort(), [lots]);
  const stockKey = symbols.filter((s) => !isFund(s)).join(',');
  const fundKey = symbols.filter(isFund).join(',');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, f] = await Promise.all([
        api(`/api/market?universe=held&symbols=${encodeURIComponent(stockKey)}`),
        fundKey ? api(`/api/funds/quotes?symbols=${encodeURIComponent(fundKey)}`) : Promise.resolve({}),
      ]);
      setMarket(m);
      setFunds(f);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [stockKey, fundKey]);

  const anyOpen = (market?.benchmarks || []).some((b) => b.marketState === 'REGULAR');
  usePolling(load, anyOpen ? OPEN_MS : CLOSED_MS, lotsLoaded);

  const strategy = prefs.strategy;
  const stockMap = useMemo(() => {
    const map = {};
    for (const s of market?.stocks || []) map[s.symbol] = s.signals ? { ...s, ...s.signals[strategy] } : s;
    for (const b of market?.benchmarks || []) if (!map[b.symbol] && b.price) map[b.symbol] = { ...b, name: b.name || b.label };
    for (const [sym, f] of Object.entries(funds)) if (!f.error) map[sym] = f;
    return map;
  }, [market, funds, strategy]);

  const fx = market?.fx || { INR: 1 };
  const positions = useMemo(() => buildPositions(lots, stockMap, fx).map((p) => {
    const assetClass = assetClassOf(p.symbol, p.name);
    return assetClass === 'funds'
      ? { ...p, assetClass, signal: null, fund: stockMap[p.symbol] || null, reason: stockMap[p.symbol]?.error || '' }
      : { ...p, assetClass };
  }), [lots, stockMap, fx]);
  const summary = useMemo(() => summarise(positions), [positions]);

  const allocation = useMemo(() => {
    const total = summary.value || 0;
    return ASSET_CLASSES.map((c) => {
      const items = positions.filter((p) => p.assetClass === c.key);
      const value = items.reduce((s, p) => s + (p.value ?? p.invested), 0);
      return { ...c, count: items.length, value, pct: total ? (value / total) * 100 : 0 };
    }).filter((c) => c.count > 0);
  }, [positions, summary.value]);

  const fundErrors = Object.values(funds).filter((f) => f.error);
  const navDate = Object.values(funds).map((f) => f.asOf).filter(Boolean).sort().at(-1) || null;

  return { market, stockMap, positions, summary, allocation, refreshing, error, reload: load, fundErrors, navDate, fx };
}
