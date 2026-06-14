-- Portfolio Intelligence Layer + Copycat agent foundation.
-- Apply this in Supabase SQL editor before enabling the related app features.

alter table public.agents
  add column if not exists agent_mode text not null default 'ai_manager';

alter table public.agents
  drop constraint if exists agents_agent_mode_check;

alter table public.agents
  add constraint agents_agent_mode_check
  check (agent_mode in ('ai_manager', 'copycat'));

create table if not exists public.agent_memory_cards (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  memory_type text not null
    check (memory_type in (
      'thesis',
      'constraint',
      'user_preference',
      'rejected_idea',
      'approved_change',
      'risk_event',
      'universe_change',
      'execution_note',
      'copycat_source'
    )),
  title text not null,
  content text not null,
  symbols jsonb not null default '[]'::jsonb,
  importance integer not null default 3 check (importance between 1 and 5),
  confidence numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active'
    check (status in ('active', 'superseded', 'archived')),
  source_run_id uuid references public.agent_runs(id) on delete set null,
  source_trade_proposal_id uuid references public.trade_proposals(id) on delete set null,
  source_initialization_version_id uuid references public.agent_initialization_versions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_memory_cards_agent_status_idx
  on public.agent_memory_cards(agent_id, status, importance desc, updated_at desc);

create index if not exists agent_memory_cards_agent_type_idx
  on public.agent_memory_cards(agent_id, memory_type, status);

create table if not exists public.instrument_exposures (
  id uuid primary key default gen_random_uuid(),
  instrument_symbol text not null,
  instrument_name text,
  instrument_type text not null default 'etf',
  underlying_symbol text not null,
  underlying_name text,
  underlying_type text,
  weight numeric not null check (weight >= 0),
  currency text,
  source text not null default 'manual',
  source_url text,
  as_of date,
  confidence numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument_symbol, underlying_symbol, as_of)
);

create index if not exists instrument_exposures_instrument_idx
  on public.instrument_exposures(instrument_symbol, as_of desc);

create index if not exists instrument_exposures_underlying_idx
  on public.instrument_exposures(underlying_symbol, as_of desc);

create table if not exists public.market_price_history_cache (
  symbol text not null,
  price_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null,
  adj_close numeric,
  volume numeric,
  currency text not null default 'USD',
  provider text not null default 'yahoo',
  fetched_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (symbol, price_date, provider)
);

create index if not exists market_price_history_cache_symbol_date_idx
  on public.market_price_history_cache(symbol, price_date desc);

create table if not exists public.portfolio_evaluations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  evaluation_scope text not null
    check (evaluation_scope in (
      'current_portfolio',
      'initial_proposal',
      'rebalance_proposal',
      'copycat_snapshot'
    )),
  source_run_id uuid references public.agent_runs(id) on delete set null,
  trade_proposal_id uuid references public.trade_proposals(id) on delete set null,
  initialization_version_id uuid references public.agent_initialization_versions(id) on delete set null,
  benchmark_symbol text,
  period text not null default '1Y',
  base_currency text not null default 'USD',
  metrics jsonb not null default '{}'::jsonb,
  effective_exposures jsonb not null default '[]'::jsonb,
  overlap_warnings jsonb not null default '[]'::jsonb,
  target_fit_score numeric,
  target_return_probability numeric,
  summary text,
  source text not null default 'local'
    check (source in ('local', 'openai', 'hybrid', 'fallback')),
  created_at timestamptz not null default now()
);

create index if not exists portfolio_evaluations_agent_scope_created_idx
  on public.portfolio_evaluations(agent_id, evaluation_scope, created_at desc);

create index if not exists portfolio_evaluations_trade_proposal_idx
  on public.portfolio_evaluations(trade_proposal_id, created_at desc);

create table if not exists public.copycat_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_name text,
  description text,
  source_type text not null default 'manual'
    check (source_type in ('manual', '13f', 'fund_holdings', 'api')),
  source_url text,
  benchmark_symbol text,
  reporting_lag_days integer not null default 45,
  rebalance_frequency text not null default 'quarterly'
    check (rebalance_frequency in ('daily', 'weekly', 'monthly', 'quarterly')),
  default_base_currency text not null default 'USD',
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists copycat_sources_status_idx
  on public.copycat_sources(status, name);

alter table public.agents
  add column if not exists copycat_source_id uuid references public.copycat_sources(id) on delete set null;

create table if not exists public.copycat_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.copycat_sources(id) on delete cascade,
  report_date date not null,
  effective_date date,
  source_url text,
  total_reported_value numeric,
  base_currency text not null default 'USD',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, report_date)
);

create index if not exists copycat_source_snapshots_source_status_idx
  on public.copycat_source_snapshots(source_id, status, report_date desc);

create table if not exists public.copycat_source_holdings (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.copycat_source_snapshots(id) on delete cascade,
  symbol text not null,
  asset_name text,
  asset_type text not null default 'stock',
  weight numeric not null check (weight >= 0),
  reported_value numeric,
  quantity numeric,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (snapshot_id, symbol)
);

create index if not exists copycat_source_holdings_snapshot_weight_idx
  on public.copycat_source_holdings(snapshot_id, weight desc);

create index if not exists copycat_source_holdings_symbol_idx
  on public.copycat_source_holdings(symbol);
