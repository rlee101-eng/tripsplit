-- TripSplit database schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.

-- ── Tables ──────────────────────────────────────────────────────────────

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key,
  name text not null,
  default_currency text not null default 'AUD',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key,
  trip_id uuid not null references public.trips (id),
  description text not null default '',
  category text not null,
  date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  fx_rate_to_aud double precision not null check (fx_rate_to_aud > 0),
  rate_pending boolean not null default false,
  amount_aud_minor bigint not null,
  paid_by uuid not null,
  split_type text not null check (split_type in ('equal', 'full_other', 'custom_amount', 'custom_percent')),
  split_input jsonb,
  shares jsonb not null,
  created_by uuid not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table public.settlements (
  id uuid primary key,
  trip_id uuid not null references public.trips (id),
  from_user uuid not null,
  to_user uuid not null,
  amount_aud_minor bigint not null check (amount_aud_minor > 0),
  date date not null,
  note text not null default '',
  created_by uuid not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create index on public.members (server_updated_at);
create index on public.trips (server_updated_at);
create index on public.expenses (server_updated_at);
create index on public.settlements (server_updated_at);

-- ── Sync support ────────────────────────────────────────────────────────
-- Stamps every write with the server time (used by the app to pull changes),
-- and ignores an update that is older than what's already stored, so the
-- most recent edit wins when both phones edit the same thing offline.

create or replace function public.sync_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create trigger sync_stamp before insert or update on public.members
  for each row execute function public.sync_stamp();
create trigger sync_stamp before insert or update on public.trips
  for each row execute function public.sync_stamp();
create trigger sync_stamp before insert or update on public.expenses
  for each row execute function public.sync_stamp();
create trigger sync_stamp before insert or update on public.settlements
  for each row execute function public.sync_stamp();

-- ── Security: only the two members can see or change anything ───────────

create or replace function public.is_member() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid())
$$;

create or replace function public.member_count() returns integer
language sql security definer stable set search_path = public as $$
  select count(*)::integer from public.members
$$;

alter table public.members enable row level security;
alter table public.trips enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;

create policy "members can see members" on public.members
  for select to authenticated using (public.is_member());
-- The first two people to sign in become the members; nobody else can join.
create policy "join while there is room" on public.members
  for insert to authenticated with check (user_id = auth.uid() and public.member_count() < 2);
create policy "rename yourself" on public.members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members only" on public.trips
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members only" on public.expenses
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members only" on public.settlements
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- Explicit grants, so this works with "Automatically expose new tables" turned off.
-- Only signed-in users get access; the anonymous role gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update on public.members, public.trips, public.expenses, public.settlements to authenticated;
grant execute on function public.is_member(), public.member_count() to authenticated;

-- ── Keep-alive ──────────────────────────────────────────────────────────
-- Supabase pauses free projects after about a week idle. A scheduled GitHub
-- Action (.github/workflows/keepalive.yml) calls this every few days. It reads
-- no data, so letting the anonymous role call it exposes nothing.
create or replace function public.keepalive() returns integer
language sql stable as $$ select 1 $$;

grant usage on schema public to anon;
grant execute on function public.keepalive() to anon;
