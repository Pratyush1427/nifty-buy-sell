import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import AvatarPicker from '../components/AvatarPicker';
import { api, postJson } from '../lib/client';
import { PASSWORD_RULE, passwordOk } from '../lib/passwords';
import { supabaseBrowser } from '../lib/supabase/browser';

export default function Account() {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [msg, setMsg] = useState(null);
  const [password, setPassword] = useState('');
  const [pwMsg, setPwMsg] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [delError, setDelError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/profile').then((p) => { setProfile(p); setName(p.displayName); setAvatar(p.avatar); });
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const p = await postJson('/api/profile', { displayName: name, avatar }, 'PATCH');
      setProfile(p);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!passwordOk(password)) return setPwMsg({ ok: false, text: PASSWORD_RULE });
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setPwMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Password updated.' });
    if (!error) setPassword('');
    return null;
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    setBusy(true);
    setDelError(null);
    try {
      await api('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm }) });
      await supabaseBrowser().auth.signOut();
      window.location.assign('/login?deleted=1');
    } catch (err) {
      setBusy(false);
      setDelError(err.message);
    }
  };

  if (!profile) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar avatar={profile.avatar} name={profile.displayName} size={52} />
        <div>
          <h1>{profile.displayName}</h1>
          <p className="muted small" style={{ margin: 0 }}>{profile.email}</p>
        </div>
      </div>

      <section className="panel">
        <h2>Profile</h2>
        <form className="form" onSubmit={saveProfile} style={{ maxWidth: 480 }}>
          <label>
            Name
            <input className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <AvatarPicker value={avatar} onChange={setAvatar} name={name} googlePhoto={profile.googlePhoto} />
          {msg && <p className={msg.ok ? 'form-ok' : 'form-error'}>{msg.text}</p>}
          <div><button className="btn primary">Save</button></div>
        </form>
      </section>

      <section className="panel">
        <h2>Password</h2>
        <form className="form" onSubmit={changePassword} style={{ maxWidth: 480 }}>
          <label>
            New password <span className="field-hint">{PASSWORD_RULE}</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {pwMsg && <p className={pwMsg.ok ? 'form-ok' : 'form-error'}>{pwMsg.text}</p>}
          <div><button className="btn ghost" disabled={!password}>Update password</button></div>
        </form>
      </section>

      <section className="panel">
        <h2>Delete account</h2>
        <form className="form" onSubmit={deleteAccount} style={{ maxWidth: 480 }}>
          <p className="muted small">
            Permanently deletes your account, buckets, picks and watchlist. This can’t be undone. Type <strong>DELETE</strong> to confirm.
          </p>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" />
          {delError && <p className="form-error">{delError}</p>}
          <div><button className="btn danger" disabled={busy || confirm !== 'DELETE'}>Delete my account</button></div>
        </form>
      </section>
    </>
  );
}
