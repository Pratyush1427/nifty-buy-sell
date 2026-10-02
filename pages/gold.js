import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SkeletonRows, Tile } from '../components/ui';
import { api, useApp } from '../lib/client';
import { money, percent, tone } from '../lib/format';
import { GOLD } from '../lib/kinds';

const fmtDay = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });

/** Gold: estimated Indian price per gram, how it's worked out, and the last year. */
export default function GoldPage() {
  const { openPick, pickedIn } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api('/api/gold').then(setData).catch((e) => setError(e.message)); }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Gold" />
        <div className="panel empty">Couldn’t load gold prices: {error}</div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Gold" />
        <SkeletonRows rows={6} />
      </>
    );
  }

  const duty = Math.round(data.importDuty * 100);
  const gst = Math.round(data.gst * 100);
  return (
    <>
      <PageHeader
        title="Gold"
        subtitle={<span className="muted">Estimated Indian price, per gram · as of the {fmtDay(data.asOf)} close</span>}
        actions={<button type="button" className="btn primary" onClick={() => openPick({ symbol: GOLD.symbol, name: GOLD.name })}>+ Add gold to a bucket</button>}
      />

      {pickedIn.has(GOLD.symbol) && (
        <p className="in-buckets small">In your bucket{pickedIn.get(GOLD.symbol).length > 1 ? 's' : ''}: <b>{pickedIn.get(GOLD.symbol).join(', ')}</b></p>
      )}

      <section className="tiles">
        <Tile label="24K · per gram" value={money(data.perGram24k, { whole: true })} tone="" sub={`${percent(data.dayChangePct)} on the day`} subTone={tone(data.dayChangePct)} />
        <Tile label="24K · per 10 g" value={money(data.perGram24k * 10, { whole: true })} sub="the usual quoted rate" subTone="muted" />
        <Tile label="22K · per gram" value={money(data.perGram22k, { whole: true })} sub="91.6% pure (jewellery)" subTone="muted" />
        <Tile label={`24K incl. ${gst}% GST`} value={money(data.perGram24kWithGst, { whole: true })} sub="roughly what buying costs" subTone="muted" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Last year · 24K per gram</h2>
          <div className="chips">
            {Object.entries(data.change).map(([k, v]) => (
              <span key={k} className={`chip ${v > 0 ? 'good' : ''}`}>{k} <span className={tone(v)}>{percent(v)}</span></span>
            ))}
          </div>
        </div>
        <GoldChart series={data.history} />
      </section>

      <section className="panel explainer">
        <h2>How this price is worked out</h2>
        <table className="table calc">
          <tbody>
            <tr><td>International gold (COMEX), converted to ₹ at the day’s USD/INR rate</td><td className="num">{money(data.intlPerGram)}</td></tr>
            <tr><td>+ {duty}% import duty (customs duty and agriculture cess)</td><td className="num">{money(data.perGram24k - data.intlPerGram)}</td></tr>
            <tr><td><b>Estimated Indian price, 24K, per gram</b></td><td className="num"><b>{money(data.perGram24k)}</b></td></tr>
            <tr><td>+ {gst}% GST when you buy</td><td className="num">{money(data.perGram24kWithGst - data.perGram24k)}</td></tr>
          </tbody>
        </table>
        <p className="muted small">
          This is an estimate from public data: there’s no free official feed for Indian or digital gold rates. Digital gold
          apps and jewellers add their own spreads (often 2–3% between buying and selling), and the import duty can change
          in a Union Budget. To track what you actually paid, add gold to a bucket with your own price per gram.
        </p>
      </section>
    </>
  );
}

/** Simple line chart of daily prices, with the latest value and the year's range labelled. */
function GoldChart({ series }) {
  const W = 900;
  const H = 260;
  const pad = { l: 64, r: 16, t: 12, b: 28 };
  const { path, min, max, ticks, last } = useMemo(() => {
    const vals = series.map((p) => p.c);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const x = (i) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
    const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(' ');
    const months = [];
    let prev = '';
    series.forEach((p, i) => {
      const m = p.t.slice(0, 7);
      if (m !== prev && i > 5) months.push({ x: x(i), label: fmtDay(p.t, { month: 'short' }) });
      prev = m;
    });
    return { path: d, min: { v: lo, y: y(lo) }, max: { v: hi, y: y(hi) }, ticks: months.filter((_, i) => i % 2 === 0), last: { x: x(series.length - 1), y: y(vals.at(-1)) } };
  }, [series]);

  return (
    <svg className="gold-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`24K gold per gram over the last year, from ${money(series[0].c, { whole: true })} to ${money(series.at(-1).c, { whole: true })}`}>
      <line x1={pad.l} x2={W - pad.r} y1={max.y} y2={max.y} className="grid-line" />
      <line x1={pad.l} x2={W - pad.r} y1={min.y} y2={min.y} className="grid-line" />
      <text x={pad.l - 8} y={max.y + 4} textAnchor="end" className="axis">{money(max.v, { whole: true })}</text>
      <text x={pad.l - 8} y={min.y + 4} textAnchor="end" className="axis">{money(min.v, { whole: true })}</text>
      {ticks.map((t) => <text key={t.x} x={t.x} y={H - 8} textAnchor="middle" className="axis">{t.label}</text>)}
      <path d={path} fill="none" stroke="#c99a2e" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="4" fill="#c99a2e" />
    </svg>
  );
}
