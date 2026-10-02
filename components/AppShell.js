import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../lib/client';
import AddToBucket from './AddToBucket';
import BrandMark from './BrandMark';
import GlobalSearch from './GlobalSearch';
import UserMenu from './UserMenu';

const NAV = [
  { href: '/', label: 'My buckets', match: (p) => p === '/' },
  { href: '/stocks', label: 'Stocks', match: (p) => p.startsWith('/stocks') },
  { href: '/funds', label: 'Mutual funds', match: (p) => p.startsWith('/funds') },
  { href: '/gold', label: 'Gold', match: (p) => p.startsWith('/gold') },
  { href: '/models', label: 'Models', match: (p) => p.startsWith('/models') },
];

export default function AppShell({ children }) {
  const { pathname } = useRouter();
  const { toast, setToast } = useApp();

  return (
    <>
      <Head>
        <title>Stockpot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="brand" aria-label="Stockpot home">
            <BrandMark /> Stockpot
          </Link>
          <nav className="app-nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={n.match(pathname) ? 'active' : ''} aria-current={n.match(pathname) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <GlobalSearch />
          <UserMenu />
        </div>
      </header>
      <div className="game-strip" role="note">
        <div className="game-strip-inner">
          <span>A learning project and a game with pretend buckets. Model outlooks are experiments, not investment advice. Not registered with SEBI.</span>
          <Link href="/disclaimer">Read the disclaimer</Link>
        </div>
      </div>

      <main id="main" className="shell">{children}</main>

      <footer className="foot muted tiny">
        Stock, gold and USD/INR prices from Yahoo Finance (may be delayed or wrong); mutual fund NAVs from AMFI via mfapi.in (daily). Gold per gram is an estimate.
        Model outlooks are automated experiments, not recommendations. Nothing here is investment advice; don’t rely on it for real decisions.{' '}
        <Link href="/disclaimer">Disclaimer</Link> · <Link href="/terms">Terms</Link>
      </footer>

      <AddToBucket />
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className="link accent" onClick={() => { setToast(null); toast.action.run(); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </>
  );
}
