-- Phase 5 check: shared flight status, claim/dedupe, cache, freeze, cap, and who can read it.
-- Run as a superuser. Uses its own test secret inside the transaction, and always ends in an
-- exception so everything (including the secret swap) is rolled back:
--   "PHASE 5 FLIGHT STATUS OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();  -- member with MH 88 on 12 Dec
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; r text; n int; st text;
  sec text := 'test-secret-phase5';
begin
  update private.app_secrets set hash = extensions.digest(sec, 'sha256') where name = 'flight_status';
  insert into private.app_secrets (name, hash) values ('flight_status', extensions.digest(sec, 'sha256'))
  on conflict (name) do nothing;
  delete from private.api_usage;
  delete from private.api_usage_daily;

  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}',    'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  insert into public.flights (trip_id, flight_no, from_airport, to_airport, depart_at, depart_tz, arrive_at, arrive_tz)
  values (trip, 'MH 88', 'KUL', 'NRT',
          timestamp '2026-12-12 23:30' at time zone 'Asia/Kuala_Lumpur', 'Asia/Kuala_Lumpur',
          timestamp '2026-12-13 07:35' at time zone 'Asia/Tokyo', 'Asia/Tokyo');

  -- wrong secret refused
  begin
    perform public.flight_status_claim('nope', 'MH88', '2026-12-12');
    raise exception 'FAIL wrong secret accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.flight_status_save('nope', 'MH88', '2026-12-12', 'cancelled', null, null, null, null, null, null, null, null);
    raise exception 'FAIL wrong secret saved';
  exception when insufficient_privilege then null; end;

  -- members can't write the table directly
  begin
    insert into public.flight_status (flight_no, flight_date, status) values ('MH88', '2026-12-12', 'cancelled');
    raise exception 'FAIL direct insert allowed';
  exception when insufficient_privilege then null; end;

  -- first open fetches; a second open at the same moment doesn't
  r := public.flight_status_claim(sec, 'MH88', '2026-12-12');
  if r <> 'go' then raise exception 'FAIL first claim %', r; end if;
  r := public.flight_status_claim(sec, 'MH88', '2026-12-12');
  if r <> 'busy' then raise exception 'FAIL concurrent claim %', r; end if;

  perform public.flight_status_save(sec, 'MH88', '2026-12-12', 'delayed', 25,
    timestamp '2026-12-12 23:55' at time zone 'Asia/Kuala_Lumpur',
    timestamp '2026-12-13 08:00' at time zone 'Asia/Tokyo', 'C14', null, 'M', '2', '{"ok":true}');

  -- within the TTL: served from cache, no API call
  r := public.flight_status_claim(sec, 'MH88', '2026-12-12');
  if r <> 'fresh' then raise exception 'FAIL cached claim %', r; end if;
  begin
    select calls into n from private.api_usage;
    raise exception 'FAIL members can read the usage counter';
  exception when insufficient_privilege then null; end;
  perform set_config('role', 'postgres', true);
  select calls into n from private.api_usage where api = 'flight_status';
  if n <> 1 then raise exception 'FAIL expected 1 API call, counted %', n; end if;
  perform set_config('role', 'authenticated', true);

  -- member reads it; raw stays hidden
  select status into st from public.flight_status where flight_no = 'MH88';
  if st <> 'delayed' then raise exception 'FAIL member read %', st; end if;
  begin
    perform raw from public.flight_status;
    raise exception 'FAIL raw column readable';
  exception when insufficient_privilege then null; end;

  -- stranger can't see it
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.flight_status;
  if n <> 0 then raise exception 'FAIL stranger sees status'; end if;

  -- after the TTL it refetches; once landed it freezes
  perform set_config('role', 'postgres', true);
  update public.flight_status set fetched_at = now() - interval '20 minutes' where flight_no = 'MH88';
  perform set_config('role', 'authenticated', true);
  r := public.flight_status_claim(sec, 'MH88', '2026-12-12');
  if r <> 'go' then raise exception 'FAIL stale claim %', r; end if;
  perform public.flight_status_save(sec, 'MH88', '2026-12-12', 'landed', 25, null, null, null, null, null, null, null);
  perform set_config('role', 'postgres', true);
  update public.flight_status set fetched_at = now() - interval '2 days' where flight_no = 'MH88';
  perform set_config('role', 'authenticated', true);
  r := public.flight_status_claim(sec, 'MH88', '2026-12-12');
  if r <> 'frozen' then raise exception 'FAIL landed not frozen %', r; end if;

  -- monthly cap stops calls
  r := public.flight_status_claim(sec, 'XX1', '2026-12-12', 12, 2);
  if r <> 'cap' then raise exception 'FAIL cap not enforced %', r; end if;

  -- a failed fetch releases the claim
  r := public.flight_status_claim(sec, 'JL724', '2026-12-12', 12, 10);
  if r <> 'go' then raise exception 'FAIL claim for release test %', r; end if;
  perform public.flight_status_release(sec, 'JL724', '2026-12-12');
  r := public.flight_status_claim(sec, 'JL724', '2026-12-12', 12, 10);
  if r <> 'go' then raise exception 'FAIL release did not free the claim %', r; end if;

  -- daily cap stops calls even when the monthly cap has room (4 calls made today so far)
  r := public.flight_status_claim(sec, 'NH886', '2026-12-12', 12, 100, 4);
  if r <> 'cap' then raise exception 'FAIL daily cap not enforced %', r; end if;
  r := public.flight_status_claim(sec, 'NH886', '2026-12-12', 12, 100, 5);
  if r <> 'go' then raise exception 'FAIL daily cap blocked too early %', r; end if;

  -- anon can't call the RPCs or read
  perform set_config('role', 'anon', true);
  begin
    perform public.flight_status_claim(sec, 'MH88', '2026-12-12');
    raise exception 'FAIL anon claimed';
  exception when insufficient_privilege then null; end;

  perform set_config('role', 'postgres', true);
  raise exception 'PHASE 5 FLIGHT STATUS OK (all test rows rolled back)';
end;
$$;
