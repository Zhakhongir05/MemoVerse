# Google OAuth redirect audit

Production: https://memoverse05.vercel.app

## Verified

- `AuthGate.jsx` calls `signInWithOAuth` with `provider: 'google'` and
  `options.redirectTo: window.location.origin`.
- Email sign-up uses `emailRedirectTo: window.location.origin` too.
- The live production HTML returned HTTP 200 and loaded `/assets/index-DKE2ojyn.js`
  at audit time. That bundle also uses `redirectTo: window.location.origin` and
  targets the expected `xtmcncvjrawibipzlnqh.supabase.co` project.
- No hardcoded localhost redirect was found in application source or that deployed
  bundle. Localhost references in the frontend repository are setup-guide examples
  (`localhost:5173`, `localhost:5174`); there is no tracked Vercel config or Supabase
  config.toml overriding auth redirects. Vite config only registers the React plugin.
- The project's public Google authorize endpoint returned HTTP 302 to Google with
  callback `https://xtmcncvjrawibipzlnqh.supabase.co/auth/v1/callback`.
  No login was performed and no keys/tokens were printed.

## Root cause and smallest fix

The observed frontend code is not sending localhost from production. The likely
cause is Supabase falling back to a localhost Site URL because production is absent
from its allowed redirect list (or the Site URL remains configured for development).
The management dashboard redirected to sign-in during inspection, so the exact
stored Site URL and allowlist could not be verified. Do not report that hypothesis
as a confirmed dashboard setting without checking it in the project.

In Supabase → Authentication → URL Configuration, set:

**Site URL:**

```text
https://memoverse05.vercel.app
```

**Allowed Redirect URLs:**

```text
https://memoverse05.vercel.app
https://memoverse05.vercel.app/**
http://localhost:5173
http://localhost:5173/**
http://localhost:5174
http://localhost:5174/**
```

The exact root origin matches current `redirectTo`; the scoped path pattern also
allows future callback paths. Add only actual preview deployment origins you use;
do not allow arbitrary third-party Vercel domains.

Google OAuth's Authorized redirect URI remains the Supabase callback, not your
frontend or localhost. Its Authorized JavaScript origins should include the
production origin and any localhost origins used for development.

No OAuth code replacement or hardcoded production redirect is needed. Keeping
`window.location.origin` preserves production, previews (when allowlisted), and
local development. Fixing Supabase URL Configuration alone requires no code deploy.

Vercel still needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set in the
applicable Production/Preview scope. No private Vercel settings were accessible in
this audit. The production bundle confirms the expected project was embedded.

## Guest navigation bug (confirmed and fixed locally)

Previously, Continue exploring without signing in only closed the sign-in screen.
The landing CTA then called onSignIn again because MemoryExperience required a user
before it could render Journal. A guest-access flag now opens the local guest journal
directly. Back to exploring still returns to the landing screen. Guest access does
not create a Supabase user or grant cloud access; account RLS is unchanged.

Nothing was committed, pushed, or deployed during this audit. No paid API calls
were made. Management settings remain unchanged pending project-owner verification.

References:
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
