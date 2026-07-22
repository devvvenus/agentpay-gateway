-- Harden the application tables before exposing the project through Supabase Data API.
-- The app uses SUPABASE_SERVICE_ROLE_KEY only from server-side code; browsers do
-- not need direct table privileges.

alter table users enable row level security;
alter table wallets enable row level security;
alter table providers enable row level security;
alter table resources enable row level security;
alter table adapter_configs enable row level security;
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;
alter table agent_decisions enable row level security;
alter table payment_events enable row level security;
alter table receipts enable row level security;
alter table provider_earnings enable row level security;
alter table cached_artifacts enable row level security;
alter table citations enable row level security;
alter table api_keys enable row level security;
alter table audit_logs enable row level security;
alter table runtime_snapshots enable row level security;

revoke all on table users, wallets, providers, resources, adapter_configs, agent_runs,
  agent_steps, agent_decisions, payment_events, receipts, provider_earnings,
  cached_artifacts, citations, api_keys, audit_logs, runtime_snapshots from anon, authenticated;
grant all on table users, wallets, providers, resources, adapter_configs, agent_runs,
  agent_steps, agent_decisions, payment_events, receipts, provider_earnings,
  cached_artifacts, citations, api_keys, audit_logs, runtime_snapshots to service_role;