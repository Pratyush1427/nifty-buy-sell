import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AuthLayout from '../components/AuthLayout';
import AvatarPicker from '../components/AvatarPicker';
import { api, postJson } from '../lib/client';
import { ACKNOWLEDGEMENTS } from '../lib/consent';
import { safeNext } from '../lib/supabase/config';
import { supabaseBrowser } from '../lib/supabase/browser';

/** First stop after sign-up: pick a name and avatar, and accept that this is a learning game, not advice. */
export default function Welcome() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [acks, setAcks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/api/profile').then((p) => {
      setProfile(p);
      setName(p.displayName || '');
      setAvatar(p.avatar);
    }).catch((e) => setError(e.message));
  }, []);

  const allTicked = ACKNOWLEDGEMENTS.every((a) => acks[a.key]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/profile/accept', {
        displayName: name,
        avatar,
        acknowledgements: ACKNOWLEDGEMENTS.filter((a) => acks[a.key]).map((a) => a.key),
      });
      // Pick up the consent flag in a fresh session token, then continue.
      await supabaseBrowser().auth.refreshSession();
      window.location.assign(safeNext(router.query.next));
    } catch (err) {
      setBusy(false);
      setError(err.message);
    }
  };

  return (
    <AuthLayout title="Welcome" wide>
      <h1>Welcome to Nifty Signals</h1>
      <p className="muted small" style={{ margin: 0 }}>
        Two quick things before you start: how you’ll appear, and what this app is (and isn’t).
      </p>
      {!profile && !error && <p className="muted">Loading…</p>}
      {profile && (
        <form className="form" onSubmit={submit}>
          <label>
            Your name
            <input className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="form" style={{ gap: 6 }}>
            <span className="small" style={{ fontWeight: 600, color: 'var(--text-2)' }}>Avatar</span>
            <AvatarPicker value={avatar} onChange={setAvatar} name={name} googlePhoto={profile.googlePhoto} />
          </div>
          <fieldset className="form" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
            <legend className="small" style={{ fontWeight: 700, marginBottom: 8 }}>Please read and tick each one</legend>
            {ACKNOWLEDGEMENTS.map((a) => (
              <label key={a.key} className="ack">
                <input type="checkbox" checked={Boolean(acks[a.key])} onChange={(e) => setAcks({ ...acks, [a.key]: e.target.checked })} />
                <span>{a.text}</span>
              </label>
            ))}
            <p className="muted small">
              Full details: <Link href="/disclaimer" target="_blank">Disclaimer</Link> and <Link href="/terms" target="_blank">Terms of use</Link>.
            </p>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy || !allTicked}>I understand, let’s play</button>
        </form>
      )}
      {!profile && error && <p className="form-error">{error}</p>}
    </AuthLayout>
  );
}

Welcome.layout = 'auth';
