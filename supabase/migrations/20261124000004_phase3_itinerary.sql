-- Phase 3: itinerary items, by day.
-- Done when: members can add, edit and reorder items by day.
-- Members read; owners and editors write. Viewers are read-only.

create table public.itinerary_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  day         date not null,
  start_time  time,
  title       text not null check (char_length(title) between 1 and 120),
  place       text check (char_length(place) <= 200),
  -- Google Maps (or any https) link only; blocks javascript: and other schemes
  map_url     text check (map_url ~ '^https://' and char_length(map_url) <= 2000),
  notes       text check (char_length(notes) <= 2000),
  sort_order  int not null default 0,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index itinerary_items_trip_day_idx on public.itinerary_items (trip_id, day, sort_order);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

create trigger itinerary_items_touch
  before update on public.itinerary_items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.itinerary_items enable row level security;

create policy itinerary_select on public.itinerary_items
  for select to authenticated
  using (private.trip_role(trip_id) is not null);

create policy itinerary_insert on public.itinerary_items
  for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));

create policy itinerary_update on public.itinerary_items
  for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));

create policy itinerary_delete on public.itinerary_items
  for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));

-- ---------------------------------------------------------------
-- Grants: no anon; clients can't change trip_id, created_by or timestamps
-- ---------------------------------------------------------------
revoke all on public.itinerary_items from anon;
revoke insert, update on public.itinerary_items from authenticated;

grant insert (trip_id, day, start_time, title, place, map_url, notes, sort_order)
  on public.itinerary_items to authenticated;
grant update (day, start_time, title, place, map_url, notes, sort_order)
  on public.itinerary_items to authenticated;

-- ---------------------------------------------------------------
-- reorder_itinerary_day: renumber one day's items in the given order.
-- SECURITY INVOKER, so the update policy above still decides who may do it.
-- p_ids must be exactly the day's items (no more, no fewer).
-- ---------------------------------------------------------------
create function public.reorder_itinerary_day(p_trip_id uuid, p_day date, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing uuid[];
begin
  if coalesce(private.trip_role(p_trip_id), '') not in ('owner', 'editor') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_existing
  from public.itinerary_items
  where trip_id = p_trip_id and day = p_day;

  if v_existing <> (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) then
    raise exception 'the day changed, reload and try again' using errcode = '40001';
  end if;

  update public.itinerary_items i
  set sort_order = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where i.id = o.id and i.trip_id = p_trip_id and i.day = p_day;
end;
$$;

revoke all on function public.reorder_itinerary_day(uuid, date, uuid[]) from public, anon;
grant execute on function public.reorder_itinerary_day(uuid, date, uuid[]) to authenticated;
