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

create index if not exists user_profiles_role_idx
  on public.user_profiles(role);

alter table public.agents
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'public', 'system')),
  add column if not exists creator_type text not null default 'user'
    check (creator_type in ('admin', 'user')),
  add column if not exists lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'paused', 'retired', 'archived'));

create index if not exists agents_owner_user_id_idx
  on public.agents(owner_user_id);

create index if not exists agents_visibility_created_at_idx
  on public.agents(visibility, created_at desc);

update public.agents
set
  visibility = 'system',
  creator_type = 'admin',
  lifecycle_status = 'active'
where owner_user_id is null
  and visibility = 'private';

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    display_name,
    role,
    plan_status
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    'free',
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();
