-- Picks can carry the user's own quantity and buy price.
--
-- quantity:      units (shares or fund units); 1 for picks made before this change.
-- price_source:  'manual' when the user typed the buy price, 'close' when it was
--                filled from the closing price of entry_date (the original behaviour).
-- Bucket returns become value-weighted: total P&L / total invested.

alter table public.picks
  add column quantity double precision not null default 1 check (quantity > 0),
  add column price_source text not null default 'close' check (price_source in ('close', 'manual'));
