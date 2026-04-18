create table if not exists public.upload_access_tokens (
    token_hash text primary key,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_by_label text not null,
    created_at timestamp with time zone not null default now(),
    expires_at timestamp with time zone not null,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone
);

alter table public.upload_access_tokens enable row level security;

create index if not exists idx_upload_access_tokens_expires_at on public.upload_access_tokens (expires_at);
