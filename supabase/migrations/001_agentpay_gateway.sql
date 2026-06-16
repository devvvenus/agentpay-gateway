create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  address text not null,
  network text not null default 'arc-testnet',
  role text not null check (role in ('buyer', 'seller')),
  created_at timestamptz not null default now()
);

create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  name text not null,
  wallet_address text not null,
  created_at timestamptz not null default now()
);

create table if not exists resources (
  id text primary key,
  provider_id uuid references providers(id),
  name text not null,
  description text not null,
  adapter_type text not null,
  price_usdc numeric(18, 6) not null,
  expected_value numeric(8, 4) not null default 0.5,
  freshness_score numeric(8, 4) not null default 0.5,
  confidence_score numeric(8, 4) not null default 0.5,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists adapter_configs (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null references resources(id) on delete cascade,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  budget_usdc numeric(18, 6) not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  total_spend_usdc numeric(18, 6) not null default 0,
  output jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  resource_id text references resources(id),
  step_type text not null,
  status text not null,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists agent_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  resource_id text not null references resources(id),
  decision text not null check (decision in ('pay', 'skip', 'cache')),
  score numeric(8, 4) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null references resources(id),
  adapter_type text not null,
  amount_usdc numeric(18, 6) not null,
  network text not null,
  buyer_wallet text not null,
  seller_wallet text not null,
  payment_identifier text not null unique,
  tx_or_settlement_ref text,
  status text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  payment_event_id uuid not null references payment_events(id),
  resource_id text not null references resources(id),
  receipt jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists provider_earnings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id),
  resource_id text references resources(id),
  amount_usdc numeric(18, 6) not null,
  network text not null,
  settlement_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists cached_artifacts (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null references resources(id),
  cache_key text not null,
  content_hash text not null,
  artifact jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(resource_id, cache_key)
);

create table if not exists citations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete cascade,
  resource_id text references resources(id),
  source_url text,
  title text,
  citation_receipt jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id),
  key_hash text not null,
  label text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  target text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
