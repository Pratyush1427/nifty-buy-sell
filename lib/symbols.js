import fs from 'fs';
import path from 'path';
import { isGold, isUs } from './kinds';

/**
 * Normalise user input to a Yahoo ticker: "reliance" -> "RELIANCE.NS".
 * Left alone: symbols with an exchange suffix (.NS, .BO), indices (^NSEI),
 * futures and FX (GC=F, USDINR=X), mutual funds as MF:<AMFI scheme code>, US stocks
 * as US:<ticker> and gold as GOLD:24K (see lib/kinds.js).
 * Returns null for anything that can't be a ticker.
 */
export function normalizeSymbol(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!s || s === 'NAN') return null;
  // Mutual funds: AMFI scheme code, e.g. MF:122639.
  if (/^MF:\d{3,7}$/.test(s)) return s;
  if (isUs(s) || isGold(s)) return s;
  if (!/^[\^A-Z0-9&\-.=]+$/.test(s)) return null;
  if (s.startsWith('^') || s.includes('=') || /\.(NS|BO)$/.test(s)) return s;
  return `${s}.NS`;
}

const csvCache = new Map();

/** Read a one-column `symbol` CSV from data/. Re-read if the file changes. */
export function readSymbolCsv(file) {
  const full = path.join(process.cwd(), 'data', file);
  try {
    const { mtimeMs } = fs.statSync(full);
    const hit = csvCache.get(full);
    if (hit && hit.mtimeMs === mtimeMs) return hit.symbols;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/).slice(1);
    const symbols = [...new Set(lines.map(normalizeSymbol).filter(Boolean))];
    csvCache.set(full, { mtimeMs, symbols });
    return symbols;
  } catch {
    return [];
  }
}
