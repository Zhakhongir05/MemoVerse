-- Server-authoritative, lifetime credits. Run in Supabase SQL Editor.
begin;
create table if not exists public.generation_accounts (
  user_id uuid primary key references auth.users(id),
  google_subject text not null unique,
  plan text not null default 'free' check (plan in ('free','paid')),
  credits_total integer not null default 3 check (credits_total >= 0),
  credits_used integer not null default 0 check (credits_used between 0 and credits_total)
);
create table if not exists public.generation_budget (
  id boolean primary key default true check (id),
  max_requests integer not null default 0 check (max_requests >= 0),
  requests_used integer not null default 0 check (requests_used >= 0)
);
insert into public.generation_budget(id) values (true) on conflict do nothing;
create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  memory_id uuid not null,
  fingerprint text not null,
  state text not null default 'reserved' check (state in ('reserved','succeeded','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, fingerprint)
);
create table if not exists public.generation_purchases (
  payment_event_id text primary key,
  user_id uuid not null references auth.users(id),
  amount_krw integer not null check (amount_krw = 10000),
  credits integer not null default 15 check (credits = 15),
  created_at timestamptz not null default now()
);
alter table public.generation_accounts enable row level security;
alter table public.generation_budget enable row level security;
alter table public.generation_requests enable row level security;
alter table public.generation_purchases enable row level security;
revoke all on public.generation_accounts, public.generation_budget, public.generation_requests, public.generation_purchases from anon, authenticated;
grant all on public.generation_accounts, public.generation_budget, public.generation_requests, public.generation_purchases to service_role;
grant select on public.generation_accounts to authenticated;
drop policy if exists "Read own credit balance" on public.generation_accounts;
create policy "Read own credit balance" on public.generation_accounts for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.reserve_world_generation(p_user_id uuid, p_google_subject text, p_memory_id uuid, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account public.generation_accounts; request public.generation_requests; budget public.generation_budget;
begin
  insert into public.generation_accounts(user_id, google_subject) values(p_user_id, p_google_subject) on conflict(user_id) do nothing;
  select * into account from public.generation_accounts where user_id = p_user_id for update;
  if account.google_subject <> p_google_subject then raise exception 'GOOGLE_ACCOUNT_MISMATCH'; end if;
  select * into request from public.generation_requests where user_id = p_user_id and fingerprint = p_fingerprint;
  if found then return jsonb_build_object('id',request.id,'created',false,'state',request.state,'result',request.result); end if;
  if account.credits_used >= account.credits_total then raise exception 'NO_GENERATION_CREDITS'; end if;
  select * into budget from public.generation_budget where id = true for update;
  if not found or budget.requests_used >= budget.max_requests then raise exception 'GENERATION_PAUSED'; end if;
  update public.generation_accounts set credits_used = credits_used + 1 where user_id = p_user_id;
  update public.generation_budget set requests_used = requests_used + 1 where id = true;
  insert into public.generation_requests(user_id,memory_id,fingerprint) values(p_user_id,p_memory_id,p_fingerprint) returning * into request;
  return jsonb_build_object('id',request.id,'created',true,'state',request.state);
end;
$$;
revoke all on function public.reserve_world_generation(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_world_generation(uuid,text,uuid,text) to service_role;

-- Call ONLY from a payment webhook after verifying a captured ₩10,000 payment.
create or replace function public.grant_paid_generation_pack(p_user_id uuid, p_payment_event_id text, p_amount_krw integer, p_currency text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_amount_krw is distinct from 10000 or p_currency is distinct from 'KRW' or p_payment_event_id is null or length(trim(p_payment_event_id)) < 1 then raise exception 'INVALID_PAYMENT'; end if;
  perform 1 from public.generation_accounts where user_id = p_user_id for update;
  if not found then raise exception 'GOOGLE_ACCOUNT_REQUIRED'; end if;
  insert into public.generation_purchases(payment_event_id,user_id,amount_krw) values(p_payment_event_id,p_user_id,p_amount_krw) on conflict do nothing;
  if not found then return false; end if;
  update public.generation_accounts set plan = 'paid', credits_total = credits_total + 15 where user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.grant_paid_generation_pack(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.grant_paid_generation_pack(uuid,text,integer,text) to service_role;
commit;
