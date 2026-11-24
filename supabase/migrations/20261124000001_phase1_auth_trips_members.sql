-- Phase 1: profiles, trips, trip_members + RLS
-- Done when: two accounts cannot see each other's trips.

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  destination  text,
  start_date   date,
  end_date     date,
  cover_url    text,
  owner_id     uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  constraint trips_dates_ok check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.trip_members (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members (user_id);
create index trips_owner_idx on public.trips (owner_id);

-- ---------------------------------------------------------------
-- Profile row for every new auth user
-- ---------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Helpers (security definer so policies on trip_members don't recurse)
-- ---------------------------------------------------------------
create function public.trip_role(p_trip_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.trip_members
  where trip_id = p_trip_id and user_id = auth.uid();
$$;

create function public.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members me
    join public.trip_members them on them.trip_id = me.trip_id
    where me.user_id = auth.uid() and them.user_id = p_user_id
  );
$$;

revoke all on function public.trip_role(uuid) from public, anon;
revoke all on function public.shares_trip_with(uuid) from public, anon;
grant execute on function public.trip_role(uuid) to authenticated;
grant execute on function public.shares_trip_with(uuid) to authenticated;

-- ---------------------------------------------------------------
-- create_trip RPC: inserts the trip and the owner membership atomically
-- ---------------------------------------------------------------
create function public.create_trip(
  p_name text,
  p_destination text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.trips (name, destination, start_date, end_date, owner_id)
  values (trim(p_name), nullif(trim(p_destination), ''), p_start_date, p_end_date, v_uid)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, v_uid, 'owner');

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip(text, text, date, date) from public, anon;
grant execute on function public.create_trip(text, text, date, date) to authenticated;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;

-- profiles: see yourself and people you share a trip with; edit only yourself
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_trip_with(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- trips: members read; owner/editor update; owner delete. Insert goes through create_trip().
create policy trips_select on public.trips
  for select to authenticated
  using (public.trip_role(id) is not null);

create policy trips_update on public.trips
  for update to authenticated
  using (public.trip_role(id) in ('owner', 'editor'))
  with check (public.trip_role(id) in ('owner', 'editor'));

create policy trips_delete on public.trips
  for delete to authenticated
  using (public.trip_role(id) = 'owner');

-- trip_members: members see the roster. Inserts go through RPCs only
-- (create_trip now, invite redemption in Phase 2).
create policy trip_members_select on public.trip_members
  for select to authenticated
  using (public.trip_role(trip_id) is not null);

-- owner changes roles of others (never to/from owner)
create policy trip_members_update on public.trip_members
  for update to authenticated
  using (public.trip_role(trip_id) = 'owner' and user_id <> auth.uid() and role <> 'owner')
  with check (role in ('editor', 'viewer'));

-- owner removes others; anyone but the owner can leave
create policy trip_members_delete on public.trip_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = auth.uid() or public.trip_role(trip_id) = 'owner')
  );

-- ---------------------------------------------------------------
-- Grants: no anon access; limit which columns clients may write
-- ---------------------------------------------------------------
revoke all on public.profiles, public.trips, public.trip_members from anon;
revoke insert, update on public.profiles, public.trips, public.trip_members from authenticated;

grant update (name, avatar_url) on public.profiles to authenticated;
grant update (name, destination, start_date, end_date, cover_url) on public.trips to authenticated;
grant update (role) on public.trip_members to authenticated;
