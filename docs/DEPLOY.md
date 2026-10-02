# Deploying Stockpot

Free tiers throughout: **Supabase** (database + sign-in), **Vercel** (web app + evening cron),
**GitHub Actions** (nightly ML). About 30 minutes the first time.

Secrets (passwords, secret keys, connection strings) go only into the Supabase, Vercel and GitHub
dashboards, or a local `.env.production.local` file, which git ignores. Never commit them.

## 1. Supabase project

1. At [supabase.com](https://supabase.com) → **New project**: name `stockpot`, region **Mumbai (ap-south-1)**,
   generate a strong database password and save it in your password manager.
2. **Connect** (top bar) → copy two connection strings, with your password filled in:
   - **Transaction pooler** (port `6543`) → used by Vercel.
   - **Session pooler** (port `5432`) → used by GitHub Actions. (The “Direct connection” is IPv6-only and won’t
     work from GitHub.)
3. Save both locally in `.env.production.local` (git-ignored) so the schema can be applied from your machine:

   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   SESSION_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```

4. Apply the schema (creates every table, with row level security on):

   ```bash
   npx supabase db push --db-url "$(grep ^SESSION_DATABASE_URL .env.production.local | cut -d= -f2-)"
   ```

5. **Project Settings → API Keys**: note the **publishable key** (`sb_publishable_…`) and create/copy a
   **secret key** (`sb_secret_…`).

## 2. Sign-in emails (Gmail SMTP)

Supabase’s built-in mailer sends only a couple of emails an hour. A dedicated Gmail account works for free
(about 500 emails a day):

1. Create a new Gmail account for the app, turn on **2-Step Verification**, then create an
   **App password** (Google Account → Security → App passwords).
2. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email: the new Gmail address · Sender name: `Stockpot`
   - Host `smtp.gmail.com` · Port `465` · Username: the Gmail address · Password: the app password
3. **Authentication → Emails → Templates**: for **Confirm signup**, **Magic link** and **Reset password**, paste
   the subject and HTML from this repo:

   | Template | Subject | HTML |
   |---|---|---|
   | Confirm signup | Confirm your email for Stockpot | [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html) |
   | Magic link | Your Stockpot sign-in link | [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html) |
   | Reset password | Reset your Stockpot password | [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) |

## 3. Auth settings

Supabase → **Authentication**:

- **Sign In / Providers → Email**: enabled, **Confirm email** on; minimum password length **8**;
  password requirements **letters and digits**.
- **URL Configuration** (after step 4 gives you the Vercel address):
  - Site URL: `https://<your-app>.vercel.app`
  - Redirect URLs: `https://<your-app>.vercel.app/**`

## 4. Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import
   `Pratyush1427/stockpot`. Name the project `stockpot` to get `stockpot.vercel.app` if it’s free.
2. **Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Transaction pooler string (port 6543) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` |
   | `CRON_SECRET` | any long random string (e.g. `openssl rand -hex 32`) |
   | `NEXT_PUBLIC_AUTH_GOOGLE` | `false` (until step 6) |

3. Deploy. `vercel.json` already pins functions to Mumbai (`bom1`, next to the database) and schedules the
   evening cron that locks in closing prices.
4. Back in Supabase, set the Site URL and Redirect URLs (step 3) to the real address.

## 5. Nightly ML (GitHub Actions)

1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `DATABASE_URL` = the **Session pooler** string (port 5432).
2. **Actions → Nightly ML → Run workflow**, mode **retrain**, once. It trains the models (about 6 minutes) and
   writes the first scores. After that it runs itself every weekday at 19:00 IST.

## 6. Google sign-in (optional)

1. [Google Cloud Console](https://console.cloud.google.com) → new project → **APIs & Services → OAuth consent
   screen**: External, app name Stockpot, your support email.
2. **Credentials → Create credentials → OAuth client ID** → Web application. Authorized redirect URI:
   `https://<ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Sign In / Providers → Google**: enable, paste the client ID and secret.
4. Vercel: set `NEXT_PUBLIC_AUTH_GOOGLE` to `true` and redeploy.

## Checklist after deploying

- Sign up with a real email → confirmation email arrives → welcome screen → consent → My buckets.
- Add a pick: it shows “Locks in at the next close”, and fills after the next close.
- Models page shows test results (after the first ML run).
- Before opening sign-up widely, have someone familiar with SEBI rules review the live site.

## Free-tier notes

- Vercel’s Hobby plan is for non-commercial use.
- Supabase pauses projects after 7 days without activity; the nightly ML job keeps it active.
- Yahoo Finance may rate-limit heavy traffic; prices are cached in Postgres to soften that.
