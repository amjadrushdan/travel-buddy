-- Cover photo storage check. Run as a superuser; always ends in an exception so it rolls back:
--   "TRIP COVERS OK ..." = pass, "FAIL ..." = the assertion that broke.
-- Inserts rows into storage.objects directly to exercise the same RLS the Storage API uses.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  v uuid := gen_random_uuid();  -- viewer
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; other uuid; n int; p1 text; p2 text; p3 text; i int;
begin
  -- What the Storage API sets before deleting; lets this test delete rows (RLS still applies).
  perform set_config('storage.allow_delete_query', 'true', true);
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}', 'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}', 'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  other := public.create_trip('Stranger trip', null, null, null);
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  p1 := trip || '/cover-1764000000001.webp';
  p2 := trip || '/cover-1764000000002.webp';
  p3 := trip || '/cover-1764000000003.webp';

  -- owner uploads and sets the cover
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name, owner) values ('trip-covers', p1, o);
  update public.trips set cover_url = p1 where id = trip;

  -- a second file is allowed (swap), a third is not
  insert into storage.objects (bucket_id, name, owner) values ('trip-covers', p2, o);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-covers', p3, o);
    raise exception 'FAIL third file allowed';
  exception when insufficient_privilege then null; end;

  -- bad names refused: wrong pattern, another trip's folder
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-covers', trip || '/evil.png', o);
    raise exception 'FAIL bad file name allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-covers', other || '/cover-1764000000009.webp', o);
    raise exception 'FAIL upload into a trip I am not in';
  exception when insufficient_privilege then null; end;

  -- cover_url must point into the trip's own folder
  begin
    update public.trips set cover_url = other || '/cover-1764000000009.webp' where id = trip;
    raise exception 'FAIL cover_url pointing at another trip accepted';
  exception when check_violation then null; end;

  -- owner deletes the old file
  delete from storage.objects where bucket_id = 'trip-covers' and name = p1;
  select count(*) into n from storage.objects where bucket_id = 'trip-covers' and name like trip || '/%';
  if n <> 1 then raise exception 'FAIL owner delete, % files left', n; end if;

  -- viewer can see the file but not add or remove
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'trip-covers' and name like trip || '/%';
  if n <> 1 then raise exception 'FAIL viewer sees % files', n; end if;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-covers', p3, v);
    raise exception 'FAIL viewer uploaded';
  exception when insufficient_privilege then null; end;
  delete from storage.objects where bucket_id = 'trip-covers' and name = p2;

  -- stranger sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'trip-covers' and name like trip || '/%';
  if n <> 0 then raise exception 'FAIL stranger sees cover files'; end if;

  -- daily cap: 10 uploads per trip per 24h (2 used above; the refused third didn't count)
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'trip-covers' and name = p2;
  if n <> 1 then raise exception 'FAIL viewer deleted the cover'; end if;
  for i in 1..8 loop
    delete from storage.objects where bucket_id = 'trip-covers' and name like trip || '/%' and name <> p2;
    insert into storage.objects (bucket_id, name, owner) values ('trip-covers', trip || '/cover-17640000001' || lpad(i::text, 2, '0') || '.webp', o);
  end loop;
  delete from storage.objects where bucket_id = 'trip-covers' and name like trip || '/%' and name <> p2;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-covers', trip || '/cover-1764000000199.webp', o);
    raise exception 'FAIL 11th upload in a day allowed';
  exception when insufficient_privilege then null; end;

  -- bucket limits
  perform set_config('role', 'postgres', true);
  select count(*) into n from storage.buckets
    where id = 'trip-covers' and not public and file_size_limit = 1048576
      and allowed_mime_types = array['image/webp', 'image/jpeg'];
  if n <> 1 then raise exception 'FAIL bucket limits not set'; end if;

  raise exception 'TRIP COVERS OK (all test rows rolled back)';
end;
$$;
