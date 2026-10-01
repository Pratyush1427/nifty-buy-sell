import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** Supabase client for API routes: reads the session from cookies and writes refreshed ones back. */
export function createSupabaseServer(req, res) {
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? '').map(({ name, value }) => ({ name, value: value ?? '' }));
      },
      setAll(cookies) {
        const prev = res.getHeader('Set-Cookie');
        const existing = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
        res.setHeader('Set-Cookie', [
          ...existing,
          ...cookies.map(({ name, value, options }) => serializeCookieHeader(name, value, options)),
        ]);
      },
    },
  });
}
