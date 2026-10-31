# Three free worlds, editable dictation, and journal-to-podcast

## Production diagnosis (read-only)

The deployed https://memoverse05.vercel.app/api/generation-status returned:
`world_generation_enabled: false` (scene analysis itself is AI-enabled).

The deployed `/api/world-config` returned HTTP 503: world generation is not configured.

Vercel environment-name inspection confirmed production has WLT_API_KEY and public frontend Supabase variables, but is MISSING server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. WORLD_GENERATION_ENABLED exists only for Preview, not Production. No credentials were printed/decrypted. A proposed bulk-decryption audit was rejected by automatic review; the successful replacement inspected names only.

This explains the screenshot: generation is unavailable, so the old page offers its sample. The persistent-world fixes were local and had not been deployed. Neither a new frontend build alone nor a public Supabase publishable key can give FastAPI access to its server-authoritative allowance ledger.

## Product behavior implemented locally

- One photograph per new upload/generation through the existing Journal UI.
- Up to three new World Labs generations per account using the existing server quota/budget transaction. No new or reset localStorage allowance.
- Each journal entry binds one saved job/world. Refreshing and reopening never submits another paid job.
- The sample is explicitly labeled and never substituted as the user's generated result.
- Editable browser speech-to-text in Journal and Studio. Dictation begins only on a user click. MemoVerse saves text, not a recording. Browser speech-service availability varies; some browsers process speech through their own server. Unsupported browsers retain typing/keyboard dictation.
- Voice-file attachment controls removed. Existing historic audio data/playback is preserved; it is not required as input.
- Reused `feature/memorycast-guided-tours` backend modules for evidence-grounded three-chapter scripts and AI speech. Added visible podcast creation/playback in saved Journal entries and the guided-journey panel. The podcast reads SAVED journal text, so edit/save the entry before creating narration.
- Narration generation is explicit and server-leased. Replay only reads saved private audio. No user audio file is submitted. TTS model reused from the feature implementation: gpt-4o-mini-tts, voice coral, WAV.

## Schema and deployment prerequisites

Review migration 010_journal_world_binding.sql (from the prior implementation) and new 011_memorycast.sql (renumbered from the existing feature branch's 010 to avoid collision). Neither migration has been applied to Supabase. Existing 008/009 migrations remain prerequisites; check actual project migration history before running anything.

Production requires, server-side:
- SUPABASE_URL: same existing project as VITE_SUPABASE_URL.
- SUPABASE_SERVICE_ROLE_KEY: private service-role credential, configured directly in Vercel; never paste in chat or add to VITE_ variables.
- WLT_API_KEY: already present, keep it server-side.
- WORLD_GENERATION_ENABLED=true ONLY after database, worker, allowance and global budget configuration are reviewed.
- WORLD_ASSET_RETENTION_APPROVED=true ONLY after confirming the applicable World Labs retention/export terms.
- MEMORYCAST_LIVE_ENABLED=true ONLY after its migration/settings/provider budget are approved. The SQL MemoryCast setting must also be enabled with bounded daily/per-user limits.

A durable world archival worker is required for the persistent-world flow; do not rely on a Vercel request surviving a long transfer. Configure the judging window, global credit budget, hourly/daily limits and three-per-account ledger before enabling spending. A per-user quota does not establish a safe total budget for unlimited signups. No total budget was inferred, no limits reset and no paid generations performed.

## Tests and browser evidence

90 backend tests passed, including imported MemoryCast provider/auth/persistence contracts; 90 frontend tests passed; 30 PostgreSQL tests passed (allowance, journal binding and MemoryCast). Production build and lint passed with existing warnings.

A synthetic browser fixture verified dictation appends editable text; explicit podcast creation reaches three saved chapters; chapter navigation and audio controls render; reopening reuses one saved tour. Provider fixture counters after replay: one script call, three speech calls, one saved tour. No paid calls or real microphone input were used. A clean browser-tab replay had no console errors; an earlier fixture hot reload emitted a duplicate-root development warning and was discarded/rechecked. This is not a live TTS or live Google-authenticated production test.

Existing SPZ rendering and journal binding verification are documented in PERSISTENT_JOURNAL_WORLDS.md. Cloud archival, applied RLS, a real user's three generations, live dictation recognition and production podcast speech remain unverified pending configuration and approved live tests.

No production settings, schema, commits, pushes, merges or deployments were changed in this task. Current worktree/branch:
`/Users/sujam/Documents/Codex/2026-10-31/referenced-chatgpt-conversation-this-is-an/work/persistent-journal-worlds`
`codex/persistent-journal-worlds-latest`
