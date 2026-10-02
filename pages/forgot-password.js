import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AuthLayout from '../components/AuthLayout';
import { EMAIL_LINKS_ENABLED, authRedirect } from '../lib/supabase/config';
import { supabaseBrowser } from '../lib/supabase/browser';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: authRedirect('/reset-password') });
    setBusy(false);
    if (err) return setError(err.message);
    // Same message whether or not the account exists, so emails can't be probed.
    return router.push(`/check-email?kind=reset&email=${encodeURIComponent(email)}`);
  };

  if (!EMAIL_LINKS_ENABLED) {
    return (
      <AuthLayout title="Reset password">
        <h1>Password reset isn’t available yet</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Stockpot doesn’t send emails yet, so passwords can’t be reset by email. If you’re signed in somewhere, you can
          change your password from the Account page.
        </p>
        <p className="small muted" style={{ margin: 0 }}><Link href="/login">Back to sign in</Link></p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password">
      <h1>Reset your password</h1>
      <form className="form" onSubmit={submit}>
        <label>
          Email
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>Email me a reset link</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}><Link href="/login">Back to sign in</Link></p>
    </AuthLayout>
  );
}

ForgotPassword.layout = 'auth';
