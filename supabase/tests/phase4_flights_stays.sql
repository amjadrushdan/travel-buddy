-- Phase 4 check: flights and stays, with timezones.
-- Run as a superuser. Always ends in an exception so every test row is rolled back:
--   "PHASE 4 FLIGHTS+STAYS OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  v uuid := gen_random_uuid();  -- viewer
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; f uuid; st uuid; n int; t text; dur interval;
begin
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}',    'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}',   'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  -- MH 88: 23:30 in KL (UTC+8) to 07:35 next day in Tokyo (UTC+9)
  insert into public.flights (trip_id, airline, flight_no, from_airport, to_airport,
                              depart_at, depart_tz, arrive_at, arrive_tz, pnr, passengers)
  values (trip, 'Malaysia Airlines', 'MH 88', 'KUL', 'NRT',
          timestamp '2026-12-12 23:30' at time zone 'Asia/Kuala_Lumpur', 'Asia/Kuala_Lumpur',
          timestamp '2026-12-13 07:35' at time zone 'Asia/Tokyo', 'Asia/Tokyo', '7XK2QD', array[o])
  returning id into f;

  -- stored as exact UTC instants
  select to_char(depart_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') into t from public.flights where id = f;
  if t <> '2026-12-12 15:30' then raise exception 'FAIL depart UTC %', t; end if;
  select to_char(arrive_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') into t from public.flights where id = f;
  if t <> '2026-12-12 22:35' then raise exception 'FAIL arrive UTC %', t; end if;
  select arrive_at - depart_at into dur from public.flights where id = f;
  if dur <> interval '7 hours 5 minutes' then raise exception 'FAIL duration %', dur; end if;
  -- and read back in each local zone
  select to_char(arrive_at at time zone arrive_tz, 'HH24:MI') into t from public.flights where id = f;
  if t <> '07:35' then raise exception 'FAIL arrive local %', t; end if;

  -- bad data refused
  begin
    update public.flights set depart_tz = 'Mars/Olympus' where id = f;
    raise exception 'FAIL unknown timezone accepted';
  exception when sqlstate '22023' then null; end;
  begin
    update public.flights set arrive_at = depart_at - interval '1 hour' where id = f;
    raise exception 'FAIL arrival before departure accepted';
  exception when check_violation then null; end;
  begin
    update public.flights set flight_no = 'MH88; drop' where id = f;
    raise exception 'FAIL bad flight number accepted';
  exception when check_violation then null; end;

  -- stay in Tokyo: 15:00 in, 11:00 out (JST)
  insert into public.stays (trip_id, name, address, check_in, check_out, tz, booking_ref)
  values (trip, 'Asakusa townhouse', 'Nishiasakusa, Taito',
          timestamp '2026-12-13 15:00' at time zone 'Asia/Tokyo',
          timestamp '2026-12-17 11:00' at time zone 'Asia/Tokyo', 'Asia/Tokyo', 'HMXQ8E2A')
  returning id into st;
  select to_char(check_in at time zone 'UTC', 'YYYY-MM-DD HH24:MI') into t from public.stays where id = st;
  if t <> '2026-12-13 06:00' then raise exception 'FAIL check-in UTC %', t; end if;
  begin
    update public.stays set map_url = 'javascript:alert(1)' where id = st;
    raise exception 'FAIL javascript: map_url accepted';
  exception when check_violation then null; end;
  begin
    update public.stays set check_out = check_in where id = st;
    raise exception 'FAIL zero-length stay accepted';
  exception when check_violation then null; end;

  -- viewer reads (including PNR) but cannot write
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.flights where pnr = '7XK2QD';
  if n <> 1 then raise exception 'FAIL viewer cannot read flight'; end if;
  select count(*) into n from public.stays;
  if n <> 1 then raise exception 'FAIL viewer cannot read stay'; end if;
  begin
    insert into public.stays (trip_id, name, check_in, check_out, tz)
    values (trip, 'nope', now(), now() + interval '1 day', 'Asia/Tokyo');
    raise exception 'FAIL viewer inserted stay';
  exception when insufficient_privilege then null; end;
  update public.flights set pnr = 'HACKED' where id = f;
  delete from public.stays where id = st;

  -- stranger sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.flights;
  if n <> 0 then raise exception 'FAIL stranger sees flights'; end if;
  select count(*) into n from public.stays;
  if n <> 0 then raise exception 'FAIL stranger sees stays'; end if;

  -- anon blocked
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.flights;
    raise exception 'FAIL anon read flights';
  exception when insufficient_privilege then null; end;

  -- viewer's writes did nothing
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.flights where id = f and pnr = '7XK2QD';
  if n <> 1 then raise exception 'FAIL viewer changed the PNR'; end if;
  select count(*) into n from public.stays where id = st;
  if n <> 1 then raise exception 'FAIL viewer deleted the stay'; end if;

  raise exception 'PHASE 4 FLIGHTS+STAYS OK (all test rows rolled back)';
end;
$$;
