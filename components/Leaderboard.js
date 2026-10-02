const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`);
const signed = (v, d = 2) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`);
const KIND = { overall: 'Overall', rule: 'Rule', ml: 'ML' };

/**
 * Every model scored on the same historical, out-of-sample test: when its
 * outlook was bullish, how often did the stock beat the Nifty over the next 20
 * sessions, and how did its bullish stocks compare with its bearish ones?
 * Shown as a learning exercise about past data, never as a claim about the future.
 */
export default function Leaderboard({ report, active, onPick }) {
  if (!report?.leaderboard) return null;
  const rows = [...report.leaderboard].sort((a, b) => (b.edge_pct ?? -99) - (a.edge_pct ?? -99));
  const base = rows[0]?.base_hit_rate;
  const maxEdge = Math.max(0.5, ...rows.map((r) => Math.abs(r.edge_pct ?? 0)));

  return (
    <div className="leaderboard">
      <div className="lb-head">
        <span className="label">Historical test · {report.testPeriod}, years each model never saw</span>
        <span className="muted tiny">
          In this period, all stocks beat the Nifty {pct(base)} of the time. A model with an edge would show its bullish stocks above that and its bearish ones below it.
          |t| ≥ 2 is the usual bar for &ldquo;probably not luck&rdquo;. Past results say nothing about the future.
        </span>
      </div>
      <div className="table-scroll">
        <table className="table lb">
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">Bullish beat Nifty</th>
              <th className="num">Bearish beat Nifty</th>
              <th>Bullish minus bearish, per 20 sessions</th>
              <th className="num">t</th>
              <th className="num">Bullish cases</th>
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
      <b>Historical test ({report.testPeriod}):</b>{' '}
      stocks it rated bullish beat the Nifty {pct(r.buy_hit_rate)} of the time vs {pct(r.base_hit_rate)} for all stocks; bearish ones {pct(r.sell_hit_rate)}.
      {r.edge_pct === null
        ? ' Too few bullish and bearish cases on the same days to compare them'
        : ` Its bullish stocks ${good ? 'did better' : 'did worse'} than its bearish ones by ${Math.abs(r.edge_pct).toFixed(2)}% per 20 sessions`}
      {significant ? ' (more than chance would explain).' : ` (t = ${r.edge_tstat ?? '—'}, within what chance would explain).`}
      {' '}Past results say nothing about the future.
    </p>
  );
}
