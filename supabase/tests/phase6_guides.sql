-- Phase 6 check: guide notes. Run as a superuser; always ends in an exception so it rolls back:
--   "PHASE 6 GUIDES OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  trip uuid; g uuid; n int; t text;
begin
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}', 'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}', 'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  insert into public.guides (trip_id, category, title, body_md)
  values (trip, 'food', 'Halal-friendly eating', E'Look for the sticker.\n\n- Naritaya Asakusa')
  returning id into g;
  update public.guides set title = 'Halal eating' where id = g;
  select title into t from public.guides where id = g;
  if t <> 'Halal eating' then raise exception 'FAIL owner edit'; end if;

  begin
    update public.guides set category = 'nightlife' where id = g;
    raise exception 'FAIL unknown category accepted';
  exception when check_violation then null; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.guides;
  if n <> 1 then raise exception 'FAIL viewer read'; end if;
  begin
    insert into public.guides (trip_id, title) values (trip, 'nope');
    raise exception 'FAIL viewer inserted';
  exception when insufficient_privilege then null; end;
  delete from public.guides where id = g;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.guides;
  if n <> 0 then raise exception 'FAIL stranger sees guides'; end if;

  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.guides;
    raise exception 'FAIL anon read';
  exception when insufficient_privilege then null; end;

  perform set_config('role', 'postgres', true);
  select count(*) into n from public.guides where id = g;
  if n <> 1 then raise exception 'FAIL viewer deleted a guide'; end if;

  raise exception 'PHASE 6 GUIDES OK (all test rows rolled back)';
end;
$$;
