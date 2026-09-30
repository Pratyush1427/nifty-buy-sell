// Client-safe portfolio maths. No Node imports here - this runs in the browser.

/**
 * Collapse individual lots into one position per symbol with a weighted
 * average cost, then join live market data.
 *
 * avg_price and price are in the instrument's own currency; invested, value,
 * P/L and day change are converted to ₹ with `fx` so everything can be summed.
 */
export function buildPositions(lots, stockMap, fx = { INR: 1 }) {
  const bySymbol = new Map();
  for (const lot of lots) {
    const p = bySymbol.get(lot.symbol) || { symbol: lot.symbol, qty: 0, invested: 0, lots: [] };
    p.qty += Number(lot.shares);
    p.invested += Number(lot.shares) * Number(lot.avg_price);
    p.lots.push(lot);
    bySymbol.set(lot.symbol, p);
  }

  return [...bySymbol.values()].map((p) => {
    const stock = stockMap[p.symbol];
    const currency = stock?.currency || 'INR';
    const rate = fx[currency] ?? null;
    const avgCost = p.qty ? p.invested / p.qty : 0;
    const price = stock?.price > 0 && rate ? stock.price : null;
    const invested = rate ? p.invested * rate : p.invested;
    const value = price !== null ? p.qty * price * rate : null;
    const pnl = value !== null ? value - invested : null;
    const dayChange = price !== null && Number.isFinite(stock?.change) ? p.qty * stock.change * rate : null;
    return {
      ...p,
      invested,
      currency,
      type: stock?.type || null,
      name: stock?.name || p.symbol,
      avgCost,
      price,
      value,
      pnl,
      pnlPct: pnl !== null && invested ? (pnl / invested) * 100 : null,
      dayChange,
      dayChangePct: stock?.changePct ?? null,
      signal: stock?.signal || (stock ? 'NO_DATA' : 'LOADING'),
      reason: stock?.reason || stock?.error || 'Waiting for market data…',
      stale: Boolean(stock?.stale),
    };
  });
}

export function summarise(positions) {
  const priced = positions.filter((p) => p.value !== null);
  const unpriced = positions.filter((p) => p.value === null);

  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const pricedInvested = priced.reduce((s, p) => s + p.invested, 0);
  const pricedValue = priced.reduce((s, p) => s + p.value, 0);
  // Unpriced positions are carried at cost so totals stay meaningful, and the
  // UI says how many were carried that way.
  const value = pricedValue + unpriced.reduce((s, p) => s + p.invested, 0);
  const pnl = pricedValue - pricedInvested;

  const withDay = priced.filter((p) => p.dayChange !== null);
  const dayPnl = withDay.reduce((s, p) => s + p.dayChange, 0);
  const prevValue = withDay.reduce((s, p) => s + p.value - p.dayChange, 0);

  const withWeights = positions
    .map((p) => ({ ...p, weight: value ? ((p.value ?? p.invested) / value) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);

  const signals = { BUY: 0, HOLD: 0, SELL: 0, OTHER: 0 };
  for (const p of positions) {
    if (p.signal in signals) signals[p.signal] += 1;
    else signals.OTHER += 1;
  }

  const ranked = priced.filter((p) => p.pnlPct !== null).sort((a, b) => b.pnlPct - a.pnlPct);

  return {
    invested,
    value,
    pnl,
    pnlPct: pricedInvested ? (pnl / pricedInvested) * 100 : null,
    dayPnl: withDay.length ? dayPnl : null,
    dayPnlPct: prevValue ? (dayPnl / prevValue) * 100 : null,
    positions: withWeights,
    unpricedCount: unpriced.length,
    signals,
    best: ranked[0] || null,
    worst: ranked.length > 1 ? ranked.at(-1) : null,
    topWeight: withWeights[0]?.weight ?? 0,
  };
}
