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

create index if not exists agent_investment_universes_agent_status_idx
  on public.agent_investment_universes(agent_id, status, version desc);

create unique index if not exists agent_investment_universes_one_active_idx
  on public.agent_investment_universes(agent_id)
  where status = 'active';
