import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import db from './db';

const PYTHON = path.join(process.cwd(), '.venv', 'bin', 'python');
const MODELS = path.join(process.cwd(), 'data', 'ml', 'models.joblib');
const TIMEOUT_MS = 90 * 1000;

const running = globalThis.__niftyMlScore || (globalThis.__niftyMlScore = new Map());

export function mlAvailable() {
  return fs.existsSync(PYTHON) && fs.existsSync(MODELS);
}

/**
 * Score stocks the nightly run doesn't cover by running `python -m ml.score`.
 * Results land in the ml_scores table, where the market feed picks them up.
 * Concurrent requests for the same symbols share one run.
 */
export function scoreSymbols(symbols) {
  if (!symbols.length) return Promise.resolve({ scored: [], skipped: [] });
  if (!mlAvailable()) return Promise.reject(new Error('ML models not trained yet: run `npm run ml` first.'));
  const key = [...symbols].sort().join(',');
  if (running.has(key)) return running.get(key);

  const job = new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['-W', 'ignore', '-m', 'ml.score', ...symbols], { cwd: process.cwd() });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ML scoring timed out')); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const last = out.trim().split('\n').pop();
      try {
        const parsed = JSON.parse(last);
        if (code === 0) resolve(parsed);
        else reject(new Error(parsed.error || `ML scoring failed (exit ${code})`));
      } catch {
        reject(new Error(`ML scoring failed (exit ${code}): ${(err || out).trim().split('\n').pop() || 'no output'}`));
      }
    });
  }).finally(() => running.delete(key));

  running.set(key, job);
  return job;
}

const hasScore = db.prepare('SELECT 1 FROM ml_scores WHERE symbol = ? LIMIT 1');

/** Fire-and-forget scoring for just-added stocks that have no ML score yet. */
export function scoreInBackground(symbols) {
  const todo = [...new Set(symbols)].filter((s) => /\.(NS|BO)$/.test(s) && !hasScore.get(s));
  if (!todo.length || !mlAvailable()) return;
  scoreSymbols(todo).catch((e) => console.warn(`[ml] background scoring of ${todo.join(', ')}: ${e.message}`));
}
