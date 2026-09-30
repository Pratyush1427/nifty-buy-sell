import {
  deleteHolding,
  deleteHoldingsBySymbol,
  getHolding,
  insertHoldings,
  listHoldings,
  parseHoldingsCsv,
  updateHolding,
  validateHolding,
} from '../../lib/holdings';
import { fundCode, getFundQuotes } from '../../lib/funds';
import { getQuotes } from '../../lib/market';
import { scoreInBackground } from '../../lib/mlScore';
import { normalizeSymbol } from '../../lib/symbols';

const MAX_IMPORT_ROWS = 1000;
const NOT_FOUND = /not found/i;

/**
 * GET                                  list lots (?format=csv to download)
 * POST { symbol, shares, avg_price }   add one lot
 * POST { holdings: [...] } | { csv }   bulk import (all-or-nothing)
 * PUT  { id, ...fields }               edit a lot
 * DELETE ?id=  |  ?symbol=             remove a lot / every lot of a symbol
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return list(req, res);
    if (req.method === 'POST') return await create(req, res);
    if (req.method === 'PUT') return await update(req, res);
    if (req.method === 'DELETE') return remove(req, res);
    res.setHeader('Allow', 'GET,POST,PUT,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Confirm symbols exist before saving, so a typo doesn't become a holding
 * that never gets a price. If the feed itself is down we still save, and
 * say the symbols couldn't be checked.
 */
async function checkSymbols(symbols) {
  const unique = [...new Set(symbols)];
  const funds = unique.filter(fundCode);
  const quotes = {
    ...(await getQuotes(unique.filter((s) => !fundCode(s)))),
    ...Object.fromEntries(Object.entries(await getFundQuotes(funds.map(fundCode))).map(([k, v]) => [k, v.error
      ? { error: /No fund/.test(v.error) ? 'not found' : v.error }
      : { data: v }])),
  };
  const unknown = [];
  const unchecked = [];
  for (const s of unique) {
    const q = quotes[s];
    if (q?.data) continue;
    if (NOT_FOUND.test(q?.error || '')) unknown.push(s);
    else unchecked.push(s);
  }
  return { unknown, unchecked };
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function list(req, res) {
  const rows = listHoldings();
  if (req.query.format !== 'csv') return res.status(200).json(rows);

  const lines = ['symbol,shares,avg_price,added_on', ...rows.map((r) =>
    [r.symbol, r.shares, r.avg_price, (r.created_at || '').slice(0, 10)].map(csvCell).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="holdings-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.status(200).send(`${lines.join('\n')}\n`);
}

async function create(req, res) {
  const body = req.body || {};
  const bulk = Array.isArray(body.holdings) || typeof body.csv === 'string';

  let rows = [];
  let errors = [];
  if (typeof body.csv === 'string') ({ rows, errors } = parseHoldingsCsv(body.csv));
  else if (bulk) {
    body.holdings.forEach((h, i) => {
      const { holding, error } = validateHolding(h);
      if (error) errors.push(`Row ${i + 1}: ${error}`);
      else rows.push(holding);
    });
  } else {
    const { holding, error } = validateHolding(body);
    if (error) return res.status(400).json({ error });
    rows = [holding];
  }

  if (rows.length > MAX_IMPORT_ROWS) errors.push(`At most ${MAX_IMPORT_ROWS} rows per import`);
  if (bulk && rows.length === 0 && errors.length === 0) errors.push('No rows found');

  const { unknown, unchecked } = await checkSymbols(rows.map((r) => r.symbol));
  if (unknown.length) {
    errors.push(`Unknown symbol${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Check the ticker, or use .BO for BSE-only stocks.`);
  }

  // Reject the whole batch on any bad row so a partial import can't
  // silently leave the portfolio half-updated.
  if (errors.length) {
    return bulk
      ? res.status(400).json({ error: 'Import rejected', details: errors })
      : res.status(400).json({ error: errors[0] });
  }

  const inserted = insertHoldings(rows);
  scoreInBackground(rows.map((r) => r.symbol));
  const warning = unchecked.length
    ? `Saved, but couldn't verify ${unchecked.join(', ')} because the market feed is unavailable.`
    : null;
  if (bulk) return res.status(201).json({ imported: inserted.length, holdings: inserted, warning });
  return res.status(201).json({ ...inserted[0], warning });
}

async function update(req, res) {
  const { id, ...changes } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });
  const row = getHolding(id);
  if (!row) return res.status(404).json({ error: 'Holding not found' });

  const { holding, error } = validateHolding({ ...row, ...changes });
  if (error) return res.status(400).json({ error });
  if (holding.symbol !== row.symbol) {
    const { unknown } = await checkSymbols([holding.symbol]);
    if (unknown.length) return res.status(400).json({ error: `Unknown symbol: ${holding.symbol}` });
  }
  return res.status(200).json(updateHolding(id, holding));
}

function remove(req, res) {
  const id = String(req.query.id || req.body?.id || '').trim();
  const symbol = normalizeSymbol(req.query.symbol || req.body?.symbol);

  if (id) {
    const row = getHolding(id);
    if (!row || !deleteHolding(id)) return res.status(404).json({ error: 'Holding not found' });
    return res.status(200).json({ deleted: [row] });
  }
  if (symbol) {
    const rows = listHoldings().filter((r) => r.symbol === symbol);
    if (!rows.length) return res.status(404).json({ error: 'No holdings for that symbol' });
    deleteHoldingsBySymbol(symbol);
    // Returned so the client can offer undo by re-posting them.
    return res.status(200).json({ deleted: rows });
  }
  return res.status(400).json({ error: 'id or symbol is required' });
}
