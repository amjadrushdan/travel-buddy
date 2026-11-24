-- Day titles, other bookings (cars, transfers, tickets), documents (PDF/photo) and stay
-- coordinates (for prayer times and weather). Same access shape as the rest of the trip:
-- members read; owners and editors write.

-- ---------------------------------------------------------------- stay coordinates
alter table public.stays
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add constraint stays_latlng_pair check ((lat is null) = (lng is null));
grant insert (lat, lng) on public.stays to authenticated;
grant update (lat, lng) on public.stays to authenticated;

-- ---------------------------------------------------------------- day titles
create table public.plan_days (
  trip_id  uuid not null references public.trips (id) on delete cascade,
  day      date not null,
  title    text not null check (char_length(title) between 1 and 80),
  primary key (trip_id, day)
);
alter table public.plan_days enable row level security;
create policy plan_days_select on public.plan_days for select to authenticated using (private.trip_role(trip_id) is not null);
create policy plan_days_insert on public.plan_days for insert to authenticated with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy plan_days_update on public.plan_days for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor')) with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy plan_days_delete on public.plan_days for delete to authenticated using (private.trip_role(trip_id) in ('owner', 'editor'));
revoke all on public.plan_days from anon;
revoke insert, update on public.plan_days from authenticated;
grant insert (trip_id, day, title) on public.plan_days to authenticated;
grant update (title) on public.plan_days to authenticated;

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  kind          text not null default 'other' check (kind in ('car', 'transfer', 'ticket', 'activity', 'other')),
  title         text not null check (char_length(title) between 1 and 120),
  provider      text check (char_length(provider) <= 80),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  tz            text not null check (char_length(tz) <= 64),
  location      text check (char_length(location) <= 200),
  location_end  text check (char_length(location_end) <= 200),
  ref           text check (char_length(ref) <= 60),
  price         numeric(12, 2) check (price >= 0),
  currency      text check (currency ~ '^[A-Z]{3}$'),
  url           text check (url ~ '^https://' and char_length(url) <= 2000),
  notes         text check (char_length(notes) <= 2000),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bookings_order check (ends_at is null or ends_at >= starts_at)
);
create index bookings_trip_idx on public.bookings (trip_id, starts_at);
create trigger bookings_tz before insert or update on public.bookings for each row execute function private.check_timezones();
create trigger bookings_touch before update on public.bookings for each row execute function private.touch_updated_at();
alter table public.bookings enable row level security;
create policy bookings_select on public.bookings for select to authenticated using (private.trip_role(trip_id) is not null);
create policy bookings_insert on public.bookings for insert to authenticated with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy bookings_update on public.bookings for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor')) with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy bookings_delete on public.bookings for delete to authenticated using (private.trip_role(trip_id) in ('owner', 'editor'));
revoke all on public.bookings from anon;
revoke insert, update on public.bookings from authenticated;
grant insert (trip_id, kind, title, provider, starts_at, ends_at, tz, location, location_end, ref, price, currency, url, notes)
  on public.bookings to authenticated;
grant update (kind, title, provider, starts_at, ends_at, tz, location, location_end, ref, price, currency, url, notes)
  on public.bookings to authenticated;

-- ---------------------------------------------------------------- documents
-- Files live in the private trip-docs bucket at "<trip id>/<uuid>.<pdf|jpg|png|webp>".
create function private.doc_trip(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;
revoke all on function private.doc_trip(text) from public, anon;
grant execute on function private.doc_trip(text) to authenticated;

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  flight_id   uuid references public.flights (id) on delete cascade,
  stay_id     uuid references public.stays (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  path        text not null unique,
  mime        text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size        int not null check (size between 1 and 10485760),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint documents_one_parent check (num_nonnulls(flight_id, stay_id, booking_id) <= 1),
  constraint documents_path_ok check (private.doc_trip(path) = trip_id)
);
create index documents_trip_idx on public.documents (trip_id, created_at);

-- The parent (flight/stay/booking) must be in the same trip.
create function private.document_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.flight_id is not null and not exists (select 1 from public.flights where id = new.flight_id and trip_id = new.trip_id))
     or (new.stay_id is not null and not exists (select 1 from public.stays where id = new.stay_id and trip_id = new.trip_id))
     or (new.booking_id is not null and not exists (select 1 from public.bookings where id = new.booking_id and trip_id = new.trip_id)) then
    raise exception 'document parent is not in this trip' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.document_guard() from public, anon, authenticated;
create trigger documents_guard before insert or update on public.documents for each row execute function private.document_guard();

alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated using (private.trip_role(trip_id) is not null);
create policy documents_insert on public.documents for insert to authenticated with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy documents_update on public.documents for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor')) with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy documents_delete on public.documents for delete to authenticated using (private.trip_role(trip_id) in ('owner', 'editor'));
revoke all on public.documents from anon;
revoke insert, update on public.documents from authenticated;
grant insert (trip_id, flight_id, stay_id, booking_id, name, path, mime, size) on public.documents to authenticated;
grant update (name) on public.documents to authenticated;

-- ---------------------------------------------------------------- document storage + limits
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-docs', 'trip-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table private.doc_upload_log (trip_id uuid not null, at timestamptz not null default now());
create index doc_upload_log_trip_at on private.doc_upload_log (trip_id, at);
revoke all on private.doc_upload_log from public, anon, authenticated;

-- Limits: 100 files per trip, 30 uploads per trip per 24h (file size/type: bucket settings).
create function private.doc_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid := private.doc_trip(new.name);
begin
  if new.bucket_id <> 'trip-docs' then return new; end if;
  if v_trip is null then raise exception 'document file name not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('trip-docs:' || v_trip::text));
  if (select count(*) from storage.objects where bucket_id = 'trip-docs' and name like v_trip::text || '/%') >= 100 then
    raise exception 'document limit: 100 files per trip' using errcode = '42501';
  end if;
  if (select count(*) from private.doc_upload_log where trip_id = v_trip and at > now() - interval '24 hours') >= 30 then
    raise exception 'document limit: 30 uploads per trip per day' using errcode = '42501';
  end if;
  insert into private.doc_upload_log (trip_id) values (v_trip);
  delete from private.doc_upload_log where at < now() - interval '2 days';
  return new;
end;
$$;
revoke all on function private.doc_before_insert() from public, anon, authenticated;
create trigger trip_docs_limits before insert on storage.objects
  for each row when (new.bucket_id = 'trip-docs') execute function private.doc_before_insert();

create policy trip_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'trip-docs' and private.trip_role(private.doc_trip(name)) is not null);
create policy trip_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-docs' and private.trip_role(private.doc_trip(name)) in ('owner', 'editor'));
create policy trip_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-docs' and private.trip_role(private.doc_trip(name)) in ('owner', 'editor'));

alter publication supabase_realtime add table public.plan_days, public.bookings, public.documents;
