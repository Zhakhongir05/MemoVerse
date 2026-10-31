# Generation plans and credit protection

## Product terms

- Free: **3 total lifetime generations per verified Gmail/Google account**.
- Paid: **₩10,000 KRW for 15 additional generations**, a one-time pack.
- Each request submits exactly one photo. Multi-photo journal entries remain
  supported; users choose a source when preparing a world.
- Reopening a world or trying the sample does not spend a credit.
- Credits count attempts once admitted to the private upstream. Provider failures
  and ambiguous timeouts do not automatically refund; an admin must verify the
  provider did not charge before refunding. This conservative behavior protects
  the project budget and is stated on the Plans page.

## What is implemented

`GenerationPlans.jsx` displays plans, usage, and a paid-pack button. The button is
disabled until App supplies a real `onPurchase` checkout handler. There is no fake
payment success or client-granted paid entitlement.

`generationCredits.js` calls only the Supabase Edge Function. Browser plan checks
are informational. `generate-memory/index.ts` verifies the real Supabase user token,
requires a confirmed Gmail identity signed in through Google, checks ownership of
the saved journal entry, validates exactly one image (including file signature),
and reserves quota before contacting the private generation adapter.

`007_generation_credits.sql` provides row-locked, atomic credit reservations,
Google-subject uniqueness, idempotent request fingerprints, and a global hard cap.
Authenticated clients can only read their own balance. Reservation and pack-grant
RPCs are executable only by the service role. Changing localStorage, request JSON,
or disabling a button cannot increase server credits.

## Required deployment / team coordination

1. Run `supabase/007_generation_credits.sql` in SQL Editor.
2. Deploy the function source under `supabase/functions/generate-memory/index.ts`
   to your Supabase project using its dashboard/CLI. This work did **not** deploy
   a function, change a database, make provider calls, or create a payment account.
3. Configure server-only function secrets:
   - `WORLD_GENERATION_UPSTREAM_URL`: HTTPS endpoint of the team's private adapter.
   - `WORLD_GENERATION_UPSTREAM_TOKEN`: shared secret required by that adapter.
   - `ALLOWED_APP_ORIGINS`: production origin plus explicitly trusted local/preview
     origins. Defaults include memoverse05.vercel.app and localhost ports 5173/5174.
   Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Edge runtime.
   Never put privileged/provider keys in VITE variables.
4. The existing upstream must reject requests without its internal token, or users
   could bypass this gate and call it directly. Remove/lock down any old unguarded
   generation routes before enabling provider access. Do not expose World Labs
   credentials in the browser. The frontend contains no direct paid-provider call.
5. The upstream receives multipart `photo`, `story`, `memoryId` and an
   `Idempotency-Key` matching the reserved request ID. It must honor that key and
   resolve `{ world, story?, tour?, scene? }` only when ready. It owns World Labs and
   OpenAI/DeepSeek orchestration. No provider API contract was invented here.
   Long-running jobs should be moved to the team's durable job queue before launch;
   the initial adapter waits at most 120 seconds and never automatically reissues
   a provider call after timeout.
6. Set `generation_budget.max_requests` to an **explicit finite number of requests
   you can afford**, with headroom for actual World Labs costs. It starts at **0**,
   so generation fails closed. This is a request cap, not a guarantee of monetary
   cost if model/provider pricing varies. Keep provider-side spending limits too.
7. Wire the real WorldViewer. The current app still blocks realistic generation
   while that integration is unavailable; adding plans does not connect a new
   generation engine or spend World Labs credits.

## Payments

The Plans page now includes a **mock checkout** when no real `onPurchase` handler
is supplied. It accepts only test numbers `4242 4242 4242 4242` (success) and
`4000 0000 0000 0002` (decline), a demo name, future expiry, and demo CVC. Submission
is an explicitly labeled local simulation with no network/storage calls. Inputs
are cleared on submission; closing unmounts the form and cancels its timer. The
receipt contains only a random demo ID, amount, and simulated pack size. It does
not call the payment grant RPC, modify a real plan, or add provider credits.

Do not enter real card details into the demo. A future real checkout must use the
payment provider's hosted fields/checkout rather than sending card data through
MemoVerse or Supabase. Supplied `onPurchase` continues to use that real integration
instead of the mock form.

Select a payment provider that supports KRW, then implement server-created checkout
for the ₩10,000 / 15-generation SKU. On its signed, verified, captured-payment
webhook, resolve the authenticated purchaser and invoke:

```sql
select public.grant_paid_generation_pack(
  '<user UUID>', '<unique verified provider payment-event ID>', 10000, 'KRW'
);
```

This is a service-only call, not something to expose in the frontend or run based
on a browser's checkout-success URL. Repeated webhooks grant no extra credits.
Verify signature, amount, currency, paid status, SKU, and user association before
calling it. The first purchase follows initialization of the Google generation
account (normally after using the three Free generations). Handle refunds and
chargebacks in the same trusted backend. No unlimited paid plan is granted.

## Verification before enabling credits

- Two simultaneous requests with the same fingerprint: only one admission and one
  upstream call; subsequent calls return the result or in-progress state.
- Four concurrent different requests for a Free Gmail account: at most three are
  admitted. A second app user linked to the same Google subject cannot get another
  allowance. Browser attempts to write accounts or invoke grant RPC must fail.
- A request with two photos, invalid image bytes, missing/invalid auth, unverified
  or non-Google Gmail identity, or another user's memory ID must never reach the
  upstream or consume quota.
- Once the global budget is reached, no account—including paid—can invoke more.
- Duplicate verified payment event: exactly 15 additional credits, once. Wrong
  price/currency or unverified browser payload must not activate the pack.
- Failed or interrupted upstream calls must not automatically refund or retry.

Frontend unit tests exercise the plan terms, single-photo request, and limit error
handling. The SQL concurrency/RLS checks and Edge Function identity/admission checks
require a configured Supabase test project; they have not been run live here.
