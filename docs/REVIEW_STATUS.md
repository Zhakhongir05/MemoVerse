# Journal, saved worlds, and podcast review

Branch: codex/persistent-journal-worlds-latest. Base: origin/main at 66af11c.

The journal navigation is My Journal, Timeline, and Saved Worlds. Plans and legacy Studio shortcuts are removed from the primary journal flow; their underlying implementations are preserved. Sample exploration remains explicitly labeled. Each memory keeps its editable text/dictation, one-photo upload, saved-world entry point and three-chapter podcast controls. No new user audio upload is requested.

Validated: 90 backend tests, 90 frontend tests, 30 embedded PostgreSQL tests, production build, and lint (warnings only). Synthetic browser checks covered saved-world replay/anchors and text-to-podcast replay/controls. No paid generation or live dictation test was performed.

## Release gate

This branch is suitable for Git review and a Vercel Preview. Do not promote it as a fully working production generation system until:

- The EXISTING Supabase project's migration history is checked and migrations 010_journal_world_binding.sql and 011_memorycast.sql are reviewed/applied with prerequisite migrations present.
- Production server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured. Public VITE_ variables are not a substitute for backend credentials.
- The durable world archival worker, private Storage capacity, retention permissions and global judging-period budget are configured.
- World/podcast generation is explicitly enabled only within approved budgets. Preview paid-generation flags remain disabled.
- Approved live account isolation, world generation/private archival and speech playback checks pass.

The last read-only production audit found world_generation_enabled=false and /api/world-config returning 503. New features must not silently fall back to the unrelated sample. No database migration, production configuration or provider billing changes are part of this commit/push.

See PERSISTENT_JOURNAL_WORLDS.md and PRODUCTION_THREE_WORLDS_AND_PODCAST.md for detailed implementation history and deployment instructions. Their no-commit statements describe the earlier local verification stages; the branch is now being prepared for reviewed commits and Preview deployment.
