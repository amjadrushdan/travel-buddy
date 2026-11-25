-- Food checks. Run as a superuser; always ends in an exception (rollback):
--   "FOOD CHECKS OK" = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  v uuid := gen_random_uuid();  -- viewer
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; fc uuid; n int; who uuid;
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

  -- a viewer can add a check; checked_by is stamped
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  insert into public.food_checks (trip_id, barcode, name, ingredients) values (trip, '4901085613801', 'Onigiri', 'ごはん、鮭、酒精')
  returning id into fc;
  select checked_by into who from public.food_checks where id = fc;
  if who is distinct from v then raise exception 'FAIL checked_by not stamped'; end if;

  -- one reading per barcode per trip
  begin
    insert into public.food_checks (trip_id, barcode, ingredients) values (trip, '4901085613801', 'x');
    raise exception 'FAIL duplicate barcode accepted';
  exception when unique_violation then null; end;

  -- bad barcode / empty ingredients rejected
  begin
    insert into public.food_checks (trip_id, barcode, ingredients) values (trip, '12ab', 'x');
    raise exception 'FAIL bad barcode accepted';
  exception when check_violation then null; end;
  begin
    insert into public.food_checks (trip_id, ingredients) values (trip, '');
    raise exception 'FAIL empty ingredients accepted';
  exception when check_violation then null; end;

  -- checked_by can't be forged
  begin
    insert into public.food_checks (trip_id, ingredients, checked_by) values (trip, 'x', o);
    raise exception 'FAIL checked_by writable';
  exception when insufficient_privilege then null; end;

  -- the owner can update and delete it; checked_by moves to the owner
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  update public.food_checks set ingredients = 'ごはん、鮭、塩' where id = fc;
  select checked_by into who from public.food_checks where id = fc;
  if who is distinct from o then raise exception 'FAIL update did not restamp'; end if;

  -- a stranger sees nothing and can't add or delete
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.food_checks where trip_id = trip;
  if n <> 0 then raise exception 'FAIL stranger can read'; end if;
  begin
    insert into public.food_checks (trip_id, ingredients) values (trip, 'x');
    raise exception 'FAIL stranger can insert';
  exception when insufficient_privilege then null; end;
  delete from public.food_checks where id = fc;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  select count(*) into n from public.food_checks where id = fc;
  if n <> 1 then raise exception 'FAIL stranger deleted'; end if;

  -- viewer can't delete a check the owner now holds
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  delete from public.food_checks where id = fc;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  select count(*) into n from public.food_checks where id = fc;
  if n <> 1 then raise exception 'FAIL viewer deleted someone else''s check'; end if;
  delete from public.food_checks where id = fc;
  select count(*) into n from public.food_checks where id = fc;
  if n <> 0 then raise exception 'FAIL owner could not delete'; end if;

  raise exception 'FOOD CHECKS OK';
end $$;
