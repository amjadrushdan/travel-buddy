-- Phase 3 check: itinerary items by day.
-- Run as a superuser. Always ends in an exception so every test row is rolled back:
--   "PHASE 3 ITINERARY OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  e uuid := gen_random_uuid();  -- editor
  v uuid := gen_random_uuid();  -- viewer
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; i1 uuid; i2 uuid; i3 uuid; n int; t text; ids uuid[];
begin
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}',    'authenticated', 'authenticated', true),
    (e, '{"name":"Editor"}',   'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}',   'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');

  -- add members directly as superuser
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, e, 'editor'), (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  -- owner adds items
  insert into public.itinerary_items (trip_id, day, start_time, title, place, sort_order)
  values (trip, '2026-12-13', '07:35', 'Land at Narita', 'Narita Airport', 1) returning id into i1;
  insert into public.itinerary_items (trip_id, day, start_time, title, sort_order)
  values (trip, '2026-12-13', '09:10', 'Narita Express', 2) returning id into i2;

  -- editor adds and edits
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  insert into public.itinerary_items (trip_id, day, title, sort_order)
  values (trip, '2026-12-13', 'Sensō-ji', 3) returning id into i3;
  update public.itinerary_items set title = 'Narita Express to Asakusa' where id = i2;
  select title into t from public.itinerary_items where id = i2;
  if t <> 'Narita Express to Asakusa' then raise exception 'FAIL editor edit: %', t; end if;

  -- created_by filled from the session
  select count(*) into n from public.itinerary_items where id = i3 and created_by = e;
  if n <> 1 then raise exception 'FAIL created_by not set'; end if;

  -- reorder: i3, i1, i2
  perform public.reorder_itinerary_day(trip, '2026-12-13', array[i3, i1, i2]);
  select array_agg(id order by sort_order) into ids from public.itinerary_items where trip_id = trip and day = '2026-12-13';
  if ids <> array[i3, i1, i2] then raise exception 'FAIL reorder order'; end if;

  -- reorder with a stale/incomplete list is refused
  begin
    perform public.reorder_itinerary_day(trip, '2026-12-13', array[i1, i2]);
    raise exception 'FAIL partial reorder accepted';
  exception when sqlstate '40001' then null; end;

  -- unsafe map link refused
  begin
    update public.itinerary_items set map_url = 'javascript:alert(1)' where id = i1;
    raise exception 'FAIL javascript: map_url accepted';
  exception when check_violation then null; end;

  -- cannot move an item to another trip (column not granted)
  begin
    update public.itinerary_items set trip_id = gen_random_uuid() where id = i1;
    raise exception 'FAIL trip_id changed';
  exception when insufficient_privilege then null; end;

  -- viewer reads but cannot write
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.itinerary_items where trip_id = trip;
  if n <> 3 then raise exception 'FAIL viewer sees % items', n; end if;
  begin
    insert into public.itinerary_items (trip_id, day, title) values (trip, '2026-12-14', 'nope');
    raise exception 'FAIL viewer inserted';
  exception when insufficient_privilege then null; end;
  update public.itinerary_items set title = 'hacked' where id = i1;
  delete from public.itinerary_items where id = i1;
  begin
    perform public.reorder_itinerary_day(trip, '2026-12-13', array[i1, i2, i3]);
    raise exception 'FAIL viewer reordered';
  exception when insufficient_privilege then null; end;

  -- stranger sees and changes nothing
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.itinerary_items;
  if n <> 0 then raise exception 'FAIL stranger sees % items', n; end if;
  begin
    insert into public.itinerary_items (trip_id, day, title) values (trip, '2026-12-14', 'nope');
    raise exception 'FAIL stranger inserted';
  exception when insufficient_privilege then null; end;

  -- anon has no access
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.itinerary_items;
    raise exception 'FAIL anon read items';
  exception when insufficient_privilege then null; end;

  -- back as superuser: viewer's update/delete did nothing
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.itinerary_items where id = i1 and title = 'Land at Narita';
  if n <> 1 then raise exception 'FAIL viewer changed or deleted an item'; end if;

  -- deleting the trip removes its items
  delete from public.trips where id = trip;
  select count(*) into n from public.itinerary_items where trip_id = trip;
  if n <> 0 then raise exception 'FAIL items left after trip delete'; end if;

  raise exception 'PHASE 3 ITINERARY OK (all test rows rolled back)';
end;
$$;
