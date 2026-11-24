-- Phase 1 check: two accounts cannot see each other's trips.
-- Run as a superuser (SQL editor or MCP execute_sql).
-- The block ALWAYS ends in an exception so every test row is rolled back:
--   "PHASE 1 RLS OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  trip_a uuid;
  trip_b uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (a, 'rls-a@example.test', '{"full_name":"Alice Test"}', 'authenticated', 'authenticated'),
         (b, 'rls-b@example.test', '{"full_name":"Bob Test"}',   'authenticated', 'authenticated');

  -- profile trigger ran
  select count(*) into n from public.profiles where id in (a, b);
  if n <> 2 then raise exception 'profile trigger: expected 2 profiles, got %', n; end if;

  -- act as A
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  trip_a := public.create_trip('A trip', 'Tokyo', '2026-12-12', '2026-12-21');

  select count(*) into n from public.trips;
  if n <> 1 then raise exception 'A should see 1 trip, saw %', n; end if;
  select count(*) into n from public.trip_members where trip_id = trip_a and user_id = a and role = 'owner';
  if n <> 1 then raise exception 'A should be owner of their trip'; end if;

  -- act as B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  trip_b := public.create_trip('B trip', 'Paris', null, null);

  select count(*) into n from public.trips;
  if n <> 1 then raise exception 'B should see only their own trip, saw %', n; end if;
  select count(*) into n from public.trips where id = trip_a;
  if n <> 0 then raise exception 'B can see A''s trip'; end if;
  select count(*) into n from public.trip_members where trip_id = trip_a;
  if n <> 0 then raise exception 'B can see A''s members'; end if;
  select count(*) into n from public.profiles where id = a;
  if n <> 0 then raise exception 'B can see A''s profile'; end if;

  -- B cannot modify or delete A's trip (RLS filters to 0 rows)
  update public.trips set name = 'hacked' where id = trip_a;
  delete from public.trips where id = trip_a;

  -- B cannot add themselves to A's trip (no insert privilege)
  begin
    insert into public.trip_members (trip_id, user_id, role) values (trip_a, b, 'editor');
    raise exception 'B was able to insert into trip_members';
  exception when insufficient_privilege then null;
  end;

  -- B cannot change owner_id (column not granted)
  begin
    update public.trips set owner_id = a where id = trip_b;
    raise exception 'B was able to change owner_id';
  exception when insufficient_privilege then null;
  end;

  -- back as superuser: A's trip untouched
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.trips where id = trip_a and name = 'A trip';
  if n <> 1 then raise exception 'A''s trip was modified or deleted by B'; end if;

  -- anon sees nothing
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.trips;
    raise exception 'anon could read trips';
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', 'postgres', true);
  raise exception 'PHASE 1 RLS OK (all test rows rolled back)';
end;
$$;
