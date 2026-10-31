# Generation plans after branch integration

The existing Google/Supabase login and PostgreSQL database are retained. The Plans and photo panels read the same `/api/world-account` allowance as `WorldGeneration`; there is no independent client-side allowance or default fabricated balance on errors.

Each account receives three World Labs generation requests during the configurable judging window (maximum 30 days). The FastAPI API verifies the existing Supabase session, atomically reserves an account allowance and global credits, deduplicates submissions, stores asynchronous job state and polls safely. Unknown/failing billing outcomes remain reserved for owner review. Reopening worlds is free.

The existing ₩10,000 / 15-world paid-pack UI and local mock checkout are preserved as a clearly labelled simulation. Only the provided test card numbers are accepted. They do not contact a payment service, mutate the real account allowance, or start a World Labs call. Real payment processing and paid credit grants are not enabled.

Migration order in the existing project: existing journal schema and upgrades 002–006, existing 007_generation_credits.sql, 008_world_generation_allowance.sql, then 009_unify_generation_allowance.sql. Migration 009 imports any historical legacy usage conservatively, disables new generation if such usage exists, and revokes the old reservation/paid-credit RPCs. Completed journal worlds remain stored; reconcile any historical job/billing records before enabling new requests. Do not rerun earlier migrations that have already been applied; inspect existing migration state first, including any previously applied independently numbered world-allowance migration.

The old Supabase `generate-memory` Edge Function is now a no-charge HTTP 410 compatibility endpoint. Deploy this retirement if the old function was previously deployed; remove old WORLD_GENERATION_UPSTREAM_URL/TOKEN settings. The active application does not invoke it. This avoids two independent quotas or paid upstreams granting another set of three.

Backend configuration remains server-only: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WLT_API_KEY, WORLD_GENERATION_ENABLED, and the configured model/provider settings for symbolic generation. Frontend Supabase URL/publishable key are public client configuration. Dates, global credit cap and rate limits reside in world_generation_demo. New generation stays disabled by default until explicit configuration/enablement.

No database migration, Edge Function deployment, provider call, payment or Vercel release is performed by merging source code.
