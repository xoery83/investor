create table if not exists public.market_quotes_cache (
  symbol text primary key,
  name text,
  price numeric not null default 0,
  price_source text not null default 'regular'
    check (price_source in ('pre', 'regular', 'post')),
  currency text not null default 'USD',
  exchange text,
  market_state text,
  asset_type text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_quotes_cache_fetched_at_idx
  on public.market_quotes_cache(fetched_at desc);
