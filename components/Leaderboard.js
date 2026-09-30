const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`);
const signed = (v, d = 2) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`);
const KIND = { overall: 'Overall', rule: 'Rule', ml: 'ML' };

/**
 * Every decision model scored on the same out-of-sample test: when it said
 * BUY, how often did the stock beat the Nifty over the next 20 sessions, and
 * how much better did its BUYs do than its SELLs?
 */
export default function Leaderboard({ report, active, onPick }) {
  if (!report?.leaderboard) return null;
  const rows = [...report.leaderboard].sort((a, b) => (b.edge_pct ?? -99) - (a.edge_pct ?? -99));
  const base = rows[0]?.base_hit_rate;
  const maxEdge = Math.max(0.5, ...rows.map((r) => Math.abs(r.edge_pct ?? 0)));

  return (
    <div className="leaderboard">
      <div className="lb-head">
        <span className="label">Track record · out of sample {report.testPeriod}</span>
        <span className="muted tiny">
          All stocks beat the Nifty {pct(base)} of the time. A useful model&rsquo;s BUYs beat that and its SELLs trail it. |t| ≥ 2 is the usual bar for &ldquo;probably not luck&rdquo;.
        </span>
      </div>
      <div className="table-scroll">
        <table className="table lb">
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">BUYs beat Nifty</th>
              <th className="num">SELLs beat Nifty</th>
              <th>BUY minus SELL, per 20 sessions</th>
              <th className="num">t</th>
              <th className="num">BUY calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const w = r.edge_pct === null ? 0 : (Math.abs(r.edge_pct) / maxEdge) * 50;
              const significant = r.edge_tstat !== null && Math.abs(r.edge_tstat) >= 2;
              return (
                <tr key={r.key} className={`${active === r.key ? 'selected' : ''} clickable`} onClick={() => onPick(r.key)}>
                  <td>
                    <button type="button" className="link sym" onClick={(e) => { e.stopPropagation(); onPick(r.key); }}>{r.label}</button>
                    <span className={`held-tag kind-${r.kind}`}>{KIND[r.kind]}</span>
                  </td>
                  <td className={`num ${r.buy_hit_rate > base ? 'up' : r.buy_hit_rate < base ? 'down' : ''}`}>{pct(r.buy_hit_rate)}</td>
                  <td className={`num ${r.sell_hit_rate < base ? 'up' : r.sell_hit_rate > base ? 'down' : ''}`}>{pct(r.sell_hit_rate)}</td>
                  <td>
                    <div className="edge">
                      <div className="edge-track">
                        <span className="edge-zero" />
                        {r.edge_pct !== null && (
                          <span
                            className={`edge-bar ${r.edge_pct >= 0 ? 'pos' : 'neg'}`}
                            style={r.edge_pct >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                          />
                        )}
                      </div>
                      <span className="edge-val">{signed(r.edge_pct)}</span>
                    </div>
                  </td>
                  <td className={`num ${significant ? '' : 'muted'}`}>{r.edge_tstat ?? '—'}</td>
                  <td className="num muted">{r.buy_signals.toLocaleString('en-IN')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One-line track record for the selected model. */
export function TrackRecord({ report, strategyKey }) {
  const r = report?.leaderboard?.find((x) => x.key === strategyKey);
  if (!r) return null;
  const good = r.edge_pct > 0;
  const significant = r.edge_tstat !== null && Math.abs(r.edge_tstat) >= 2;
  return (
    <p className="track-record">
      <b>Track record ({report.testPeriod}):</b>{' '}
      BUY calls beat the Nifty {pct(r.buy_hit_rate)} of the time vs {pct(r.base_hit_rate)} for all stocks; SELL calls {pct(r.sell_hit_rate)}.
      {r.edge_pct === null
        ? ' Too few BUY and SELL calls on the same days to compare them'
        : ` BUYs ${good ? 'out' : 'under'}performed SELLs by ${Math.abs(r.edge_pct).toFixed(2)}% per 20 sessions`}
      {significant ? ' (statistically significant).' : ` (t = ${r.edge_tstat ?? '—'}, not statistically significant).`}
    </p>
  );
}
