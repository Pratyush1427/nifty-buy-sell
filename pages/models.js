import { useEffect, useState } from 'react';
import Leaderboard, { TrackRecord } from '../components/Leaderboard';
import ModelReport from '../components/ModelReport';
import { PageHeader, SkeletonRows } from '../components/ui';
import { api, useApp } from '../lib/client';
import { STRATEGIES, STRATEGY_GROUPS, getStrategy } from '../lib/strategies';

/** Models: how each outlook is decided, and how each model behaved in historical tests. */
export default function ModelsPage() {
  const { prefs, setPref } = useApp();
  const [report, setReport] = useState(undefined);
  const [viewing, setViewing] = useState(null);

  useEffect(() => { api('/api/models').then((r) => setReport(r.report)).catch(() => setReport(null)); }, []);
  useEffect(() => { if (!viewing && prefs.strategy) setViewing(prefs.strategy); }, [prefs.strategy, viewing]);

  const strategy = getStrategy(viewing || prefs.strategy);
  const isDefault = strategy.key === prefs.strategy;

  return (
    <>
      <PageHeader
        title="Models"
        subtitle="How each model’s outlook is decided, and how it behaved in historical tests on years it never saw. Your choice here sets the outlook shown across the app."
      />

      <div className="banner warn">
        These models were built while learning about markets and machine learning. The tests below describe past data only:
        they are not evidence that any model works, and no outlook here is a recommendation to buy or sell anything.
      </div>

      <section className="strategy-bar">
        <div className="strategy-groups" role="tablist" aria-label="Decision models">
          {STRATEGY_GROUPS.map((g) => (
            <div key={g.key} className={`sg sg-${g.key}`}>
              <div className="sg-label">{g.label}</div>
              <div className="strategy-tabs">
                {STRATEGIES.filter((st) => st.group === g.key).map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    role="tab"
                    aria-selected={strategy.key === st.key}
                    className={`${strategy.key === st.key ? 'active' : ''} ${prefs.strategy === st.key ? 'is-default' : ''}`}
                    onClick={() => setViewing(st.key)}
                  >
                    <span className="st-label">{st.label}{prefs.strategy === st.key && <span className="default-badge">in use</span>}</span>
                    <span className="st-style">{st.style}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="model-detail-head">
          <p className="strategy-summary"><b>{strategy.label}:</b> {strategy.summary}</p>
          {isDefault
            ? <span className="chip good">Used for all outlooks</span>
            : <button type="button" className="btn primary small" onClick={() => setPref('strategy', strategy.key)}>Use {strategy.label} for all outlooks</button>}
        </div>
        {report && <TrackRecord report={report} strategyKey={strategy.key} />}
        {strategy.group === 'ml' && report !== undefined && <ModelReport report={report} modelKey={strategy.key} />}
      </section>

      <section className="panel">
        <h2>Historical test results</h2>
        {report === undefined ? <SkeletonRows rows={5} /> : report ? (
          <Leaderboard report={report} active={strategy.key} onPick={setViewing} />
        ) : (
          <p className="muted small">No evaluation yet. Run <code>npm run ml</code> to train the ML models and score every model on the same test.</p>
        )}
      </section>

      {report && (
        <section className="panel explainer">
          <h2>Keeping the models current</h2>
          <p className="small">
            Scores were last refreshed for <b>{report.asOf}</b>; models trained {new Date(report.trainedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} on {report.symbols} stocks.
            A scheduled job re-scores every weekday evening and retrains weekly.
          </p>
        </section>
      )}
    </>
  );
}
