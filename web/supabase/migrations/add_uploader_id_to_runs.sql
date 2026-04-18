-- Migration: add uploader_id to runs
-- Run this once in the Supabase SQL editor for your existing project.

alter table public.runs
    add column if not exists uploader_id uuid references auth.users(id) on delete set null;

create index if not exists idx_runs_uploader_id on public.runs(uploader_id);
