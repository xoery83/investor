-- AI-assisted data ingestion audit trail.
-- Apply in Supabase before using /api/admin/data-ingestion/* endpoints.

create table if not exists public.data_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null
    check (job_type in (
      'copycat_source_discovery',
      'copycat_snapshot',
      'etf_lookthrough'
    )),
  status text not null default 'queued'
    check (status in (
      'queued',
      'running',
      'needs_review',
      'completed',
      'failed'
    )),
  requested_by uuid references auth.users(id) on delete set null,
  target_symbol text,
  target_name text,
  source_url text,
  raw_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  extracted_json jsonb not null default '{}'::jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_ingestion_jobs_type_status_idx
  on public.data_ingestion_jobs(job_type, status, created_at desc);

create index if not exists data_ingestion_jobs_requested_by_idx
  on public.data_ingestion_jobs(requested_by, created_at desc);

create index if not exists data_ingestion_jobs_target_symbol_idx
  on public.data_ingestion_jobs(target_symbol, created_at desc);
