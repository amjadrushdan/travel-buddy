-- Member removal check. Run as a superuser; always ends in an exception so it rolls back:
--   "MEMBER REMOVAL OK ..." = pass, "FAIL ..." = the assertion that broke.
-- Only the owner (trip creator) can remove members; nobody can remove the owner;
-- a removed member immediately loses access to the trip and its data.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  e uuid := gen_random_uuid();  -- editor
  v uuid := gen_random_uuid();  -- viewer
  trip uuid; n int;
begin
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}',  'authenticated', 'authenticated', true),
    (e, '{"name":"Editor"}', 'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  insert into public.itinerary_items (trip_id, day, title) values (trip, '2026-12-13', 'Sensō-ji');
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, e, 'editor'), (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  -- every member can see the full member list
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.trip_members where trip_id = trip;
  if n <> 3 then raise exception 'FAIL viewer sees % members', n; end if;

  -- an editor can't remove anyone else, and nobody can remove the owner
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  delete from public.trip_members where trip_id = trip and user_id = v;
  delete from public.trip_members where trip_id = trip and user_id = o;
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.trip_members where trip_id = trip;
  if n <> 3 then raise exception 'FAIL editor removed someone (% left)', n; end if;
  perform set_config('role', 'authenticated', true);

  -- the owner can't remove themselves (the trip would have no owner)
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  delete from public.trip_members where trip_id = trip and user_id = o;
  select count(*) into n from public.trip_members where trip_id = trip and user_id = o;
  if n <> 1 then raise exception 'FAIL owner removed themselves'; end if;

  -- the owner removes the editor
  delete from public.trip_members where trip_id = trip and user_id = e;
  select count(*) into n from public.trip_members where trip_id = trip;
  if n <> 2 then raise exception 'FAIL owner could not remove the editor'; end if;

  -- the removed editor now sees nothing and can't write
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  select count(*) into n from public.trips where id = trip;
  if n <> 0 then raise exception 'FAIL removed member still sees the trip'; end if;
  select count(*) into n from public.itinerary_items where trip_id = trip;
  if n <> 0 then raise exception 'FAIL removed member still sees the plan'; end if;
  begin
    insert into public.itinerary_items (trip_id, day, title) values (trip, '2026-12-14', 'sneaky');
    raise exception 'FAIL removed member could still add to the plan';
  exception when insufficient_privilege then null; end;

  perform set_config('role', 'postgres', true);
  raise exception 'MEMBER REMOVAL OK (all test rows rolled back)';
end;
$$;
