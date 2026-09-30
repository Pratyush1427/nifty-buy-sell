import { useEffect, useState } from 'react';
import Leaderboard, { TrackRecord } from '../components/Leaderboard';
import ModelReport from '../components/ModelReport';
import { PageHeader, SkeletonRows } from '../components/ui';
import { api, useApp } from '../lib/client';
import { STRATEGIES, STRATEGY_GROUPS, getStrategy } from '../lib/strategies';

/** Models: "How are signals decided, and can I trust them?" */
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
        subtitle="How each signal is decided, and how each model has done on years it never saw. Your choice here drives every signal in the app."
      />

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
            ? <span className="chip good">Used for all signals</span>
            : <button type="button" className="btn primary small" onClick={() => setPref('strategy', strategy.key)}>Use {strategy.label} for all signals</button>}
        </div>
        {report && <TrackRecord report={report} strategyKey={strategy.key} />}
        {strategy.group === 'ml' && report !== undefined && <ModelReport report={report} modelKey={strategy.key} />}
      </section>

      <section className="panel">
        <h2>How the models compare</h2>
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
            A scheduled job re-scores every weekday at 18:30 and retrains weekly (<code>npm run ml:schedule</code> installs it). Run <code>npm run ml</code> any time for a full retrain.
          </p>
        </section>
      )}
    </>
  );
}
