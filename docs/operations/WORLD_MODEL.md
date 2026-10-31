# World generation model

New MemoVerse worlds use `marble-1.1`. The backend sends the model returned by the committed database reservation, not a client-supplied model or a frontend environment variable. Ordinary single-photo generation costs 1,580 World Labs API credits: 80 for panorama preparation and 1,500 for the world. A supplied panorama can cost 1,500; the reservation remains conservatively 1,580. This does not request optional premium mesh exports.

Sources, checked November 1, 2026: [model identifiers](https://docs.worldlabs.ai/api/models) and [API pricing](https://docs.worldlabs.ai/api/pricing).

`frontend/supabase/016_marble_1_1_model.sql` records the configuration change. It atomically changes only `world_generation_demo.model` and `credits_per_job`, recognizes an already-applied change, and aborts for unreviewed custom settings. It does not change budgets, enablement, expiration, concurrency, account allowances, job records, or existing reserved credits. It is not automatically executed by Vercel builds. The equivalent guarded server-side configuration update can be applied through the existing service-role PostgREST access without creating another SQL endpoint or exposing credentials.

Existing completed, pending, and review-held jobs retain their original model and credit reservation. Reopening or resuming them must reuse that job. The three-per-account cap still applies, and the global budget can reject a new generation when it cannot cover the new 1,580-credit reservation. Never increase the budget or release uncertain holds as part of a model switch. No paid test is implied by applying this configuration change.
