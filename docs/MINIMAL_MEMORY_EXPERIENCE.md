# Plans, favorites and saved listening

## Why Plans disappeared

Frontend commit `de9fdce` added Plans, the three-generation Free plan and a
₩10,000 / 15-generation checkout preview. Commit `771a1ad` deliberately removed
the Plans import, navigation item and rendered section while streamlining the
navigation to Journal, Timeline and Saved Worlds. The old components remained in
the tree, disconnected from the application. This branch restores their entrypoint
and updates the requested preview price to ₩15,000 for an unlimited plan.

## Product behavior

- Plans shows the authoritative existing three-world account allowance. The
  unlimited offer is a payment preview, explicitly disclosing that no charge is
  made and the real Free allowance remains unchanged. It collects no card data,
  does not send a payment request and cannot grant real provider credits.
- A heart adds/removes a memory from Favorites. Guest favorites persist on the
  device. Account favorites sync through a separate owner-protected table with
  local pending changes for offline recovery. Existing journals/media are untouched.
- Immersive exploration has four primary controls: Listen, Favorite, Fullscreen
  and More. Additional editing controls render only when editing. All icon
  buttons have accessible names and pressed states, visible focus, and 44px targets.
- Once a journal world finishes, the client automatically prepares its podcast
  using existing authenticated MemoryCast reservations, leases and private audio
  storage. One completed recording is kept even if the journal later changes;
  replay never regenerates an older narration style or stale entry automatically.
- Headphones only GET the saved recording and start playback. Chapters advance
  automatically. Browsers that block autoplay offer a Play button. Short-lived
  audio links can be refreshed without AI work.

## Persistence and limits

Existing server/database enablement, ownership checks, rate caps and provider
configuration remain authoritative. The original world-creation notice now
includes its AI podcast. No live paid generation is needed to verify this branch.

Preparation is client-driven with durable server steps: navigating between screens
continues an in-flight step; revisiting resumes pending work. Closing the entire
app can pause unfinished work until the next visit. This does not add a cron job
or claim guaranteed off-browser execution. Failed or uncertain provider steps do
not automatically retry. Ready recordings use GET-only replay, including after
reload or from another device.

Before cross-device favorites are enabled, apply additive migration
`frontend/supabase/017_memory_favorites.sql` through the normal reviewed release
process. It is repeat-safe and changes no existing memory, world, audio or quota
rows. Until applied, favorites remain on the device and failed cloud saves show a
sync notice. No production migration or environment changes were performed here.

## Verification

Unit tests cover once-only preparation, concurrent calls, saved replay, failed and
uncertain jobs, account separation, offline favorite recovery and the unchanged
server-authoritative Free balance. PostgreSQL tests apply 017 twice and verify RLS
against foreign and deleted memories. Compiled-browser tests cover transparent
checkout, persisted favorites, speech, automatic podcast creation, audio playback,
chapter advance, no regeneration on reload, and saved-world recovery.

The local browser fixture ports can be isolated with
`MEMOVERSE_TEST_SUPABASE_PORT`, `MEMOVERSE_TEST_BACKEND_PORT` and
`MEMOVERSE_TEST_FRONTEND_PORT`; defaults retain the existing CI ports.
