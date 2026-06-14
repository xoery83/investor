create table if not exists public.agent_initialization_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft',
  current_version integer not null default 0,
  max_revisions integer not null default 5,
  approved_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  executed_at timestamptz
);

create index if not exists agent_initialization_sessions_agent_id_idx
  on public.agent_initialization_sessions(agent_id, created_at desc);

create index if not exists agent_initialization_sessions_user_id_idx
  on public.agent_initialization_sessions(user_id, created_at desc);

create table if not exists public.agent_initialization_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_initialization_sessions(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  trade_proposal_id uuid references public.trade_proposals(id) on delete set null,
  version_number integer not null,
  source text not null default 'initial',
  user_feedback text,
  proposal jsonb not null default '{}'::jsonb,
  thesis jsonb not null default '{}'::jsonb,
  self_critique jsonb not null default '{}'::jsonb,
  risk_validation jsonb not null default '{}'::jsonb,
  status text not null default 'current',
  created_at timestamptz not null default now()
);

create unique index if not exists agent_initialization_versions_session_version_idx
  on public.agent_initialization_versions(session_id, version_number);

create index if not exists agent_initialization_versions_agent_id_idx
  on public.agent_initialization_versions(agent_id, created_at desc);

create table if not exists public.agent_initialization_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_initialization_sessions(id) on delete cascade,
  version_id uuid references public.agent_initialization_versions(id) on delete set null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  role text not null,
  message_type text not null default 'message',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_initialization_messages_session_id_idx
  on public.agent_initialization_messages(session_id, created_at asc);

alter table public.agent_initialization_sessions
  add constraint agent_initialization_sessions_approved_version_fk
  foreign key (approved_version_id)
  references public.agent_initialization_versions(id)
  on delete set null;

create table if not exists public.agent_holding_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  holding_id uuid references public.agent_holdings(id) on delete set null,
  symbol text not null,
  asset_type text,
  quantity numeric not null default 0,
  price_local numeric not null default 0,
  currency text not null default 'USD',
  fx_rate_to_base numeric not null default 1,
  market_value_local numeric not null default 0,
  market_value_base numeric not null default 0,
  weight numeric not null default 0,
  base_currency text not null default 'USD',
  price_source text,
  market_state text,
  recorded_at timestamptz not null default now()
);

create index if not exists agent_holding_snapshots_agent_symbol_recorded_idx
  on public.agent_holding_snapshots(agent_id, symbol, recorded_at desc);

create index if not exists agent_holding_snapshots_agent_recorded_idx
  on public.agent_holding_snapshots(agent_id, recorded_at desc);
