create extension if not exists pgcrypto;

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

create index if not exists agent_profiles_agent_id_idx
  on public.agent_profiles(agent_id);

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

create index if not exists risk_policies_agent_id_idx
  on public.risk_policies(agent_id);

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

create index if not exists workflow_configs_agent_id_idx
  on public.workflow_configs(agent_id);

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

create index if not exists prompt_templates_run_type_idx
  on public.prompt_templates(run_type);

create table if not exists public.trade_proposals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  source_run_id uuid references public.agent_runs(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'executed', 'superseded')),
  proposal jsonb not null default '{}'::jsonb,
  validator_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_proposals_agent_id_created_at_idx
  on public.trade_proposals(agent_id, created_at desc);

create table if not exists public.validator_results (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  trade_proposal_id uuid references public.trade_proposals(id) on delete set null,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'approved', 'needs_revision', 'human_review_required', 'rejected')),
  violations jsonb not null default '[]'::jsonb,
  final_action_allowed boolean not null default false,
  revision_attempt integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists validator_results_agent_id_created_at_idx
  on public.validator_results(agent_id, created_at desc);

insert into public.agent_profiles (
  agent_id,
  strategy_type,
  objective,
  target_annual_return_min,
  target_annual_return_max,
  max_drawdown_pct,
  target_markets,
  allowed_assets,
  excluded_assets,
  manager_instructions,
  config
)
select
  id,
  'conservative_growth',
  'Steady long-term growth with controlled drawdown and disciplined risk management.',
  8,
  15,
  20,
  '["US large cap equities", "US ETFs"]'::jsonb,
  '["US large cap stocks", "broad market ETFs", "sector ETFs", "gold ETF", "cash"]'::jsonb,
  '["options", "leverage", "crypto", "penny stocks"]'::jsonb,
  'Prefer quality companies, diversified ETFs, controlled turnover, and clear risk/reward before proposing a rebalance.',
  '{}'::jsonb
from public.agents
on conflict (agent_id) do nothing;

insert into public.risk_policies (
  agent_id,
  min_cash_pct,
  max_cash_pct,
  max_single_stock_pct,
  max_etf_pct,
  max_one_trade_pct,
  max_weekly_turnover_pct,
  max_drawdown_pct,
  prohibited_assets,
  policy
)
select
  id,
  5,
  25,
  20,
  40,
  10,
  15,
  20,
  '["options", "leverage", "crypto", "penny stocks"]'::jsonb,
  '{}'::jsonb
from public.agents
on conflict (agent_id) do nothing;

insert into public.workflow_configs (
  agent_id,
  daily_enabled,
  daily_prompt_template_key,
  weekly_enabled,
  weekly_prompt_template_key,
  escalation_enabled,
  escalation_prompt_template_key,
  validator_enabled,
  validator_prompt_template_key,
  max_revision_attempts,
  config
)
select
  id,
  true,
  'conservative_daily_v1',
  true,
  'conservative_weekly_v1',
  true,
  'conservative_escalation_v1',
  true,
  'conservative_validator_v1',
  2,
  '{}'::jsonb
from public.agents
on conflict (agent_id) do nothing;
