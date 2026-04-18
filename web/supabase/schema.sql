-- Supabase PostgreSQL Schema for Summary Arena

-- Extensions
create extension if not exists "uuid-ossp";

-- Table: runs
-- Represents a single benchmark execution from the CLI
create table public.runs (
    id uuid primary key default uuid_generate_v4(),
    run_id uuid not null unique, -- matches the run_id from the CLI results JSON
    model text not null,
    provider text not null,
    benchmark_version text not null default '1.0',
    config jsonb not null default '{}'::jsonb,
    timestamp timestamp with time zone not null default now(),
    uploader_id uuid references auth.users(id) on delete set null,
    created_at timestamp with time zone not null default now()
);

-- Table: test_results
-- Represents a single generated summary from a run
create table public.test_results (
    id uuid primary key default uuid_generate_v4(),
    run_id uuid not null references public.runs(run_id) on delete cascade,
    test_id text not null,
    category text not null,
    source_text text,
    summary text not null,
    input_tokens integer,
    output_tokens integer,
    latency_ms integer,
    created_at timestamp with time zone not null default now()
);

alter table public.test_results
    add constraint test_results_run_test_unique unique (run_id, test_id);

-- Table: votes
-- Represents human evaluations from the crowdsourced Arena
create type vote_outcome as enum ('a', 'b', 'tie', 'both_bad');

create table public.votes (
    id uuid primary key default uuid_generate_v4(),
    test_id text not null,
    model_a text not null,
    model_b text not null,
    outcome vote_outcome not null,
    created_at timestamp with time zone not null default now()
);

-- Table: model_verifications
-- Represents a moderator assertion that a model identity has been checked.
create table public.model_verifications (
    id uuid primary key default uuid_generate_v4(),
    model text not null,
    provider text not null,
    verified_by text,
    verified_by_user_id uuid references auth.users(id) on delete set null,
    verified_at timestamp with time zone not null default now(),
    created_at timestamp with time zone not null default now(),
    unique (model, provider)
);

create table public.upload_access_tokens (
    token_hash text primary key,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_by_label text not null,
    created_at timestamp with time zone not null default now(),
    expires_at timestamp with time zone not null,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone
);

-- Indexes for performance
create index idx_test_results_run_id on public.test_results(run_id);
create index idx_test_results_test_id on public.test_results(test_id);
create index idx_votes_test_id on public.votes(test_id);
create index idx_votes_models on public.votes(model_a, model_b);
create index idx_model_verifications_model_provider on public.model_verifications(model, provider);
create index idx_runs_uploader_id on public.runs(uploader_id);
create index idx_upload_access_tokens_expires_at on public.upload_access_tokens(expires_at);

-- RLS (Row Level Security) Policies
-- For the public MVP, allow everyone to insert runs/votes, and read all.
alter table public.runs enable row level security;
alter table public.test_results enable row level security;
alter table public.votes enable row level security;
alter table public.model_verifications enable row level security;
alter table public.upload_access_tokens enable row level security;

create policy "Allow anonymous read runs" on public.runs for select using (true);
create policy "Allow anonymous insert runs" on public.runs for insert with check (true);

create policy "Allow anonymous read test_results" on public.test_results for select using (true);
create policy "Allow anonymous insert test_results" on public.test_results for insert with check (true);

create policy "Allow anonymous read votes" on public.votes for select using (true);
create policy "Allow anonymous insert votes" on public.votes for insert with check (true);

create policy "Allow anonymous read model_verifications" on public.model_verifications for select using (true);
