alter table public.agents
  drop constraint if exists agents_lifecycle_status_check;

alter table public.agents
  add constraint agents_lifecycle_status_check
  check (lifecycle_status in ('draft', 'active', 'paused', 'retired', 'archived'));

alter table public.agents
  add column if not exists manual_trade_allowed boolean not null default true,
  add column if not exists proposal_execution_required boolean not null default false;

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

alter table public.agent_follows enable row level security;

drop policy if exists "agent follows readable by owner" on public.agent_follows;
create policy "agent follows readable by owner"
  on public.agent_follows for select
  using (auth.uid() = user_id);

drop policy if exists "agent follows insert by owner" on public.agent_follows;
create policy "agent follows insert by owner"
  on public.agent_follows for insert
  with check (auth.uid() = user_id);

drop policy if exists "agent follows update by owner" on public.agent_follows;
create policy "agent follows update by owner"
  on public.agent_follows for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
