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
    created_at timestamp with time zone not null default now()
);

-- Table: test_results
-- Represents a single generated summary from a run
create table public.test_results (
    id uuid primary key default uuid_generate_v4(),
    run_id uuid not null references public.runs(run_id) on delete cascade,
    test_id text not null,
    category text not null,
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

-- Indexes for performance
create index idx_test_results_run_id on public.test_results(run_id);
create index idx_test_results_test_id on public.test_results(test_id);
create index idx_votes_test_id on public.votes(test_id);
create index idx_votes_models on public.votes(model_a, model_b);

-- RLS (Row Level Security) Policies
-- For the public MVP, allow everyone to insert runs/votes, and read all.
alter table public.runs enable row level security;
alter table public.test_results enable row level security;
alter table public.votes enable row level security;

create policy "Allow anonymous read runs" on public.runs for select using (true);
create policy "Allow anonymous insert runs" on public.runs for insert with check (true);

create policy "Allow anonymous read test_results" on public.test_results for select using (true);
create policy "Allow anonymous insert test_results" on public.test_results for insert with check (true);

create policy "Allow anonymous read votes" on public.votes for select using (true);
create policy "Allow anonymous insert votes" on public.votes for insert with check (true);
