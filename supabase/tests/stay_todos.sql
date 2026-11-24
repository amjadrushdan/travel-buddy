-- Stay details + shared to-dos check. Run as a superuser; always ends in an exception (rollback):
--   "STAY TODOS OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  v uuid := gen_random_uuid();  -- viewer
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; other uuid; st uuid; ost uuid; td uuid; n int; who uuid;
begin
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}', 'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}', 'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  other := public.create_trip('Other', null, null, null);
  insert into public.stays (trip_id, name, check_in, check_out, tz)
  values (other, 'Other stay', now(), now() + interval '1 day', 'Asia/Tokyo') returning id into ost;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  -- new structured fields
  insert into public.stays (trip_id, name, check_in, check_out, tz, platform, host, address_local, checkin_info, door_code, wifi)
  values (trip, 'Tokyo Airbnb', timestamp '2026-12-12 16:00' at time zone 'Asia/Tokyo', timestamp '2026-12-16 10:00' at time zone 'Asia/Tokyo',
          'Asia/Tokyo', 'airbnb', 'Host', '東京都江東区大島3-20-25', 'Self check-in', '1234', 'net / pass')
  returning id into st;
  begin
    update public.stays set platform = 'couchsurf' where id = st;
    raise exception 'FAIL unknown platform accepted';
  exception when check_violation then null; end;
  begin
    update public.stays set booking_url = 'javascript:alert(1)' where id = st;
    raise exception 'FAIL unsafe booking link accepted';
  exception when check_violation then null; end;

  -- to-dos: add, tick (done_by filled), untick (cleared)
  insert into public.stay_todos (trip_id, stay_id, text) values (trip, st, 'Fill guest form') returning id into td;
  update public.stay_todos set done = true where id = td;
  select done_by into who from public.stay_todos where id = td;
  if who is distinct from o then raise exception 'FAIL done_by not set'; end if;
  update public.stay_todos set done = false where id = td;
  select count(*) into n from public.stay_todos where id = td and done_by is null and done_at is null;
  if n <> 1 then raise exception 'FAIL untick did not clear done_by'; end if;

  -- can't attach a to-do to another trip's stay
  begin
    insert into public.stay_todos (trip_id, stay_id, text) values (trip, ost, 'sneaky');
    raise exception 'FAIL cross-trip todo accepted';
  exception when check_violation then null; end;

  -- viewer sees but can't change
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.stay_todos where trip_id = trip;
  if n <> 1 then raise exception 'FAIL viewer sees % todos', n; end if;
  update public.stay_todos set done = true where id = td;
  begin
    insert into public.stay_todos (trip_id, stay_id, text) values (trip, st, 'nope');
    raise exception 'FAIL viewer added a todo';
  exception when insufficient_privilege then null; end;

  -- stranger sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.stay_todos where trip_id = trip;
  if n <> 0 then raise exception 'FAIL stranger sees todos'; end if;

  perform set_config('role', 'postgres', true);
  select count(*) into n from public.stay_todos where id = td and not done;
  if n <> 1 then raise exception 'FAIL viewer ticked a todo'; end if;

  -- deleting the stay removes its to-dos
  delete from public.stays where id = st;
  select count(*) into n from public.stay_todos where id = td;
  if n <> 0 then raise exception 'FAIL todo left after stay delete'; end if;

  raise exception 'STAY TODOS OK (all test rows rolled back)';
end;
$$;
