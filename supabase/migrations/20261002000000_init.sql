-- Stockpot: multi-user schema.
--
-- Per-user data (buckets, picks, watchlist, profiles) is keyed to Supabase Auth
-- users and removed with them. Market data and ML output are shared.
--
-- Every table has row level security ON with no policies, so Supabase's public
-- Data API can't read or write any of it. The app reaches the database only
-- from its own server code, which scopes every query to the signed-in user.

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  avatar_url text,
  -- When the user agreed that this is an educational project, not advice.
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- buckets
-- A bucket is a named, private collection of picks: a game, not a portfolio.

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index buckets_user_idx on public.buckets (user_id, created_at);

-- --------------------------------------------------------------------- picks
-- One instrument in a bucket. No quantities or money: every pick counts
-- equally. Prices are end-of-day only. A pick enters at the close of
-- entry_date and, once removed, exits at the close of exit_date; the prices
-- stay null until those closes are known.

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.buckets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  added_at timestamptz not null default now(),
  entry_date date not null,
  entry_price double precision check (entry_price > 0),
  removed_at timestamptz,
  exit_date date,
  exit_price double precision check (exit_price > 0),
  check ((removed_at is null) = (exit_date is null))
);
-- An instrument can be open only once per bucket (it can be re-added after removal).
create unique index picks_open_once on public.picks (bucket_id, symbol) where removed_at is null;
create index picks_bucket_idx on public.picks (bucket_id, added_at);
create index picks_user_idx on public.picks (user_id);
-- Picks still waiting for a closing price, for the evening fill.
create index picks_pending_idx on public.picks (entry_date) where entry_price is null;

-- ----------------------------------------------------------------- watchlist
-- Stocks a user follows that aren't in any index tab.

create table public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

-- --------------------------------------------------------------- shared data

-- Last successful market payload per key, so a cold start during a Yahoo
-- outage still serves real (clearly stale) numbers instead of nothing.
create table public.market_cache (
  key text primary key,
  payload text not null,
  fetched_at bigint not null
);

-- Written by the Python pipeline (python -m ml.run); read-only for the app.
create table public.ml_scores (
  symbol text not null,
  model text not null,
  as_of text not null,
  prob double precision not null,
  pct_rank double precision not null,
  drivers text,
  in_universe boolean not null default true,
  primary key (symbol, model)
);
create table public.ml_model (
  id integer primary key check (id = 1),
  version text not null,
  report text not null,
  predicted_at text not null
);

-- --------------------------------------------------------------------- lockdown

alter table public.profiles enable row level security;
alter table public.buckets enable row level security;
alter table public.picks enable row level security;
alter table public.watchlist enable row level security;
alter table public.market_cache enable row level security;
alter table public.ml_scores enable row level security;
alter table public.ml_model enable row level security;
