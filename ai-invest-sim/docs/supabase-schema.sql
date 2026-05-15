-- Baseline schema for AI Investment Simulator.
-- Apply carefully in Supabase SQL editor or migrations. Existing production
-- tables may require ALTER statements instead of CREATE TABLE.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'free'
    check (role in ('admin', 'free', 'plus', 'pro')),
  plan_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  visibility text not null default 'private'
    check (visibility in ('private', 'public', 'system')),
  creator_type text not null default 'user'
    check (creator_type in ('admin', 'user')),
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('draft', 'active', 'paused', 'retired', 'archived')),
  manual_trade_allowed boolean not null default true,
  proposal_execution_required boolean not null default false,
  name text not null,
  description text,
  philosophy text,
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  initial_capital numeric not null default 100000,
  current_value numeric not null default 100000,
  cash_balance numeric not null default 100000,
  base_currency text not null default 'USD',
  is_active boolean not null default true,
  rebalance_frequency text not null default 'daily'
    check (rebalance_frequency in ('daily', 'weekly', 'monthly')),
  model_name text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused_by_agent', 'exited', 'force_exited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_id)
);

create index if not exists agent_follows_user_status_idx
  on public.agent_follows(user_id, status, created_at desc);

create index if not exists agent_follows_agent_status_idx
  on public.agent_follows(agent_id, status, created_at desc);

create table if not exists public.agent_holdings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  symbol text not null,
  asset_name text,
  asset_type text not null default 'stock',
  quantity numeric not null default 0,
  average_cost numeric not null default 0,
  average_cost_base numeric not null default 0,
  current_price numeric not null default 0,
  current_price_base numeric not null default 0,
  currency text not null default 'USD',
  market_value numeric not null default 0,
  market_value_local numeric not null default 0,
  market_value_base numeric not null default 0,
  fx_rate_to_base numeric not null default 1,
  fx_fetched_at timestamptz,
  weight numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_holdings_agent_id_idx
  on public.agent_holdings(agent_id);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade,
  run_type text not null default 'manual',
  summary text,
  recommendation jsonb,
  risks jsonb,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_agent_id_created_at_idx
  on public.agent_runs(agent_id, created_at desc);

create table if not exists public.agent_valuations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  total_value numeric not null default 0,
  cash_value numeric not null default 0,
  holdings_value numeric not null default 0,
  base_currency text not null default 'USD',
  daily_return numeric not null default 0,
  cumulative_return numeric not null default 0,
  annualized_return numeric not null default 0,
  recorded_at timestamptz not null default now()
);

create index if not exists agent_valuations_agent_id_recorded_at_idx
  on public.agent_valuations(agent_id, recorded_at asc);

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

create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.agents(id) on delete cascade,
  strategy_type text not null default 'conservative_growth',
  objective text not null,
  target_annual_return_min numeric not null default 8,
  target_annual_return_max numeric not null default 15,
  max_drawdown_pct numeric not null default 20,
  target_markets jsonb not null default '[]'::jsonb,
  allowed_assets jsonb not null default '[]'::jsonb,
  excluded_assets jsonb not null default '[]'::jsonb,
  manager_instructions text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_policies (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.agents(id) on delete cascade,
  min_cash_pct numeric not null default 5,
  max_cash_pct numeric not null default 25,
  max_single_stock_pct numeric not null default 20,
  max_etf_pct numeric not null default 40,
  max_one_trade_pct numeric not null default 10,
  max_weekly_turnover_pct numeric not null default 15,
  max_drawdown_pct numeric not null default 20,
  prohibited_assets jsonb not null default '[]'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_configs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.agents(id) on delete cascade,
  daily_enabled boolean not null default true,
  daily_prompt_template_key text not null default 'conservative_daily_v1',
  weekly_enabled boolean not null default true,
  weekly_prompt_template_key text not null default 'conservative_weekly_v1',
  escalation_enabled boolean not null default true,
  escalation_prompt_template_key text not null default 'conservative_escalation_v1',
  validator_enabled boolean not null default true,
  validator_prompt_template_key text not null default 'conservative_validator_v1',
  max_revision_attempts integer not null default 2,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_investment_universes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  universe_name text not null,
  market_scope jsonb not null default '[]'::jsonb,
  allowed_exchanges jsonb not null default '[]'::jsonb,
  currency_scope jsonb not null default '[]'::jsonb,
  allowed_asset_types jsonb not null default '[]'::jsonb,
  core_etfs jsonb not null default '[]'::jsonb,
  core_stocks jsonb not null default '[]'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  excluded_assets jsonb not null default '[]'::jsonb,
  generation_prompt text,
  generation_result jsonb not null default '{}'::jsonb,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  source text not null default 'openai'
    check (source in ('openai', 'fallback', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  run_type text not null,
  name text not null,
  version integer not null default 1,
  system_prompt text not null,
  user_prompt_template text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_proposals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  source_run_id uuid references public.agent_runs(id) on delete set null,
  status text not null default 'pending',
  proposal jsonb not null default '{}'::jsonb,
  validator_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.validator_results (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  trade_proposal_id uuid references public.trade_proposals(id) on delete set null,
  validation_status text not null default 'pending',
  violations jsonb not null default '[]'::jsonb,
  final_action_allowed boolean not null default false,
  revision_attempt integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
