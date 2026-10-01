import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/client';
import { supabaseBrowser } from '../lib/supabase/browser';
import Avatar from './Avatar';

export default function UserMenu() {
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { api('/api/profile').then(setProfile).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    window.location.assign('/login');
  };

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen(!open)}>
        <Avatar avatar={profile?.avatar} name={profile?.displayName || ''} size={30} />
      </button>
      {open && (
        <div className="user-menu-pop" role="menu">
          {profile && (
            <div className="who">
              <strong>{profile.displayName}</strong>
              <div className="muted tiny">{profile.email}</div>
            </div>
          )}
          <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>Account</Link>
          <Link href="/disclaimer" role="menuitem" onClick={() => setOpen(false)}>Disclaimer</Link>
          <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
