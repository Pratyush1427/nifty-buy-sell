import Head from 'next/head';
import Link from 'next/link';
import BrandMark from './BrandMark';

/** Minimal layout for sign-in, sign-up and onboarding pages. */
export default function AuthLayout({ title, children, wide = false }) {
  return (
    <>
      <Head>
        <title>{title ? `${title} · Stockpot` : 'Stockpot'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <main className="auth-wrap">
        <Link href="/" className="brand auth-brand" aria-label="Stockpot home">
          <BrandMark /> Stockpot
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
