import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useApp } from '../lib/client';
import AddInvestment from './AddInvestment';
import GlobalSearch from './GlobalSearch';

const NAV = [
  { href: '/', label: 'Portfolio', match: (p) => p === '/' },
  { href: '/stocks', label: 'Stocks', match: (p) => p.startsWith('/stocks') },
  { href: '/funds', label: 'Mutual funds', match: (p) => p.startsWith('/funds') },
  { href: '/models', label: 'Models', match: (p) => p.startsWith('/models') },
];

export default function AppShell({ children }) {
  const { pathname } = useRouter();
  const { toast, setToast } = useApp();

  return (
    <>
      <Head>
        <title>Nifty Signals</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="brand" aria-label="Nifty Signals home">
            <span className="brand-mark" aria-hidden="true">▲</span> Nifty Signals
          </Link>
          <nav className="app-nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={n.match(pathname) ? 'active' : ''} aria-current={n.match(pathname) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <GlobalSearch />
        </div>
      </header>

      <main id="main" className="shell">{children}</main>

      <footer className="foot muted tiny">
        Stock prices from Yahoo Finance (may be delayed); mutual fund NAVs from AMFI via mfapi.in (daily).
        Signals are rules-based and statistical screens, not investment advice.
      </footer>

      <AddInvestment />
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
