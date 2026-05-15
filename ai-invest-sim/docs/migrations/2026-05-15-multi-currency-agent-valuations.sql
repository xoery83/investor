alter table public.agents
  add column if not exists base_currency text not null default 'USD';

alter table public.agent_holdings
  add column if not exists currency text not null default 'USD',
  add column if not exists average_cost_base numeric not null default 0,
  add column if not exists current_price_base numeric not null default 0,
  add column if not exists market_value_local numeric not null default 0,
  add column if not exists market_value_base numeric not null default 0,
  add column if not exists fx_rate_to_base numeric not null default 1,
  add column if not exists fx_fetched_at timestamptz;

update public.agent_holdings
set
  currency = coalesce(nullif(currency, ''), 'USD'),
  average_cost_base = case
    when coalesce(average_cost_base, 0) = 0 then coalesce(average_cost, 0)
    else average_cost_base
  end,
  current_price_base = case
    when coalesce(current_price_base, 0) = 0 then coalesce(current_price, 0)
    else current_price_base
  end,
  market_value_local = case
    when coalesce(market_value_local, 0) = 0 then coalesce(market_value, 0)
    else market_value_local
  end,
  market_value_base = case
    when coalesce(market_value_base, 0) = 0 then coalesce(market_value, 0)
    else market_value_base
  end,
  fx_rate_to_base = case
    when coalesce(fx_rate_to_base, 0) = 0 then 1
    else fx_rate_to_base
  end;

alter table public.agent_valuations
  add column if not exists base_currency text not null default 'USD';

create table if not exists public.fx_rates_cache (
  from_currency text not null,
  to_currency text not null,
  rate numeric not null default 1,
  provider text not null default 'yahoo',
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (from_currency, to_currency)
);

create index if not exists fx_rates_cache_fetched_at_idx
  on public.fx_rates_cache(fetched_at desc);
