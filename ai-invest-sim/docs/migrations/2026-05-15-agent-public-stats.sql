create or replace function public.get_agent_public_stats(agent_ids uuid[])
returns table (
  agent_id uuid,
  follower_count bigint,
  follower_position_value numeric
)
language sql
security definer
set search_path = public
as $$
  with requested_agents as (
    select unnest(agent_ids) as agent_id
  ),
  follow_counts as (
    select
      agent_follows.agent_id,
      count(*)::bigint as follower_count
    from public.agent_follows
    where agent_follows.agent_id = any(agent_ids)
      and agent_follows.status = 'active'
    group by agent_follows.agent_id
  ),
  position_values as (
    select
      user_agent_positions.agent_id,
      coalesce(sum(user_agent_positions.market_value), 0)::numeric as follower_position_value
    from public.user_agent_positions
    where user_agent_positions.agent_id = any(agent_ids)
      and user_agent_positions.status in ('open', 'sell_only', 'frozen')
    group by user_agent_positions.agent_id
  )
  select
    requested_agents.agent_id,
    coalesce(follow_counts.follower_count, 0)::bigint as follower_count,
    coalesce(position_values.follower_position_value, 0)::numeric as follower_position_value
  from requested_agents
  left join follow_counts on follow_counts.agent_id = requested_agents.agent_id
  left join position_values on position_values.agent_id = requested_agents.agent_id;
$$;

grant execute on function public.get_agent_public_stats(uuid[]) to anon, authenticated;
