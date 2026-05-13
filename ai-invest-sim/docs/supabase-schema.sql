-- Baseline schema for AI Investment Simulator.
-- Apply carefully in Supabase SQL editor or migrations. Existing production
-- tables may require ALTER statements instead of CREATE TABLE.

create extension if not exists pgcrypto;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  philosophy text,
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  initial_capital numeric not null default 100000,
  current_value numeric not null default 100000,
  cash_balance numeric not null default 100000,
  is_active boolean not null default true,
  rebalance_frequency text not null default 'daily'
    check (rebalance_frequency in ('daily', 'weekly', 'monthly')),
  model_name text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_holdings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  symbol text not null,
  asset_name text,
  asset_type text not null default 'stock',
  quantity numeric not null default 0,
  average_cost numeric not null default 0,
  current_price numeric not null default 0,
  market_value numeric not null default 0,
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
  daily_return numeric not null default 0,
  cumulative_return numeric not null default 0,
  annualized_return numeric not null default 0,
  recorded_at timestamptz not null default now()
);

create index if not exists agent_valuations_agent_id_recorded_at_idx
  on public.agent_valuations(agent_id, recorded_at asc);
