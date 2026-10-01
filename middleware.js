import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Pages anyone can open. Everything else needs a signed-in user who has
// accepted the terms. API routes check for themselves (lib/api.js).
const PUBLIC_PAGES = ['/login', '/signup', '/check-email', '/forgot-password', '/terms', '/disclaimer'];
const AUTH_ONLY_PAGES = ['/login', '/signup', '/check-email', '/forgot-password'];
// Signed in, but allowed before accepting the terms.
const PRE_CONSENT_PAGES = ['/welcome', '/reset-password', '/terms', '/disclaimer'];

const matches = (path, list) => list.some((p) => path === p || path.startsWith(`${p}/`));

export async function middleware(request) {
  let response = NextResponse.next({ request });

  // Refresh the session if needed and pass the new cookies on.
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const path = request.nextUrl.pathname;
  if (path.startsWith('/api/')) return response;

  const redirect = (to, withNext) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = withNext ? `?next=${encodeURIComponent(path + request.nextUrl.search)}` : '';
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!claims) return matches(path, PUBLIC_PAGES) ? response : redirect('/login', path !== '/');
  if (matches(path, AUTH_ONLY_PAGES)) return redirect('/');
  if (!claims.app_metadata?.accepted_terms_at && !matches(path, PRE_CONSENT_PAGES)) return redirect('/welcome', path !== '/');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)'],
};
