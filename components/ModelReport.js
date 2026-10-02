import { useState } from 'react';

const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`);
const signedPct = (v, d = 2) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`);

/** Out-of-sample spread by test year: diverging bars around zero. */
function YearBars({ years }) {
  const [hover, setHover] = useState(null);
  const W = 520;
  const H = 130;
  const pad = { top: 10, bottom: 20, left: 8, right: 8 };
  const max = Math.max(0.5, ...years.map((y) => Math.abs(y.spread_pct)));
  const bw = (W - pad.left - pad.right) / years.length;
  const y0 = pad.top + (H - pad.top - pad.bottom) / 2;
  const scale = (H - pad.top - pad.bottom) / 2 / max;
  const hy = hover !== null ? years[hover] : null;

  return (
    <div className="year-bars">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Top minus bottom quintile return by test year">
        <line className="grid" x1={pad.left} x2={W - pad.right} y1={y0} y2={y0} />
        {years.map((y, i) => {
          const h = Math.max(1, Math.abs(y.spread_pct) * scale);
          const x = pad.left + i * bw + 3;
          return (
            <g key={y.year} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={pad.left + i * bw} y={pad.top} width={bw} height={H - pad.top - pad.bottom} fill="transparent" />
              <rect
                className={y.spread_pct >= 0 ? 'ybar pos' : 'ybar neg'}
                x={x}
                width={bw - 6}
                y={y.spread_pct >= 0 ? y0 - h : y0}
                height={h}
                rx="3"
                opacity={hover === null || hover === i ? 1 : 0.5}
              />
              <text className="axis" x={x + (bw - 6) / 2} y={H - 5} textAnchor="middle">{String(y.year).slice(2)}</text>
            </g>
          );
        })}
      </svg>
      <div className="year-bars-caption">
        {hy
          ? <>In <b>{hy.year}</b>: top minus bottom 20% <b>{signedPct(hy.spread_pct)}</b> per 20 sessions · top 20% beat the Nifty {pct(hy.top_hit_rate)} (all stocks {pct(hy.base_hit_rate)}) · AUC {hy.auc.toFixed(3)}</>
          : 'Each bar is one test year, predicted by a model trained only on earlier years. Above the line means the picks it ranked highest beat the ones it ranked lowest. Hover a bar for details.'}
      </div>
    </div>
  );
}

export default function ModelReport({ report, modelKey }) {
  if (!report) {
    return (
      <div className="model-report">
        <div className="msg info">
          No models have been trained yet. Run <code>npm run ml</code> (a few minutes). It downloads 16 years of Nifty 200 prices,
          evaluates every model year by year, trains them, and writes scores that appear here.
        </div>
      </div>
    );
  }
  const m = report.models?.[modelKey];
  if (!m) return null;

  const significant = m.spread_tstat !== null && m.spread_tstat >= 2;
  const beatsBase = m.top_hit_rate > m.base_hit_rate;

  return (
    <div className="model-report">
      <div className={`verdict-line ${significant ? 'ok' : 'warn'}`}>
        {significant
          ? `In this historical test, ${m.label}'s top-ranked stocks did better than its bottom-ranked ones by more than chance would explain (t = ${m.spread_tstat}). That describes the past only and says nothing about the future.`
          : beatsBase
            ? `In this historical test, ${m.label}'s top-ranked stocks beat the Nifty slightly more often than average, but not by more than chance would explain (t = ${m.spread_tstat}).`
            : `In this historical test, ${m.label} did no better than chance.`}
      </div>

      <div className="model-stats">
        <div className="mstat">
          <div className="label">Top 20% beat the Nifty</div>
          <div className="mstat-value">{pct(m.top_hit_rate)}</div>
          <div className="mstat-sub">vs {pct(m.base_hit_rate)} for all stocks · momentum {pct(report.momentum.top_hit_rate)}</div>
        </div>
        <div className="mstat">
          <div className="label">Top minus bottom 20%</div>
          <div className="mstat-value">{signedPct(m.spread_pct)}</div>
          <div className="mstat-sub">per 20 sessions · positive in {pct(m.spread_positive_share, 0)} of {m.periods} periods</div>
        </div>
        <div className="mstat">
          <div className="label">Ranking accuracy (AUC)</div>
          <div className="mstat-value">{m.auc.toFixed(3)}</div>
          <div className="mstat-sub">coin flip 0.500 · momentum {report.momentum.auc.toFixed(3)}</div>
        </div>
      </div>

      <div className="model-grid">
        <div>
          <div className="label">Top-minus-bottom return by test year</div>
          <YearBars years={m.by_year} />
        </div>
        <div>
          <div className="label">What it leans on most</div>
          <ol className="importance">
            {(m.importance || []).slice(0, 6).map((f) => <li key={f.feature}>{f.label}</li>)}
          </ol>
        </div>
      </div>

      <p className="muted tiny model-foot">
        Trained {new Date(report.trainedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} on{' '}
        {report.trainPeriod} ({report.symbols} stocks). Out-of-sample test: {report.testPeriod}. Scores as of {report.asOf}.{' '}
        Caveat: trained on today&rsquo;s index members, which flatters past results (stocks that left the index are missing).
      </p>
    </div>
  );
}
