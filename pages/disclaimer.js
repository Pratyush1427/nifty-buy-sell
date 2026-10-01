import LegalPage, { LastUpdated } from '../components/LegalPage';

export default function Disclaimer() {
  return (
    <LegalPage title="Disclaimer">
      <LastUpdated date="2026-10-02" />
      <p><strong>Nifty Signals is a personal learning project and a game. It is not investment advice.</strong></p>

      <h2>Not advice, not a recommendation</h2>
      <p>
        Nothing on this site is investment, financial, tax or legal advice, a recommendation or solicitation to buy, sell or
        hold any security, or a research report. The person who built it is <strong>not registered with SEBI</strong> as an
        investment adviser or research analyst, and doesn’t offer advisory or research services.
      </p>

      <h2>Model outlooks are experiments</h2>
      <p>
        “Bullish”, “Neutral” and “Bearish” labels are the output of simple technical rules and machine-learning models built
        while learning. They are generated automatically, for every stock alike, without knowing anything about you. They are
        often wrong. Historical test results (“track records”) describe how a model behaved on past data and say nothing
        about the future.
      </p>

      <h2>Buckets are pretend</h2>
      <p>
        Buckets are a game. No real money, orders, trades or holdings are involved, nothing can be won, and nothing is
        connected to any broker or exchange. Picks are valued at end-of-day closing prices only.
      </p>

      <h2>Data may be wrong or late</h2>
      <p>
        Prices come from Yahoo Finance and mutual fund NAVs from AMFI (via mfapi.in). They can be delayed, incomplete or
        incorrect, and the site can be unavailable. Nothing here is factual or dependable. Always check official sources.
      </p>

      <h2>Your decisions are yours</h2>
      <p>
        Don’t use this site to make real investment decisions. If you do, that is entirely your own responsibility. Investments
        in securities markets are subject to market risks; consult a SEBI-registered adviser for advice about your situation.
      </p>
    </LegalPage>
  );
}

Disclaimer.layout = 'auth';
