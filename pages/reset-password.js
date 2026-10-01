import { useState } from 'react';
import AuthLayout from '../components/AuthLayout';
import { supabaseBrowser } from '../lib/supabase/browser';
import { PASSWORD_RULE, passwordOk } from '../lib/passwords';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordOk(password)) return setError(PASSWORD_RULE);
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.updateUser({ password });
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    window.location.assign('/');
  };

  return (
    <AuthLayout title="Choose a new password">
      <h1>Choose a new password</h1>
      <form className="form" onSubmit={submit}>
        <label>
          New password <span className="field-hint">{PASSWORD_RULE}</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>Save password</button>
      </form>
    </AuthLayout>
  );
}

ResetPassword.layout = 'auth';
