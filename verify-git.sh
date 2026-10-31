#!/usr/bin/env bash
# Read-only unless --test-commit is supplied. Compatible with macOS Bash 3.2.
set -euo pipefail
mode=check
push=false
production=false
for arg in "$@"; do
  case "$arg" in
    --test-commit) mode=test ;;
    --push) push=true ;;
    --allow-production) production=true ;;
    -h|--help)
      echo 'Usage: ./verify-git.sh [--test-commit [--push] [--allow-production]]'
      echo 'Default: read-only checks. Test mode creates an empty commit; --push pushes it.'
      echo 'Requires Python 3 and authenticated gh (GitHub) or glab (GitLab).'
      exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
fail() { echo "ERROR: $*" >&2; exit 1; }
[ "$push" = false ] || [ "$mode" = test ] || fail '--push requires --test-commit.'
command -v python3 >/dev/null || fail 'Python 3 is required.'
git rev-parse --show-toplevel >/dev/null 2>&1 || fail 'Run inside your repository.'
cd "$(git rev-parse --show-toplevel)"
branch=$(git symbolic-ref --quiet --short HEAD) || fail 'Detached HEAD; select a branch first.'
email=$(git config --get user.email || true)
[ -n "$email" ] || fail 'Set repository-local user.email to an email verified by your Git provider.'
author=$(git var GIT_AUTHOR_IDENT) || fail 'Configure your Git name and email.'
# Parse remotes without displaying embedded credentials.
remote=$(git remote get-url origin) || fail 'No origin remote configured.'
identity=$(python3 - "$remote" <<'PY'
import sys, urllib.parse
s=sys.argv[1]
if '://' in s:
 u=urllib.parse.urlparse(s); host=u.hostname; path=u.path.strip('/')
else:
 host,path=s.split(':',1); host=host.rsplit('@',1)[-1]; path=path.strip('/')
if not host or not path: raise SystemExit('Invalid origin URL')
print(host+' '+path.removesuffix('.git'))
PY
)
host=${identity%% *}
repo=${identity#* }
echo "Repository: $host/$repo"
echo "Branch: $branch"
# Fetch and push destinations must agree; do not send a test to another repository.
[ "$(git remote get-url --push origin)" = "$remote" ] || fail 'Origin fetch and push URLs differ; review them manually.'
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
[ "$upstream" = "origin/$branch" ] || fail "Expected tracking origin/$branch; found ${upstream:-none}. Review before setting upstream."
echo 'PASS: upstream matches the current origin branch.'
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"
if [ "$host" = github.com ] || [[ "$host" == github.* ]]; then
 command -v gh >/dev/null || fail 'Install gh and run gh auth login for this host.'
 gh api --hostname "$host" user > "$tmp/user.json" 2>/dev/null || fail 'GitHub identity unavailable; reauthenticate gh for this host.'
 gh api --hostname "$host" user/emails > "$tmp/emails.json" 2>/dev/null || fail 'Cannot verify private emails. Authorize gh with read:user and user:email access.'
 provider=github
else
 command -v glab >/dev/null || fail 'For GitLab, install/authenticate glab. Other providers require manual identity verification.'
 glab api --hostname "$host" user > "$tmp/user.json" 2>/dev/null || fail 'GitLab identity unavailable; authenticate glab for this host.'
 glab api --hostname "$host" user/emails > "$tmp/emails.json" 2>/dev/null || fail 'GitLab email verification unavailable; check API permissions.'
 provider=gitlab
fi
python3 - "$tmp" "$provider" "$email" "$author" <<'PY'
import json, pathlib, re, sys
p=pathlib.Path(sys.argv[1]); provider,email,author=sys.argv[2:]
u=json.loads((p/'user.json').read_text()); records=json.loads((p/'emails.json').read_text())
verified={r['email'].casefold() for r in records if r.get('verified') or r.get('confirmed_at')}
if provider=='github':
 login=u['login']; uid=u['id']
 verified.update({f'{login}@users.noreply.github.com'.casefold(),f'{uid}+{login}@users.noreply.github.com'.casefold()})
else:
 login=u['username']
 if u.get('confirmed_at') and u.get('email'): verified.add(u['email'].casefold())
actual=re.search(r'<([^<>]+)> \d+ [+-]\d+$',author)
if email.casefold() not in verified:
 raise SystemExit('ERROR: local user.email is not a verified email (or recognized GitHub privacy address) for the authenticated account.')
if not actual or actual[1].casefold()!=email.casefold():
 raise SystemExit('ERROR: effective Git author email differs from user.email. Check GIT_AUTHOR_EMAIL/environment overrides.')
print(f'PASS: configured and effective author email match authenticated {provider} account {login}.')
PY
if git log -1 --format=%B | grep -Eiq '\[(skip ci|ci skip|skip vercel|vercel skip)\]'; then
 echo 'WARNING: latest commit contains a skip marker. The generated test message will not.'
fi
if [ -n "$(git status --porcelain)" ]; then
 [ "$mode" = check ] || fail 'Working tree is dirty. Review/save changes first; this script never stages files.'
 echo 'WARNING: working tree has uncommitted files; test-commit mode will refuse to run.'
fi
if [ "$mode" = check ]; then
 echo 'Checks completed. No files, commits, remote refs, or deployment settings changed.'
 echo 'Tracking freshness is not checked until test mode fetches origin.'
 exit 0
fi
case "$branch" in
 main|master|production) [ "$production" = true ] || fail 'Use a preview branch, or explicitly supply --allow-production.' ;;
esac
for state in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
 [ ! -e "$(git rev-parse --git-path "$state")" ] || fail 'Finish the current Git operation first.'
done
git fetch --quiet origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse '@{upstream}')" ] || fail 'Local and origin branch differ; review existing unpushed commits or remote updates first.'
echo 'Creating one empty diagnostic commit. Hooks and signing remain enabled.'
git commit --allow-empty -m "chore: verify Vercel webhook $(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ "$push" = true ]; then
 git push origin "HEAD:refs/heads/$branch"
else
 echo "Not pushed. Review the commit, then run: git push origin HEAD:refs/heads/$branch"
fi
echo 'This tests the Git trigger; it does NOT disable build cache or override monorepo unaffected-project skipping.'
echo 'For an uncached run, temporarily set VERCEL_FORCE_NO_BUILD_CACHE=1 in the target Vercel environment before pushing; remove it afterward.'
