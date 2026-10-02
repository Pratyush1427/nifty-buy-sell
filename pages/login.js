import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AuthLayout from '../components/AuthLayout';
import GoogleButton from '../components/GoogleButton';
import { authRedirect, safeNext } from '../lib/supabase/config';
import { supabaseBrowser } from '../lib/supabase/browser';

const LINK_ERRORS = {
  link: 'That link is invalid or has expired. Ask for a new one below.',
  oauth: 'Google sign-in didn’t finish. Please try again.',
};

export default function Login() {
  const router = useRouter();
  const next = safeNext(router.query.next);
  const [mode, setMode] = useState('password'); // or 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const linkError = LINK_ERRORS[router.query.error];

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    const supabase = supabaseBrowser();
    if (mode === 'magic') {
      const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirect(next) } });
      setBusy(false);
      if (err) return setError(err.message);
      return router.push(`/check-email?kind=magic&email=${encodeURIComponent(email)}`);
    }
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setBusy(false);
      if (/not confirmed/i.test(err.message)) setUnconfirmed(true);
      return setError(/invalid login/i.test(err.message) ? 'Wrong email or password.' : err.message);
    }
    // Full navigation so the server sees the new session cookie.
    window.location.assign(next);
  };

  const resend = async () => {
    setBusy(true);
    await supabaseBrowser().auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirect('/welcome') } });
    setBusy(false);
    router.push(`/check-email?kind=confirm&email=${encodeURIComponent(email)}`);
  };

  return (
    <AuthLayout title="Sign in">
      <h1>Sign in</h1>
      {router.query.deleted && <p className="form-ok">Your account and all its data have been deleted.</p>}
      {linkError && <p className="form-error">{linkError}</p>}
      <GoogleButton next={next} onError={setError} />
      <form className="form" onSubmit={signIn}>
        <label>
          Email
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === 'password' && (
          <label>
            Password
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}{' '}
            {unconfirmed && <button type="button" className="link accent" onClick={resend}>Resend confirmation email</button>}
          </p>
        )}
        <button className="btn primary block" disabled={busy}>
          {mode === 'magic' ? 'Email me a sign-in link' : 'Sign in'}
        </button>
      </form>
      <p className="small" style={{ margin: 0 }}>
        {mode === 'password'
          ? <button type="button" className="link accent" onClick={() => { setMode('magic'); setError(null); }}>Sign in with an email link instead</button>
          : <button type="button" className="link accent" onClick={() => { setMode('password'); setError(null); }}>Use a password instead</button>}
        {mode === 'password' && <> · <Link href="/forgot-password">Forgot password?</Link></>}
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        New here? <Link href={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
      </p>
    </AuthLayout>
  );
}

Login.layout = 'auth';
