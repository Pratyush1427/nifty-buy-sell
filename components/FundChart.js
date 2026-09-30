import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../lib/format';

const RANGES = [
  { key: '1Y', years: 1 }, { key: '3Y', years: 3 }, { key: '5Y', years: 5 }, { key: 'Max', years: null },
];
const HEIGHT = 300;
const M = { top: 14, right: 96, bottom: 26, left: 64 };
const START = 10000;

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

/**
 * Growth of ₹10,000 invested at the start of the range, fund vs benchmark.
 * Both lines start at the same value, so one axis compares them honestly.
 */
export default function FundChart({ points, benchLabel, fundLabel = 'This fund' }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState('3Y');
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const available = RANGES.filter((r) => !r.years || (points.length && new Date(points[0].t) <= new Date(Date.now() - r.years * 365.25 * 864e5)));
  const active = available.find((r) => r.key === range) ? range : available.at(-1)?.key;

  const geo = useMemo(() => {
    if (!points?.length || !width) return null;
    const r = RANGES.find((x) => x.key === active);
    const cutoff = r?.years ? new Date(Date.now() - r.years * 365.25 * 864e5).toISOString().slice(0, 10) : '';
    const pts0 = points.filter((p) => p.t >= cutoff);
    if (pts0.length < 2) return null;
    const f0 = pts0[0].nav;
    const firstBench = pts0.find((p) => p.bench > 0)?.bench;
    const pts = pts0.map((p) => ({
      t: p.t,
      fund: (p.nav / f0) * START,
      bench: firstBench && p.bench > 0 ? (p.bench / firstBench) * START : null,
    }));
    const vals = pts.flatMap((p) => [p.fund, p.bench]).filter((v) => v > 0);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    const yMin = lo - pad;
    const yMax = hi + pad;
    const innerW = width - M.left - M.right;
    const innerH = HEIGHT - M.top - M.bottom;
    const x = (i) => M.left + (i / (pts.length - 1)) * innerW;
    const y = (v) => M.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
    const path = (key) => pts.reduce((d, p, i) => (p[key] > 0 ? `${d}${d && pts[i - 1]?.[key] > 0 ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}` : d), '');

    const years = [];
    pts.forEach((p, i) => { if (i === 0 || p.t.slice(0, 4) !== pts[i - 1].t.slice(0, 4)) years.push(i); });
    const months = [];
    pts.forEach((p, i) => { if (i > 0 && p.t.slice(0, 7) !== pts[i - 1].t.slice(0, 7)) months.push(i); });
    const useYears = years.length >= 3;
    const marks = (useYears ? years : months).filter((i) => i > 0);
    const every = Math.ceil(marks.length / Math.max(2, Math.floor(innerW / 70)));
    const xTicks = marks.filter((_, i) => i % every === 0).map((i) => ({ i, label: useYears ? pts[i].t.slice(0, 4) : new Date(pts[i].t).toLocaleDateString('en-IN', { month: 'short' }) }));

    const last = pts.at(-1);
    const labels = [{ key: 'fund', text: fundLabel, y: y(last.fund), cls: 'series-1' }];
    if (last.bench) labels.push({ key: 'bench', text: benchLabel, y: y(last.bench), cls: 'series-2' });
    labels.sort((a, b) => a.y - b.y);
    if (labels.length === 2 && labels[1].y - labels[0].y < 14) labels[1].y = labels[0].y + 14;

    return { pts, x, y, innerW, yTicks: niceTicks(yMin, yMax), xTicks, fundD: path('fund'), benchD: path('bench'), labels };
  }, [points, width, active, benchLabel, fundLabel]);

  const onMove = (e) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    setHover(Math.min(geo.pts.length - 1, Math.max(0, Math.round(((px - M.left) / geo.innerW) * (geo.pts.length - 1)))));
  };
  const hp = geo && hover !== null ? geo.pts[hover] : null;
  const last = geo?.pts.at(-1);

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="legend">
          <span><i className="swatch series-1" />{fundLabel}{last && <b className="legend-val">{money(last.fund, { whole: true })}</b>}</span>
          {last?.bench && <span><i className="swatch series-2" />{benchLabel}<b className="legend-val">{money(last.bench, { whole: true })}</b></span>}
          <span className="muted">Growth of ₹10,000 invested at the start of the period</span>
        </div>
        <div className="seg" role="group" aria-label="Chart range">
          {available.map((r) => (
            <button key={r.key} type="button" className={r.key === active ? 'active' : ''} onClick={() => setRange(r.key)}>{r.key}</button>
          ))}
        </div>
      </div>
      <div ref={wrapRef} className="chart-wrap" style={{ minHeight: HEIGHT }}>
        {!geo && <div className="chart-msg">Not enough history for this range.</div>}
        {geo && (
          <>
            <svg
              viewBox={`0 0 ${width} ${HEIGHT}`}
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Growth of 10,000 rupees over ${active}: ${fundLabel} vs ${benchLabel}`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {geo.yTicks.map((v) => (
                <g key={v}>
                  <line className="grid" x1={M.left} x2={width - M.right} y1={geo.y(v)} y2={geo.y(v)} />
                  <text className="axis" x={M.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end">₹{v.toLocaleString('en-IN')}</text>
                </g>
              ))}
              <line className="ref-line soft" x1={M.left} x2={width - M.right} y1={geo.y(START)} y2={geo.y(START)} />
              {geo.xTicks.map((t) => (
                <text key={t.i} className="axis" x={geo.x(t.i)} y={HEIGHT - 6} textAnchor="middle">{t.label}</text>
              ))}
              {geo.benchD && <path className="line series-2" d={geo.benchD} />}
              <path className="line series-1" d={geo.fundD} />
              {geo.labels.map((l) => (
                <text key={l.key} className={`end-label ${l.cls}`} x={width - M.right + 8} y={l.y} dy="0.32em">{l.text}</text>
              ))}
              {hp && (
                <g className="crosshair">
                  <line x1={geo.x(hover)} x2={geo.x(hover)} y1={M.top} y2={HEIGHT - M.bottom} />
                  {hp.bench && <circle className="dot series-2" cx={geo.x(hover)} cy={geo.y(hp.bench)} r="4" />}
                  <circle className="dot series-1" cx={geo.x(hover)} cy={geo.y(hp.fund)} r="4" />
                </g>
              )}
            </svg>
            {hp && (
              <div className="tooltip" style={{ left: Math.min(Math.max(geo.x(hover), 100), width - 100), top: 4 }}>
                <div className="tt-date">{new Date(hp.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="tt-row"><i className="swatch series-1" />{fundLabel} <b>{money(hp.fund, { whole: true })}</b></div>
                {hp.bench && <div className="tt-row"><i className="swatch series-2" />{benchLabel} <b>{money(hp.bench, { whole: true })}</b></div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
