import Link from 'next/link';
import { STRATEGIES, STRATEGY_GROUPS } from '../lib/strategies';

const SIGNAL_ICON = { BUY: '▲', SELL: '▼', HOLD: '■', NO_DATA: '?', NA: '–', LOADING: '…' };
const SIGNAL_LABEL = { NO_DATA: 'No data', NA: 'N/A', LOADING: 'Loading' };

/** BUY / HOLD / SELL chip: icon + label, never colour alone. */
export function SignalPill({ signal, title, size }) {
  const cls = { BUY: 'buy', SELL: 'sell', HOLD: 'hold' }[signal] || 'none';
  return (
    <span className={`pill ${cls} ${size === 'lg' ? 'lg' : ''}`} title={title}>
      <span aria-hidden="true">{SIGNAL_ICON[signal] || '?'}</span> {SIGNAL_LABEL[signal] || signal}
    </span>
  );
}

export function Tile({ label, value, sub, tone = '', subTone }) {
  const auto = typeof sub === 'string' && sub.startsWith('+') ? 'up' : typeof sub === 'string' && sub.startsWith('−') ? 'down' : 'muted';
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={`tile-value ${tone}`}>{value}</div>
      {sub && <div className={`tile-sub ${subTone ?? auto}`}>{sub}</div>}
    </div>
  );
}

export function Message({ msg }) {
  if (!msg) return null;
  return (
    <div className={`msg ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
      {msg.text}
      {msg.details?.length > 0 && (
        <ul>{msg.details.slice(0, 8).map((d) => <li key={d}>{d}</li>)}{msg.details.length > 8 && <li>…and {msg.details.length - 8} more</li>}</ul>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="skeleton" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-row" />)}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="page-head">
      <div>
        {back && <Link className="back-link" href={back.href}>← {back.label}</Link>}
        <h1>{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** Compact "Signals by" picker, grouped like the Models page. */
export function ModelSelect({ value, onChange }) {
  return (
    <label className="model-select">
      <span>Signals by</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {STRATEGY_GROUPS.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {STRATEGIES.filter((s) => s.group === g.key).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </optgroup>
        ))}
      </select>
      <Link href="/models" className="link accent small">Compare models</Link>
    </label>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className={value === o.key ? 'active' : ''} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}{o.count !== undefined && <span className="count"> {o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FreshnessDot({ state }) {
  return <span className={`dot-status ${state}`} aria-hidden="true" />;
}
