# Full-stack Vercel deployment

The Vercel project must watch the repository where collaborators actually push: currently sujamahat/MemoVerse-1. Production branch remains main. Non-production branch pushes create Preview deployments after these files are included on those branches and Git integration permissions permit the author.

Keep Root Directory at repository root. vercel.json installs/builds frontend/ and serves frontend/dist. api/index.py packages FastAPI and same-origin /api requests. Do not select frontend as the project root if this project must serve the Python backend. Root requirements.txt mirrors backend/requirements.txt to avoid Vercel included-file parsing failures; update both when changing dependencies.

Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the intended Vercel environments before building. Only public/publishable keys belong in VITE_ variables. Keep provider keys server-only. Preview defaults: DEMO_MODE=true, ALLOW_MOCK_FALLBACK=true, MEMORYCAST_LIVE_ENABLED=false, WORLD_GENERATION_ENABLED=false. No paid generation should be enabled as a side effect of deployment. Do not commit environment files or personal test media.

A redeploy of an old deployment does not necessarily select newer Git commits. Verify each Git deployment's repository, branch and SHA. Pushes on feature branches update their Preview, not the main website. Only reviewed main updates should change production. Vercel uses the last successful production build if a later build fails; inspect its logs.

Check / and /health after deployment, plus a no-paid supplied-placement POST to /api/generate-enhancements. Inspect /api/health if a same-origin API health probe is needed. Test Google OAuth separately using approved exact production/preview redirect URLs in Supabase; retain the existing Supabase callback in Google's provider config.

## Unified World Labs application

Source integration includes persistent three-world quotas and the latest Plans/journal UI. Apply the existing-database migrations described in docs/INTEGRATION_REVIEW.md before enabling generation. WORLD_GENERATION_ENABLED stays false until approved dates/budget/credentials are configured. Production symbolic AI should set DEMO_MODE=false and ALLOW_MOCK_FALLBACK=false explicitly; Preview can retain DEMO_MODE=true and ALLOW_MOCK_FALLBACK=true. These are scoped Vercel environment settings, not hard-coded global overrides in vercel.json. The UI labels any demo response honestly.

Install/build commands strip only unsupported legacy npm cache-dir environment settings. Spark/Three and the journal/alternate renderers are lazy; nonfatal bundle-size warnings remain visible. Test fixtures and reports are excluded from upload. No provider calls or manual Vercel deployment are part of the Git merge.
