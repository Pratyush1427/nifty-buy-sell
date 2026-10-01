import Head from 'next/head';
import Link from 'next/link';

/** Minimal layout for sign-in, sign-up and onboarding pages. */
export default function AuthLayout({ title, children, wide = false }) {
  return (
    <>
      <Head>
        <title>{title ? `${title} · Nifty Signals` : 'Nifty Signals'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="auth-wrap">
        <Link href="/" className="brand auth-brand" aria-label="Nifty Signals home">
          <span className="brand-mark" aria-hidden="true">▲</span> Nifty Signals
        </Link>
        <div className={`panel auth-card${wide ? ' wide' : ''}`}>{children}</div>
        <p className="muted tiny auth-foot">
          A learning project and a game with pretend buckets, not investment advice. Not registered with SEBI.{' '}
          <Link href="/disclaimer">Disclaimer</Link> · <Link href="/terms">Terms</Link>
        </p>
      </main>
    </>
  );
}
