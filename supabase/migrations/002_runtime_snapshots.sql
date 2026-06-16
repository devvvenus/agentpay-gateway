create table if not exists runtime_snapshots (
  id text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table runtime_snapshots enable row level security;
