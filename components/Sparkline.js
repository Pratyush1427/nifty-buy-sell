export default function Sparkline({ data, width = 120, height = 32 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = 3;
  const x = (i) => (i / (data.length - 1)) * width;
  const y = (v) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const rising = data.at(-1) >= data[0];

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${data.length}-day price trend, ${rising ? 'up' : 'down'}`}
    >
      <polyline fill="none" stroke={rising ? 'var(--good-ink)' : 'var(--critical-ink)'} strokeWidth="1.5" strokeLinejoin="round" points={points} />
      <circle cx={x(data.length - 1)} cy={y(data.at(-1))} r="2.5" fill={rising ? 'var(--good-ink)' : 'var(--critical-ink)'} />
    </svg>
  );
}
