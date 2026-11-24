-- Day titles, bookings, documents and document storage limits.
-- Run as a superuser; always ends in an exception so it rolls back:
--   "DAYS/BOOKINGS/DOCS OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  o uuid := gen_random_uuid();  -- owner
  v uuid := gen_random_uuid();  -- viewer
  s uuid := gen_random_uuid();  -- stranger
  trip uuid; other uuid; b uuid; ob uuid; d uuid; n int; i int; p text;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (o, '{"name":"Owner"}', 'authenticated', 'authenticated', true),
    (v, '{"name":"Viewer"}', 'authenticated', 'authenticated', true),
    (s, '{"name":"Stranger"}', 'authenticated', 'authenticated', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  other := public.create_trip('Other', null, null, null);
  insert into public.bookings (trip_id, title, starts_at, tz) values (other, 'Other car', now(), 'Asia/Tokyo') returning id into ob;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  perform set_config('role', 'postgres', true);
  insert into public.trip_members (trip_id, user_id, role) values (trip, v, 'viewer');
  perform set_config('role', 'authenticated', true);

  -- day titles
  insert into public.plan_days (trip_id, day, title) values (trip, '2026-12-13', 'Shibuya & Harajuku');
  update public.plan_days set title = 'Harajuku day' where trip_id = trip and day = '2026-12-13';
  begin
    insert into public.plan_days (trip_id, day, title) values (trip, '2026-12-13', 'dupe');
    raise exception 'FAIL duplicate day title';
  exception when unique_violation then null; end;

  -- bookings
  insert into public.bookings (trip_id, kind, title, provider, starts_at, ends_at, tz, location, ref, price, currency)
  values (trip, 'car', 'Car rental', 'Easygo', timestamp '2026-12-16 08:00' at time zone 'Asia/Tokyo',
          timestamp '2026-12-17 12:00' at time zone 'Asia/Tokyo', 'Asia/Tokyo', 'Tokyo Airbnb', 'EG123', 60940, 'JPY')
  returning id into b;
  begin
    update public.bookings set tz = 'Mars/Base' where id = b;
    raise exception 'FAIL unknown timezone';
  exception when sqlstate '22023' then null; end;
  begin
    update public.bookings set ends_at = starts_at - interval '1 hour' where id = b;
    raise exception 'FAIL end before start';
  exception when check_violation then null; end;
  begin
    update public.bookings set url = 'javascript:x' where id = b;
    raise exception 'FAIL unsafe url';
  exception when check_violation then null; end;

  -- documents: path must be in own trip folder; parent must be in same trip
  p := trip || '/' || gen_random_uuid() || '.pdf';
  insert into storage.objects (bucket_id, name, owner) values ('trip-docs', p, o);
  insert into public.documents (trip_id, booking_id, name, path, mime, size) values (trip, b, 'Voucher.pdf', p, 'application/pdf', 1000) returning id into d;
  begin
    insert into public.documents (trip_id, booking_id, name, path, mime, size)
    values (trip, ob, 'x.pdf', trip || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 10);
    raise exception 'FAIL other trip parent';
  exception when check_violation then null; end;
  begin
    insert into public.documents (trip_id, name, path, mime, size) values (trip, 'x.pdf', other || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 10);
    raise exception 'FAIL path in other trip folder';
  exception when check_violation then null; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-docs', trip || '/evil.exe', o);
    raise exception 'FAIL bad file name';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-docs', other || '/' || gen_random_uuid() || '.pdf', o);
    raise exception 'FAIL upload into other trip';
  exception when insufficient_privilege then null; end;

  -- viewer reads all, writes nothing
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select count(*) into n from public.bookings where trip_id = trip;
  if n <> 1 then raise exception 'FAIL viewer bookings %', n; end if;
  select count(*) into n from public.documents where trip_id = trip;
  if n <> 1 then raise exception 'FAIL viewer docs %', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'trip-docs' and name = p;
  if n <> 1 then raise exception 'FAIL viewer cannot see the file'; end if;
  begin
    insert into public.plan_days (trip_id, day, title) values (trip, '2026-12-14', 'nope');
    raise exception 'FAIL viewer day title';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-docs', trip || '/' || gen_random_uuid() || '.pdf', v);
    raise exception 'FAIL viewer upload';
  exception when insufficient_privilege then null; end;
  delete from public.documents where id = d;

  -- stranger sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  select count(*) into n from public.documents where trip_id = trip;
  if n <> 0 then raise exception 'FAIL stranger docs'; end if;
  select count(*) into n from storage.objects where bucket_id = 'trip-docs' and name = p;
  if n <> 0 then raise exception 'FAIL stranger file'; end if;

  -- daily cap: 30 uploads per trip per day (1 used above)
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  for i in 2..30 loop
    insert into storage.objects (bucket_id, name, owner) values ('trip-docs', trip || '/' || gen_random_uuid() || '.pdf', o);
  end loop;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('trip-docs', trip || '/' || gen_random_uuid() || '.pdf', o);
    raise exception 'FAIL 31st upload in a day';
  exception when insufficient_privilege then null; end;

  perform set_config('role', 'postgres', true);
  select count(*) into n from public.documents where id = d;
  if n <> 1 then raise exception 'FAIL viewer deleted a document'; end if;
  select count(*) into n from storage.buckets where id = 'trip-docs' and not public and file_size_limit = 10485760;
  if n <> 1 then raise exception 'FAIL bucket limits'; end if;

  raise exception 'DAYS/BOOKINGS/DOCS OK (all test rows rolled back)';
end;
$$;
