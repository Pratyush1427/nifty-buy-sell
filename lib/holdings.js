import crypto from 'crypto';
import db from './db';
import { normalizeSymbol } from './symbols';

const HEADER_ALIASES = {
  symbol: ['symbol', 'ticker', 'stock', 'instrument', 'scrip', 'stock symbol', 'trading symbol'],
  shares: ['shares', 'qty', 'quantity', 'units', 'qty.'],
  avg_price: ['avg_price', 'avg price', 'average price', 'avg. price', 'avg cost', 'average cost', 'buy price', 'price'],
};

/** Validate and normalise one holding. Returns { holding } or { error }. */
export function validateHolding(input) {
  const symbol = normalizeSymbol(input?.symbol);
  const shares = Number(input?.shares);
  const avgPrice = Number(input?.avg_price);
  if (!symbol) return { error: 'symbol is missing or invalid' };
  if (!Number.isFinite(shares) || shares <= 0) return { error: `${symbol}: shares must be a positive number` };
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) return { error: `${symbol}: avg_price must be a positive number` };
  return { holding: { symbol, shares, avg_price: avgPrice } };
}

function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const toNumber = (v) => Number(String(v ?? '').replace(/[₹,\s]/g, ''));

/**
 * Parse CSV with or without a header. With a header, columns are matched by
 * name (so broker exports with extra columns work); without one, the first
 * three columns are taken as symbol, shares, avg_price.
 */
export function parseHoldingsCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], errors: ['CSV is empty'] };

  const first = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const col = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = first.findIndex((c) => aliases.includes(c));
    if (idx >= 0) col[field] = idx;
  }
  const hasHeader = col.symbol !== undefined;
  if (hasHeader && (col.shares === undefined || col.avg_price === undefined)) {
    return { rows: [], errors: ['Header needs symbol, shares (or qty) and avg_price (or average price) columns'] };
  }
  const idx = hasHeader ? col : { symbol: 0, shares: 1, avg_price: 2 };

  const rows = [];
  const errors = [];
  lines.slice(hasHeader ? 1 : 0).forEach((line, i) => {
    const cells = splitCsvLine(line);
    const lineNo = i + (hasHeader ? 2 : 1);
    const { holding, error } = validateHolding({
      symbol: cells[idx.symbol],
      shares: toNumber(cells[idx.shares]),
      avg_price: toNumber(cells[idx.avg_price]),
    });
    if (error) errors.push(`Line ${lineNo}: ${error}`);
    else rows.push(holding);
  });
  return { rows, errors };
}

const insertStmt = db.prepare('INSERT INTO holdings (id, symbol, shares, avg_price) VALUES (?, ?, ?, ?)');

export const insertHoldings = db.transaction((rows) =>
  rows.map((row) => {
    const id = crypto.randomUUID();
    insertStmt.run(id, row.symbol, row.shares, row.avg_price);
    return { id, ...row };
  }));

export function listHoldings() {
  return db.prepare('SELECT * FROM holdings ORDER BY created_at DESC, rowid DESC').all();
}

export function getHolding(id) {
  return db.prepare('SELECT * FROM holdings WHERE id = ?').get(id);
}

export function updateHolding(id, fields) {
  db.prepare('UPDATE holdings SET symbol = ?, shares = ?, avg_price = ? WHERE id = ?')
    .run(fields.symbol, fields.shares, fields.avg_price, id);
  return getHolding(id);
}

export function deleteHolding(id) {
  return db.prepare('DELETE FROM holdings WHERE id = ?').run(id).changes > 0;
}

export function deleteHoldingsBySymbol(symbol) {
  return db.prepare('DELETE FROM holdings WHERE symbol = ?').run(symbol).changes;
}
