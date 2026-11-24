-- Phase 1 hardening (from Supabase advisors)
-- 1. Move RLS helpers out of the API-exposed `public` schema into `private`.
-- 2. Wrap auth.uid() in (select ...) so policies evaluate it once per query.
-- 3. Stop the API from calling Supabase's rls_auto_enable() event-trigger function.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.trip_role(p_trip_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.trip_members
  where trip_id = p_trip_id and user_id = (select auth.uid());
$$;

create function private.shares_trip_with(p_user_id uuid)
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
    where me.user_id = (select auth.uid()) and them.user_id = p_user_id
  );
$$;

revoke all on function private.trip_role(uuid) from public, anon;
revoke all on function private.shares_trip_with(uuid) from public, anon;
grant execute on function private.trip_role(uuid) to authenticated;
grant execute on function private.shares_trip_with(uuid) to authenticated;

-- Recreate policies against the private helpers
drop policy profiles_select on public.profiles;
drop policy profiles_update on public.profiles;
drop policy trips_select on public.trips;
drop policy trips_update on public.trips;
drop policy trips_delete on public.trips;
drop policy trip_members_select on public.trip_members;
drop policy trip_members_update on public.trip_members;
drop policy trip_members_delete on public.trip_members;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_trip_with(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy trips_select on public.trips
  for select to authenticated
  using (private.trip_role(id) is not null);

create policy trips_update on public.trips
  for update to authenticated
  using (private.trip_role(id) in ('owner', 'editor'))
  with check (private.trip_role(id) in ('owner', 'editor'));

create policy trips_delete on public.trips
  for delete to authenticated
  using (private.trip_role(id) = 'owner');

create policy trip_members_select on public.trip_members
  for select to authenticated
  using (private.trip_role(trip_id) is not null);

create policy trip_members_update on public.trip_members
  for update to authenticated
  using (private.trip_role(trip_id) = 'owner' and user_id <> (select auth.uid()) and role <> 'owner')
  with check (role in ('editor', 'viewer'));

create policy trip_members_delete on public.trip_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or private.trip_role(trip_id) = 'owner')
  );

drop function public.trip_role(uuid);
drop function public.shares_trip_with(uuid);

-- Supabase-created event-trigger helper; it never needs to be called over the API
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
