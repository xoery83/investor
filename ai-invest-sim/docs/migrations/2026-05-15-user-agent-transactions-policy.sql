drop policy if exists "user agent transactions owner insert" on public.user_agent_transactions;
create policy "user agent transactions owner insert"
  on public.user_agent_transactions for insert
  with check (auth.uid() = user_id);
