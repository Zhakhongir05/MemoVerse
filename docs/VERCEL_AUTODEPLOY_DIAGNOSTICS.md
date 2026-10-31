# MemoVerse automatic deployment diagnostics

## What these files do

Keep the Vercel project Root Directory at the repository root. This is a full-stack repository: `api/index.py` exposes the existing Python backend, while npm builds `frontend/`.

- `framework: null` intentionally selects Other. Explicit install/build/output settings run Vite while preserving the root Python API. Do not move the project root to `frontend` with this configuration.
- `git.deploymentEnabled: true` enables Git deployments for all branches. It cannot repair a disconnected Git app, plan restriction, or rejected deployment.
- `ignoreCommand: "exit 1"` overrides the ignored-build command and continues building. In this particular setting **exit 0 skips**, while **exit 1 builds**. This does not invert normal build-command success semantics.
- Existing API rewrites, function limits and private-file exclusions are preserved.
- These changes only take effect once reviewed and pushed to the branch Vercel builds. They do not change dashboard settings by themselves.

## Run the read-only checks

From your checkout:

```bash
bash ./verify-git.sh
```

Use an email verified on the authenticated provider account, or its GitHub privacy address. The profile's publicly displayed email may be blank and need not equal the commit email. Repository access and Vercel team membership remain separate checks.

If email verification access is missing:

```bash
gh auth login --hostname github.com
gh auth refresh --hostname github.com --scopes read:user,user:email
# For GitLab instead:
glab auth login --hostname gitlab.com
```

Set identity only after confirming the correct address:

```bash
git config --local user.email 'YOUR_VERIFIED_EMAIL'
```

The script requires tracking `origin/<current-branch>`. Inspect before correcting it:

```bash
git branch -vv
git remote -v
# Only if this is the intended existing remote branch:
git branch --set-upstream-to=origin/YOUR_BRANCH YOUR_BRANCH
```

Do not share remote output publicly if URLs contain credentials. The script sanitizes its own repository display.

## Deliberate webhook test (creates/pushes a commit)

Save/review existing work first. The current integration checkout is dirty; the script deliberately refuses to create a test commit there.

Use a clean, existing preview branch tracking its matching origin branch. For a new diagnostic branch, the following commands deliberately publish it first; run only when ready:

```bash
git switch -c codex/vercel-webhook-probe origin/main
git push --set-upstream origin codex/vercel-webhook-probe
bash ./verify-git.sh --test-commit --push
```

Without `--push`, test mode creates a local commit for review. Production branch test commits require the additional explicit `--allow-production` flag. There is no force push, staging, hook bypass, or automatic reset.

**A unique commit is not an uncached build.** Before the test, temporarily set `VERCEL_FORCE_NO_BUILD_CACHE=1` for Preview in Vercel. Remove it after the diagnostic. For a manual redeploy, deselect “Use existing Build Cache” if offered. A manual redeploy verifies builds, not the Git webhook.

If monorepo “Skip deployments when there are no changes” is enabled, an empty commit may be skipped before the ignored-build command runs. Temporarily disable that option for the diagnostic, or use a reviewed real frontend change instead. No skip markers are added by the script.

## Dashboard verification, in order

1. **Select the correct Vercel team and project.** Confirm the domain you visit belongs to that project. An independently configured collaborator project can build successfully while yours fails.
2. **Settings → Git:** confirm the connected owner/repository is the repository receiving the pushes. Last verified MemoVerse deployment used `sujamahat/MemoVerse-1`; verify the current owner after any transfer. A fork does not automatically receive upstream commits. Do not disconnect a working link merely to test it.
3. **GitHub → organization/account Settings → GitHub Apps → Installed GitHub Apps → Vercel → Configure:** ensure the installation is under the actual repository owner and includes MemoVerse. An organization owner may need to approve access or SSO. Being a contributor alone does not grant installation permission. After transfers, verify the new owner's installation.
4. **Vercel account Settings → Authentication/Login Connections:** confirm the correct GitHub/GitLab identity. In GitHub/GitLab, verify the email used by new commits. Inspect the failing commit's Vercel check for author/team-access errors; email matching alone cannot authorize a deployment.
5. **Settings → Environments → Production** (or the Git/production-branch control shown in your dashboard): keep the intended production branch `main`. A feature branch normally gets a Preview URL; it does not update the production domain. Do not switch production to a feature branch just to mask missing merges.
6. **Settings → Build and Deployment:** Root Directory repository root; Framework Other; install `npm ci --prefix frontend`; build `npm run build --prefix frontend`; output `frontend/dist`. Check Ignored Build Step and monorepo unaffected-project skipping. The supplied root configuration overrides the ignored command with `exit 1`.
7. **Deployments:** filter by the exact branch and SHA. Open failed, canceled, skipped, or approval-required entries. Compare Source SHA with GitHub's latest commit. If no entry/check appears, investigate Git connection/event delivery. If an entry exists, read its first actionable error before changing code.
8. **GitHub repository → commit/PR Checks** and **Vercel Activity:** inspect app permission or deployment errors. GitHub App webhooks are app-managed; an empty repository Webhooks list does not prove Vercel is disconnected. Use repository webhook delivery/redelivery only if an actual repository hook exists and you administer it. Do not create arbitrary duplicate hooks. GitLab integrations may expose delivery information under Settings → Webhooks.
9. **Team plan and usage:** check the actual error for deployment/build limits and private organization repository restrictions. Hobby has restrictions on private organization repositories; Pro private-repository deployments also enforce author/team access. A GitHub organization owner role does not automatically grant Vercel team membership. Do not purchase or upgrade without approval.
10. **Environment Variables:** confirm public frontend variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are present in both intended environments. Never use a service-role/secret key in a `VITE_` variable. Keep backend provider keys server-side. Keep paid World Labs generation disabled in previews. Rebuild after changing build-time variables.
11. For production, confirm the successful deployment is assigned the production domain. For Preview, use its actual Preview URL. Verify the SHA, page load and `/api/health`. If a deployment is Ready but stale, check domain assignment, branch choice and browser/service-worker caching before blaming the webhook.

## Verification and scope

The script checks effective author identity, authenticated provider email, origin fetch/push agreement, and exact branch tracking. Test mode additionally fetches origin, refuses dirty/diverged branches and unfinished Git operations, then creates one empty commit. It cannot prove GitHub App installation or Vercel webhook delivery using local Git alone.

No commits, pushes, deployments, Git connection changes, or paid provider calls are performed merely by installing these files or running default mode.

## Official references

- https://vercel.com/docs/project-configuration/vercel-json
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel
- https://vercel.com/docs/deployments/troubleshoot-a-build
- https://vercel.com/docs/git
- https://vercel.com/docs/monorepos
