import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import FundChart from '../../components/FundChart';
import { PageHeader, SkeletonRows } from '../../components/ui';
import { api, useApp } from '../../lib/client';
import { money, percent, tone } from '../../lib/format';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Fund detail: returns, category comparison and NAV history. */
export default function FundPage() {
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : null;
  const { watchlist, toggleWatch, openPick, pickedIn } = useApp();
  const [fund, setFund] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code) return;
    setFund(null);
    setError(null);
    api(`/api/funds/${encodeURIComponent(code)}`).then(setFund).catch((e) => setError(e.message));
  }, [code]);

  const symbol = code ? `MF:${code}` : null;

  if (error) {
    return (
      <>
        <PageHeader title="Fund not found" back={{ href: '/funds', label: 'Mutual funds' }} />
        <div className="panel empty">Couldn&rsquo;t load scheme {code}: {error}</div>
      </>
    );
  }
  if (!fund) {
    return (
      <>
        <PageHeader title="Loading fund…" back={{ href: '/funds', label: 'Mutual funds' }} />
        <SkeletonRows rows={8} />
      </>
    );
  }

  const watched = watchlist.includes(symbol);
  const r3 = fund.returns.find((x) => x.period === '3Y');
  const r5 = fund.returns.find((x) => x.period === '5Y');
  const headline = r5?.diff != null ? r5 : r3?.diff != null ? r3 : null;
  const isIdcw = fund.option === 'IDCW';

  return (
    <>
      <PageHeader
        back={{ href: '/funds', label: 'Mutual funds' }}
        title={fund.name}
        subtitle={(
          <>
            <div className="chips">
              <span className="chip">{fund.house}</span>
              {fund.category && <span className="chip">{fund.assetClass ? `${fund.assetClass} · ` : ''}{fund.category}</span>}
            </div>
            <div className="id-line">AMFI code {fund.code}{fund.isin && <> · ISIN {fund.isin}</>}</div>
            <span className="quote-line">
              <span className="quote-price">{money(fund.price, {})}</span>
              <span className={tone(fund.changePct)}>{fund.change != null ? `${fund.change >= 0 ? '+' : '−'}${Math.abs(fund.change).toFixed(4)} (${percent(fund.changePct)})` : ''}</span>
              <span className="muted small">NAV on {fmtDate(fund.asOf)}{fund.stale ? ' · saved copy, live fetch failed' : ''}</span>
            </span>
          </>
        )}
        actions={(
          <>
            <button type="button" className={`btn ghost ${watched ? 'on' : ''}`} onClick={() => toggleWatch(symbol, fund.name)} aria-pressed={watched}>
              {watched ? '★ Watching' : '☆ Watch'}
            </button>
            <button type="button" className="btn primary" onClick={() => openPick({ symbol, name: fund.name })}>+ Add to bucket</button>
          </>
        )}
      />

      {(isIdcw || fund.plan === 'Regular') && (
        <div className="banner warn">
          {isIdcw && <div><b>IDCW plan:</b> the NAV drops each time a payout is made, so the returns below understate what investors actually received. Compare funds using their Growth plans.</div>}
          {fund.plan === 'Regular' && <div><b>Regular plan:</b> includes distributor commission, typically 0.5–1% a year more than the Direct plan of the same fund. Over 10 years that compounds to a noticeable difference.</div>}
        </div>
      )}

      {pickedIn.has(symbol) && (
        <p className="in-buckets small">In your bucket{pickedIn.get(symbol).length > 1 ? 's' : ''}: <b>{pickedIn.get(symbol).join(', ')}</b></p>
      )}

      {headline && (
        <section className={`verdict-hero panel fund-verdict ${headline.diff >= 0 ? 'ahead' : 'behind'}`}>
          <span className="label">Over {headline.period === '5Y' ? 'five' : 'three'} years</span>
          <p className="fv-text">
            This fund returned <b>{percent(headline.fund, { signed: false, digits: 1 })} a year</b>, versus {percent(headline.benchmark, { signed: false, digits: 1 })} for
            the Nifty 50. That is <b className={tone(headline.diff)}>{Math.abs(headline.diff).toFixed(1)} points a year {headline.diff >= 0 ? 'ahead' : 'behind'}</b>, after the fund&rsquo;s fees.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>Growth vs the Nifty 50</h2>
        <FundChart points={fund.points} benchLabel={fund.benchmark.available ? 'Nifty 50' : ''} fundLabel="This fund" />
        {fund.benchmark.available
          ? <p className="muted tiny">Nifty 50 with dividends reinvested ({fund.benchmark.symbol}, adjusted). Fund returns are after its expense ratio.</p>
          : <p className="muted tiny">No stock-index comparison for {fund.assetClass?.toLowerCase() || 'this'} funds; judge them against their category and fixed deposits instead.</p>}
      </section>

      <section className="grid-2">
        <div className="panel">
          <h2>Returns</h2>
          <div className="table-scroll">
          <table className="table returns">
            <thead>
              <tr><th>Period</th><th className="num">This fund</th>{fund.benchmark.available && <><th className="num">Nifty 50</th><th className="num">Difference</th></>}</tr>
            </thead>
            <tbody>
              {fund.returns.map((r) => (
                <tr key={r.period}>
                  <td>{r.period}{r.annualised && <span className="muted tiny"> a year</span>}</td>
                  <td className={`num ${tone(r.fund)}`}>{percent(r.fund, { digits: 1 })}</td>
                  {fund.benchmark.available && (
                    <>
                      <td className={`num ${tone(r.benchmark)}`}>{percent(r.benchmark, { digits: 1 })}</td>
                      <td className={`num strong ${tone(r.diff)}`}>{r.diff === null ? '—' : `${r.diff >= 0 ? '+' : '−'}${Math.abs(r.diff).toFixed(1)} pts`}</td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="muted">
                <td>Since launch <span className="tiny">({fmtDate(fund.inception.date)})</span></td>
                <td className="num">{fund.inception.cagrPct === null ? '—' : `${percent(fund.inception.cagrPct, { digits: 1 })} a year`}</td>
                {fund.benchmark.available && <><td /><td /></>}
              </tr>
            </tbody>
          </table>
          </div>
          <p className="muted tiny">3Y and 5Y are compounded annual returns; shorter periods are total returns. &ldquo;—&rdquo; means the fund is too new.</p>
        </div>

        <div className="panel">
          <h2>Risk (last 3 years)</h2>
          {fund.risk ? (
            <div className="stat-grid two">
              <div className="mstat">
                <div className="label">Worst fall</div>
                <div className="mstat-value down">{percent(fund.risk.maxDrawdownPct, { digits: 1 })}</div>
                <div className="mstat-sub">{fmtDate(fund.risk.drawdownFrom)} → {fmtDate(fund.risk.drawdownTo)}</div>
              </div>
              <div className="mstat">
                <div className="label">Volatility</div>
                <div className="mstat-value">{percent(fund.risk.volatilityPct, { signed: false, digits: 1 })}</div>
                <div className="mstat-sub">a year · the Nifty 50 is typically 12–18%</div>
              </div>
              <div className="mstat">
                <div className="label">1-year periods with a gain</div>
                <div className="mstat-value">{fund.risk.rolling1yPositivePct === null ? '—' : percent(fund.risk.rolling1yPositivePct, { signed: false, digits: 0 })}</div>
                <div className="mstat-sub">of rolling 1-year windows, last 2 years</div>
              </div>
              <div className="mstat">
                <div className="label">Scheme facts</div>
                <div className="mstat-sub">AMFI code {fund.code}</div>
                <div className="mstat-sub">{fund.isin ? `ISIN ${fund.isin}` : ''}</div>
                <div className="mstat-sub">{fund.schemeType}</div>
              </div>
            </div>
          ) : <p className="muted small">Not enough history yet.</p>}
        </div>
      </section>
    </>
  );
}
