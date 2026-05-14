create table if not exists public.user_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cash_balance numeric not null default 100000,
  total_value numeric not null default 100000,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.user_agent_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  shares numeric not null default 0,
  average_nav numeric not null default 0,
  current_nav numeric not null default 0,
  market_value numeric not null default 0,
  status text not null default 'open'
    check (status in ('open', 'sell_only', 'frozen', 'liquidated', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_id)
);

create index if not exists user_agent_positions_user_status_idx
  on public.user_agent_positions(user_id, status, updated_at desc);

create index if not exists user_agent_positions_agent_status_idx
  on public.user_agent_positions(agent_id, status, updated_at desc);

create table if not exists public.user_agent_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  action text not null check (action in ('buy', 'sell', 'liquidation')),
  shares numeric not null,
  nav numeric not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists user_agent_transactions_user_created_idx
  on public.user_agent_transactions(user_id, created_at desc);

alter table public.user_portfolios enable row level security;
alter table public.user_agent_positions enable row level security;
alter table public.user_agent_transactions enable row level security;

drop policy if exists "user portfolios owner access" on public.user_portfolios;
create policy "user portfolios owner access"
  on public.user_portfolios for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user agent positions owner access" on public.user_agent_positions;
create policy "user agent positions owner access"
  on public.user_agent_positions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user agent transactions owner read" on public.user_agent_transactions;
create policy "user agent transactions owner read"
  on public.user_agent_transactions for select
  using (auth.uid() = user_id);
