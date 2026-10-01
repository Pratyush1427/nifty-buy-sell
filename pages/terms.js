import Link from 'next/link';
import LegalPage, { LastUpdated } from '../components/LegalPage';

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <LastUpdated date="2026-10-02" />
      <p>
        By creating an account or using Nifty Signals, you agree to these terms and to the{' '}
        <Link href="/disclaimer">Disclaimer</Link>. If you don’t agree, please don’t use the site.
      </p>

      <h2>What this is</h2>
      <p>
        A free, non-commercial learning project: a game where you build pretend buckets of stocks, mutual funds, gold and
        silver and see how they would have done at closing prices, alongside experimental model outlooks. It is not a
        brokerage, an advisory service or a research service.
      </p>

      <h2>Who can use it</h2>
      <p>You must be 18 or older. One account per person, please.</p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don’t present anything from this site to others as advice, a tip or a recommendation.</li>
        <li>Don’t scrape the site, overload it, or try to access other people’s accounts or data.</li>
        <li>Don’t use names that are offensive or impersonate someone else.</li>
      </ul>
      <p>Accounts that break these rules may be suspended or deleted.</p>

      <h2>Your data</h2>
      <p>
        We store your email address, name and avatar, your buckets, picks and watchlist, and the date you accepted these
        terms. Sign-in is handled by Supabase. Your buckets are private and are never shown to other users. We don’t sell or
        share your data, and don’t use it for advertising. You can delete your account and all its data at any time from the
        Account page.
      </p>

      <h2>No warranty, limited liability</h2>
      <p>
        The site is provided “as is”, without warranties of any kind, and may change, break or shut down at any time. To the
        extent the law allows, the builder is not liable for any loss arising from using it or relying on anything it shows.
      </p>

      <h2>Changes</h2>
      <p>These terms may be updated; the date above shows the latest version. Continuing to use the site means you accept them.</p>

      <p>These terms are governed by the laws of India.</p>
    </LegalPage>
  );
}

Terms.layout = 'auth';
