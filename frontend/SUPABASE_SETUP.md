# MemoVerse account setup

**Current journal sync:** follow `SUPABASE_JOURNAL_SYNC.md` and run
`supabase/004_journal_sync.sql` to enable cloud journal persistence. The journal now
syncs signed-in entries and media, retaining IndexedDB as a cache/offline queue.

**Journal update:** the default app now opens the IndexedDB journal, documented in
`JOURNAL_INTEGRATION.md`. Supabase still provides optional sign-in, and the original
studio's cloud save flow is retained. Journal entries are stored locally, without
requiring a Supabase migration or syncing to the cloud. The older studio setup
instructions below apply to that separate cloud flow.

The frontend now supports email/password login, sign-up, confirmation emails,
Google sign-in, sign-out, and saving/opening the latest 50 memories per account.
Inputs stay local until you select **Save changes** in the studio toolbar.
Edits update the current memory; use **Start a new memory** for another draft.
Deleting an entire memory is not implemented. Scene generation
remains mocked and the 3D room remains a demo.

## 1. Create a Supabase project

1. Sign in at https://supabase.com/dashboard and create a project in your team organization.
2. Choose a region, set a database password, and wait for provisioning.
3. In the project's Connect dialog or API settings, copy the Project URL and
   **publishable** key. The older anon key also works. Never use the secret or
   service-role key in frontend code; those bypass user protection.

## 2. Create the private database and storage

Open the project's SQL Editor, create a query, paste `supabase/schema.sql`, and run
it once. This creates the `memories` table, private `memory-assets` bucket, and RLS
policies. One shared database holds all accounts; Supabase enforces ownership on
every request using `auth.uid()`. A separate database per account is unnecessary.

If the table or policies already exist, review them rather than deleting data or
rerunning this initial schema. Do not make the bucket public or disable RLS.

**Upgrading the original database schema:** run `supabase/002_autosave.sql`
once in SQL Editor. It allows partial drafts and grants each user permission to
update only their own memories. For a new project, the updated `schema.sql` already
contains these rules; do not run both files.

## 3. Configure email sign-in

In Authentication settings:

- Enable the Email provider and email confirmations.
- Set the minimum password length to at least 8.
- Set Site URL to `https://memoverse05.vercel.app` for the hosted production project.
- Add your exact development URL to allowed Redirect URLs. Include another port
  only if Vite actually uses it (e.g. `http://localhost:5174`).
- Add your production URL when deploying. Configure custom SMTP for production
  confirmation email delivery; the built-in mail service has delivery/rate limits.

## 4. Add the local environment

From PowerShell in `frontend/`:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` to replace both placeholders with your project's URL and public
publishable key. `.env.local` is ignored by Git. Vite exposes `VITE_` variables in
the browser, so **never put a privileged key here**.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Restart Vite after changing environment variables:

```powershell
npm.cmd install
npm.cmd run dev
```

The Explore Memories page is public. Sign in opens the account interface. Visitors
can return to exploring without an account, even when Supabase is not configured.
Guest inputs are not saved. Signing in opens a fresh account workspace.

## 5. Verify with two accounts

1. Create account A, confirm its email, and sign in.
2. Enter the studio and select a photo, audio, or write a story. No data should be
   uploaded yet. Select **Save changes** and wait for **All changes saved privately**.
   Photo-only, audio-only, and unfinished text drafts can be saved. Generation still
   requires a photo and a description of at least 20 characters. Edit the draft and
   verify it stays unsaved until you click Save changes again.
3. Refresh the page, open **Saved memories** in the navigation, and open a memory. Confirm the photo,
   audio, story, mood, and scene data restore.
4. Sign out. Sign in as account B in a separate browser profile. Its list must be
   empty. Save B's own memory and verify A cannot see it.
5. Test RLS through the Supabase client using B's authenticated session: selecting
   A's known memory ID must return no rows; inserting with A's user_id must fail;
   downloading A's known storage path must fail. An unauthenticated request must
   also fail. UI filtering alone is not proof of database protection.
6. Check retry handling offline and confirm sign-out clears the current memory UI.

7. Test photo-only, audio-only, and text-only drafts. Edit while a save is running;
   later edits should remain marked unsaved until Save changes is selected again.
   Select **Start a new memory** and confirm it creates a separate draft.

Save requests cannot overlap and unchanged assets are reused. A failed save
shows an error and Retry saving button. A tab-close warning protects unsaved input;
closing anyway may lose it. Cross-device simultaneous editing is last-write-wins.
Photos/audio are held in private Supabase Storage; database rows store their paths.

Live authentication, email delivery, persistence, and RLS isolation require your
configured project to test. They have not been verified against a real project yet.

## Enable Continue with Google

1. Open Google Cloud Console and select/create your project. In Google Auth Platform,
   configure Branding and Audience. Add your Google account as a test user if the
   app is in testing. Use only basic identity scopes (openid, email, profile).
2. Create an OAuth client under Clients, with application type **Web application**.
3. Add your frontend origin under **Authorized JavaScript origins**:
   `http://localhost:5173` (use the actual Vite port).
4. Under **Authorized redirect URIs**, add the hosted Supabase callback:
   `https://xtmcncvjrawibipzlnqh.supabase.co/auth/v1/callback`.
   For another project, copy its callback from Supabase's Google provider settings.
5. Copy the OAuth Client ID and Client Secret into Supabase → Authentication →
   Sign In / Providers → Google. Enable the provider and save. Keep the client
   secret in Supabase; do not add it to a VITE variable or commit it to Git.
6. In Supabase URL Configuration, allow your app origin as a redirect URL and set
   Site URL `https://memoverse05.vercel.app`. Keep localhost in the allowed redirect
   list for development, rather than making it the production project's Site URL.
7. Sign out of MemoVerse, select **Continue with Google**, choose your test account,
   and verify you return to the app. Test in a normal browser if the embedded browser
   blocks Google login. This signs in with a Google account; it does not read Gmail.

Google sign-in is wired in the frontend but cannot succeed until the provider is
configured. Live OAuth has not been tested against this project.
Official guide: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

## Team integration

Application wiring lives in `src/App.jsx`. Account UI and Supabase client code live
in `src/ui/`. Commit `.env.example`, the schema, and this guide, but not `.env.local`.
No backend or 3D renderer changes are required for accounts. Generated scene JSON
can be saved when the real generation adapter is connected later.

References:
- https://supabase.com/docs/guides/getting-started/tutorials/with-react
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control

## Vercel configuration (required for deployed login)

The ignored .env.local only configures your computer. In Vercel, open your project →
Settings → Environment Variables and add:

- VITE_SUPABASE_URL: your Supabase Project URL.
- VITE_SUPABASE_PUBLISHABLE_KEY: your Supabase publishable key.

Select both Production and Preview if you use branch deployments. Use raw values
without surrounding quotes. Redeploy after saving; Vite embeds these at build time.
The client also supports VITE_SUPABASE_ANON_KEY for the older public anon key.
Never add a service-role or secret key.

In Supabase → Authentication → URL Configuration, set Site URL to your production
Vercel origin and allow that exact origin in Redirect URLs. Also allow any preview
origins you test, while retaining localhost for development. In Google Cloud, add
the production origin to Authorized JavaScript origins. The authorized redirect URI
remains your Supabase /auth/v1/callback URL. Enable Google's provider in Supabase
with your OAuth Client ID and Secret as described above.

If accounts are unavailable, check Vercel variable names, values, environment scopes,
and redeploy. If Google sign-in starts but fails or redirects to the wrong host,
check the provider and redirect settings.

References:
- https://vercel.com/docs/environment-variables
- https://supabase.com/docs/guides/auth/redirect-urls
