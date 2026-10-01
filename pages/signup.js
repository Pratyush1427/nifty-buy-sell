import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AuthLayout from '../components/AuthLayout';
import GoogleButton from '../components/GoogleButton';
import { PASSWORD_RULE, passwordOk } from '../lib/passwords';
import { supabaseBrowser } from '../lib/supabase/browser';

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordOk(password)) return setError(PASSWORD_RULE);
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/welcome` },
    });
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    // With email confirmation on (production), there's no session until the link is clicked.
    if (data.session) window.location.assign('/welcome');
    else router.push(`/check-email?kind=confirm&email=${encodeURIComponent(email)}`);
  };

  return (
    <AuthLayout title="Create an account">
      <h1>Create an account</h1>
      <p className="muted small" style={{ margin: 0 }}>
        Build pretend buckets of stocks, funds, gold and silver, and see how they’d do at real closing prices. Free, and just for learning.
      </p>
      <GoogleButton next="/welcome" onError={setError} />
      <form className="form" onSubmit={submit}>
        <label>
          Email
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password <span className="field-hint">{PASSWORD_RULE}</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>Create account</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

Signup.layout = 'auth';
