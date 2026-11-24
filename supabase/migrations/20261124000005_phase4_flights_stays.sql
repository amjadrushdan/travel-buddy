-- Phase 4: flights and stays.
-- Done when: times show correctly across timezones.
-- Every moment is stored as UTC (timestamptz) plus the IANA timezone it happens in,
-- so "23:30 MYT" and "07:35 JST" are both exact. Members read; owners and editors write.

-- True when tz is a timezone Postgres knows (e.g. 'Asia/Tokyo').
create function private.is_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

revoke all on function private.is_timezone(text) from public, anon;
grant execute on function private.is_timezone(text) to authenticated;

create table public.flights (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  airline       text check (char_length(airline) <= 60),
  flight_no     text not null check (flight_no ~ '^[A-Z0-9]{2,3} ?[0-9]{1,4}[A-Z]?$'),
  from_airport  text not null check (from_airport ~ '^[A-Z]{3}$'),
  to_airport    text not null check (to_airport ~ '^[A-Z]{3}$'),
  depart_at     timestamptz not null,
  depart_tz     text not null check (char_length(depart_tz) <= 64),
  arrive_at     timestamptz not null,
  arrive_tz     text not null check (char_length(arrive_tz) <= 64),
  pnr           text check (pnr ~ '^[A-Z0-9]{5,8}$'),
  passengers    uuid[] not null default '{}' check (cardinality(passengers) <= 50),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint flights_order check (arrive_at > depart_at and arrive_at - depart_at < interval '30 hours')
);

create table public.stays (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  address      text check (char_length(address) <= 300),
  map_url      text check (map_url ~ '^https://' and char_length(map_url) <= 2000),
  check_in     timestamptz not null,
  check_out    timestamptz not null,
  tz           text not null check (char_length(tz) <= 64),
  booking_ref  text check (char_length(booking_ref) <= 40),
  notes        text check (char_length(notes) <= 2000),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint stays_order check (check_out > check_in)
);

create index flights_trip_idx on public.flights (trip_id, depart_at);
create index stays_trip_idx on public.stays (trip_id, check_in);

-- Timezones must be real IANA names (a CHECK can't run a query, so a trigger does it).
create function private.check_timezones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'flights' then
    if not private.is_timezone(new.depart_tz) or not private.is_timezone(new.arrive_tz) then
      raise exception 'unknown timezone' using errcode = '22023';
    end if;
  elsif not private.is_timezone(new.tz) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.check_timezones() from public, anon, authenticated;

create trigger flights_tz before insert or update on public.flights
  for each row execute function private.check_timezones();
create trigger stays_tz before insert or update on public.stays
  for each row execute function private.check_timezones();
create trigger flights_touch before update on public.flights
  for each row execute function private.touch_updated_at();
create trigger stays_touch before update on public.stays
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------
-- RLS (same shape as itinerary_items)
-- ---------------------------------------------------------------
alter table public.flights enable row level security;
alter table public.stays   enable row level security;

create policy flights_select on public.flights for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy flights_insert on public.flights for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy flights_update on public.flights for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy flights_delete on public.flights for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));

create policy stays_select on public.stays for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy stays_insert on public.stays for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy stays_update on public.stays for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy stays_delete on public.stays for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));

-- ---------------------------------------------------------------
-- Grants: no anon; clients can't change trip_id, created_by or timestamps
-- ---------------------------------------------------------------
revoke all on public.flights, public.stays from anon;
revoke insert, update on public.flights, public.stays from authenticated;

grant insert (trip_id, airline, flight_no, from_airport, to_airport, depart_at, depart_tz,
              arrive_at, arrive_tz, pnr, passengers) on public.flights to authenticated;
grant update (airline, flight_no, from_airport, to_airport, depart_at, depart_tz,
              arrive_at, arrive_tz, pnr, passengers) on public.flights to authenticated;

grant insert (trip_id, name, address, map_url, check_in, check_out, tz, booking_ref, notes)
  on public.stays to authenticated;
grant update (name, address, map_url, check_in, check_out, tz, booking_ref, notes)
  on public.stays to authenticated;
