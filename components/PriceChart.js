import { useEffect, useMemo, useRef, useState } from 'react';
import { displaySymbol, priceOf } from '../lib/format';

const RANGES = [
  { key: '3M', sessions: 63 },
  { key: '6M', sessions: 126 },
  { key: '1Y', sessions: 252 },
];
const MAIN_H = 270;
const SUB_H = 120;
const SUB_GAP = 26;
const AXIS_H = 24;
const M = { top: 14, right: 92, left: 58 };

// Lines a strategy can draw over price. Colours follow the categorical order.
const LINE_DEFS = {
  ema20: { label: '20D EMA', cls: 'series-2' },
  sma50: { label: '50 DMA', cls: 'series-2' },
  sma200: { label: '200 DMA', cls: 'series-3' },
};

// Indicator panels drawn below price on their own scale (never a second y-axis).
const PANELS = {
  rsiPanel: {
    title: 'RSI (14)',
    domain: () => [0, 100],
    ticks: [30, 50, 70],
    refs: [30, 70],
    band: [30, 70],
    lines: [{ key: 'rsi14', label: 'RSI', cls: 'series-1' }],
  },
  macdPanel: {
    title: 'MACD (12, 26, 9)',
    domain: (pts) => {
      const vals = pts.flatMap((p) => [p.macd, p.macdSignal, p.macdHist]).filter((v) => v !== null);
      const m = Math.max(...vals.map(Math.abs), 1e-9) * 1.1;
      return [-m, m];
    },
    refs: [0],
    bars: 'macdHist',
    lines: [
      { key: 'macd', label: 'MACD', cls: 'series-1' },
      { key: 'macdSignal', label: 'Signal', cls: 'series-2' },
    ],
  },
};

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Push end labels apart so they never overlap (simple 1-D relaxation). */
function spreadLabels(labels, minGap, lo, hi) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].y - sorted[i - 1].y < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  const overflow = sorted.length ? sorted.at(-1).y - hi : 0;
  if (overflow > 0) sorted.forEach((l) => { l.y -= overflow; });
  sorted.forEach((l) => { l.y = Math.max(lo, l.y); });
  return sorted;
}

function linePath(pts, key, x, y) {
  let d = '';
  let pen = false;
  pts.forEach((p, i) => {
    const v = p[key];
    if (v === null || v === undefined) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function bandPath(pts, hiKey, loKey, x, y) {
  const idx = pts.map((p, i) => i).filter((i) => pts[i][hiKey] !== null && pts[i][loKey] !== null);
  if (idx.length < 2) return '';
  const top = idx.map((i) => `${x(i).toFixed(1)},${y(pts[i][hiKey]).toFixed(1)}`);
  const bottom = idx.reverse().map((i) => `${x(i).toFixed(1)},${y(pts[i][loKey]).toFixed(1)}`);
  return `M${top.join('L')}L${bottom.join('L')}Z`;
}

const fmtNum = (v, digits = 2) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }));

export default function PriceChart({ symbol, refreshKey, strategy, showTitle = true }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState('6M');
  const [state, setState] = useState({ loading: true });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!symbol) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'Chart unavailable');
        return body;
      })
      .then((data) => { if (!cancelled) setState({ loading: false, data }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: error.message }); });
    return () => { cancelled = true; };
  }, [symbol, refreshKey]);

  const data = state.data?.symbol === symbol ? state.data : null;
  const sessions = RANGES.find((r) => r.key === range).sessions;
  const overlays = strategy?.overlays || ['ema20', 'high52'];
  const overlayKey = overlays.join(',');
  const lines = overlays.filter((o) => LINE_DEFS[o]).map((o) => ({ key: o, ...LINE_DEFS[o] }));
  const showHigh = overlays.includes('high52');
  const showBands = overlays.includes('bb');
  const panel = PANELS[overlays.find((o) => PANELS[o])] || null;
  const height = MAIN_H + (panel ? SUB_GAP + SUB_H : 0) + AXIS_H;

  const geo = useMemo(() => {
    if (!data?.points?.length || !width) return null;
    const pts = data.points.slice(-sessions);
    const innerW = width - M.left - M.right;
    const x = (i) => M.left + (pts.length === 1 ? innerW : (i / (pts.length - 1)) * innerW);

    // Main panel: price plus the strategy's overlays.
    const keys = ['close', ...lines.map((l) => l.key), ...(showBands ? ['bbUpper', 'bbLower'] : [])];
    const values = pts.flatMap((p) => keys.map((k) => p[k])).filter((v) => v > 0);
    if (showHigh && data.high52) values.push(data.high52);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    const yMin = lo - pad;
    const yMax = hi + pad;
    const mainBottom = MAIN_H;
    const y = (v) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (MAIN_H - M.top);

    const lastPt = pts.at(-1);
    const endLabels = [
      { key: 'close', text: 'Price', y: y(lastPt.close), cls: 'series-1' },
      ...lines.filter((l) => lastPt[l.key] !== null).map((l) => ({ key: l.key, text: l.label, y: y(lastPt[l.key]), cls: l.cls })),
      ...(showBands && lastPt.bbUpper !== null ? [
        { key: 'bbU', text: 'Upper band', y: y(lastPt.bbUpper), cls: 'series-3' },
        { key: 'bbL', text: 'Lower band', y: y(lastPt.bbLower), cls: 'series-3' },
      ] : []),
      ...(showHigh && data.high52 ? [{ key: 'high', text: '52W high', y: y(data.high52), cls: 'ref' }] : []),
    ];

    // Indicator panel below, on its own scale.
    let sub = null;
    if (panel) {
      const top = mainBottom + SUB_GAP;
      const [dMin, dMax] = panel.domain(pts);
      const sy = (v) => top + (1 - (v - dMin) / (dMax - dMin)) * SUB_H;
      sub = {
        top,
        sy,
        ticks: panel.ticks || [0],
        paths: panel.lines.map((l) => ({ ...l, d: linePath(pts, l.key, x, sy) })),
        barW: Math.max(1, innerW / pts.length - 1),
        labels: spreadLabels(panel.lines
          .filter((l) => lastPt[l.key] !== null)
          .map((l) => ({ key: l.key, text: l.label, y: sy(lastPt[l.key]), cls: l.cls })), 14, top + 4, top + SUB_H),
      };
    }

    // Month boundaries as x ticks, thinned to fit.
    const months = [];
    pts.forEach((p, i) => {
      if (i === 0 || p.t.slice(0, 7) !== pts[i - 1].t.slice(0, 7)) months.push(i);
    });
    const every = Math.ceil(months.length / Math.max(2, Math.floor(innerW / 70)));
    const xTicks = months.filter((_, i) => i % every === 0 && months[i] > 0);

    return {
      pts,
      x,
      y,
      innerW,
      yTicks: niceTicks(yMin, yMax),
      xTicks,
      priceD: linePath(pts, 'close', x, y),
      lineDs: lines.map((l) => ({ ...l, d: linePath(pts, l.key, x, y) })),
      bandD: showBands ? bandPath(pts, 'bbUpper', 'bbLower', x, y) : '',
      bandEdges: showBands ? [linePath(pts, 'bbUpper', x, y), linePath(pts, 'bbLower', x, y)] : [],
      labels: spreadLabels(endLabels, 14, M.top + 4, mainBottom),
      sub,
      plotBottom: sub ? sub.top + SUB_H : mainBottom,
    };
    // `lines`/`panel` are derived from overlayKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sessions, width, overlayKey]);

  const onMove = (e) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - M.left) / geo.innerW) * (geo.pts.length - 1));
    setHover(Math.min(geo.pts.length - 1, Math.max(0, i)));
  };

  const onKey = (e) => {
    if (!geo) return;
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? geo.pts.length) - 1));
    if (e.key === 'ArrowRight') setHover((h) => Math.min(geo.pts.length - 1, (h ?? -1) + 1));
    if (e.key === 'Escape') setHover(null);
  };

  const hp = geo && hover !== null ? geo.pts[hover] : null;
  const first = geo?.pts[0];
  const lastPt = geo?.pts.at(-1);
  const rangeChange = first && lastPt ? ((lastPt.close - first.close) / first.close) * 100 : null;
  const px = (v) => priceOf(v, data);

  return (
    <div className="chart">
      <div className="chart-head">
        <div>
          {showTitle && <div className="chart-title">
            {displaySymbol(symbol)}{' '}
            {data?.name && data.name.toUpperCase() !== displaySymbol(symbol).toUpperCase() ? <span className="muted">· {data.name}</span> : null}
          </div>}
          <div className="legend">
            <span><i className="swatch series-1" />Price</span>
            {lines.map((l) => <span key={l.key}><i className={`swatch ${l.cls}`} />{l.label}</span>)}
            {showBands && <span><i className="swatch series-3" />Bollinger bands (20, 2σ)</span>}
            {showHigh && <span><i className="swatch ref dashed" />52W high {data ? px(data.high52) : ''}</span>}
            {rangeChange !== null && (
              <span className={rangeChange >= 0 ? 'up' : 'down'}>{range}: {rangeChange >= 0 ? '+' : '−'}{Math.abs(rangeChange).toFixed(1)}%</span>
            )}
          </div>
        </div>
        <div className="seg" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={r.key === range ? 'active' : ''} onClick={() => setRange(r.key)}>{r.key}</button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="chart-wrap" style={{ minHeight: height }}>
        {state.error && !data && <div className="chart-msg">Couldn&rsquo;t load chart: {state.error}</div>}
        {!state.error && !geo && <div className="chart-msg">Loading price history…</div>}
        {geo && (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
              role="img"
              aria-label={`${displaySymbol(symbol)} price over ${range}${panel ? ` with ${panel.title}` : ''}`}
              tabIndex={0}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onKeyDown={onKey}
              onBlur={() => setHover(null)}
              style={{ opacity: state.loading ? 0.55 : 1 }}
            >
              {geo.yTicks.map((v) => (
                <g key={v}>
                  <line className="grid" x1={M.left} x2={width - M.right} y1={geo.y(v)} y2={geo.y(v)} />
                  <text className="axis" x={M.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end">{v.toLocaleString('en-IN')}</text>
                </g>
              ))}

              {geo.bandD && <path className="band-fill" d={geo.bandD} />}
              {geo.bandEdges.map((d, i) => <path key={i} className="line thin series-3" d={d} />)}
              {showHigh && data.high52 && (
                <line className="ref-line" x1={M.left} x2={width - M.right} y1={geo.y(data.high52)} y2={geo.y(data.high52)} />
              )}
              {geo.lineDs.map((l) => <path key={l.key} className={`line ${l.cls}`} d={l.d} />)}
              <path className="line series-1" d={geo.priceD} />

              {geo.labels.map((l) => (
                <text key={l.key} className={`end-label ${l.cls}`} x={width - M.right + 8} y={l.y} dy="0.32em">{l.text}</text>
              ))}

              {geo.sub && (
                <g>
                  <text className="panel-title" x={M.left} y={geo.sub.top - 8}>{panel.title}</text>
                  {panel.band && (
                    <rect className="band-fill neutral" x={M.left} width={geo.innerW}
                      y={geo.sub.sy(panel.band[1])} height={geo.sub.sy(panel.band[0]) - geo.sub.sy(panel.band[1])} />
                  )}
                  {geo.sub.ticks.map((v) => (
                    <text key={v} className="axis" x={M.left - 8} y={geo.sub.sy(v)} dy="0.32em" textAnchor="end">{v}</text>
                  ))}
                  {panel.refs.map((v) => (
                    <line key={v} className="ref-line soft" x1={M.left} x2={width - M.right} y1={geo.sub.sy(v)} y2={geo.sub.sy(v)} />
                  ))}
                  {panel.bars && geo.pts.map((p, i) => (p[panel.bars] === null ? null : (
                    <rect
                      key={p.t}
                      className={p[panel.bars] >= 0 ? 'bar pos' : 'bar neg'}
                      x={geo.x(i) - geo.sub.barW / 2}
                      width={geo.sub.barW}
                      y={Math.min(geo.sub.sy(0), geo.sub.sy(p[panel.bars]))}
                      height={Math.abs(geo.sub.sy(p[panel.bars]) - geo.sub.sy(0))}
                    />
                  )))}
                  {geo.sub.paths.map((l) => <path key={l.key} className={`line ${l.cls}`} d={l.d} />)}
                  {geo.sub.labels.map((l) => (
                    <text key={l.key} className={`end-label ${l.cls}`} x={width - M.right + 8} y={l.y} dy="0.32em">{l.text}</text>
                  ))}
                </g>
              )}

              {geo.xTicks.map((i) => (
                <text key={i} className="axis" x={geo.x(i)} y={height - 6} textAnchor="middle">
                  {new Date(geo.pts[i].t).toLocaleDateString('en-IN', { month: 'short', ...(geo.pts[i].t.slice(5, 7) === '01' ? { year: '2-digit' } : {}) })}
                </text>
              ))}

              {hp && (
                <g className="crosshair">
                  <line x1={geo.x(hover)} x2={geo.x(hover)} y1={M.top} y2={geo.plotBottom} />
                  {geo.lineDs.map((l) => (hp[l.key] !== null
                    ? <circle key={l.key} className={`dot ${l.cls}`} cx={geo.x(hover)} cy={geo.y(hp[l.key])} r="4" /> : null))}
                  <circle className="dot series-1" cx={geo.x(hover)} cy={geo.y(hp.close)} r="4" />
                  {geo.sub?.paths.map((l) => (hp[l.key] !== null
                    ? <circle key={l.key} className={`dot ${l.cls}`} cx={geo.x(hover)} cy={geo.sub.sy(hp[l.key])} r="4" /> : null))}
                </g>
              )}
            </svg>
            {hp && (
              <div className="tooltip" style={{ left: Math.min(Math.max(geo.x(hover), 90), width - 90), top: 4 }}>
                <div className="tt-date">{new Date(hp.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="tt-row"><i className="swatch series-1" />Close <b>{px(hp.close)}</b></div>
                {lines.map((l) => (
                  <div key={l.key} className="tt-row"><i className={`swatch ${l.cls}`} />{l.label} <b>{px(hp[l.key])}</b></div>
                ))}
                {showBands && (
                  <>
                    <div className="tt-row"><i className="swatch series-3" />Upper <b>{px(hp.bbUpper)}</b></div>
                    <div className="tt-row"><i className="swatch series-3" />Lower <b>{px(hp.bbLower)}</b></div>
                  </>
                )}
                {panel?.lines.map((l) => (
                  <div key={l.key} className="tt-row"><i className={`swatch ${l.cls}`} />{l.label} <b>{fmtNum(hp[l.key], l.key === 'rsi14' ? 1 : 2)}</b></div>
                ))}
                {panel?.bars && <div className="tt-row"><i className="swatch neutral" />Histogram <b>{fmtNum(hp[panel.bars])}</b></div>}
              </div>
            )}
          </>
        )}
      </div>
      {data?.stale && <div className="note warn">Showing last saved history — live refresh failed.</div>}
    </div>
  );
}
