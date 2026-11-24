-- Stay tab upgrade: structured stay details and a shared per-stay to-do list.

alter table public.stays
  add column platform      text check (platform in ('airbnb', 'booking', 'agoda', 'hotel', 'other')),
  add column host          text check (char_length(host) <= 80),
  add column address_local text check (char_length(address_local) <= 300),  -- e.g. Japanese address for drivers
  add column booking_url   text check (booking_url ~ '^https://' and char_length(booking_url) <= 2000),
  add column checkin_info  text check (char_length(checkin_info) <= 1000),
  add column door_code     text check (char_length(door_code) <= 40),
  add column wifi          text check (char_length(wifi) <= 120);

grant insert (platform, host, address_local, booking_url, checkin_info, door_code, wifi) on public.stays to authenticated;
grant update (platform, host, address_local, booking_url, checkin_info, door_code, wifi) on public.stays to authenticated;

-- Shared to-dos ("Fill guest form", "Confirm late check-in"); anyone in the trip sees ticks live.
create table public.stay_todos (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  stay_id     uuid not null references public.stays (id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 300),
  done        boolean not null default false,
  done_by     uuid references public.profiles (id) on delete set null,
  done_at     timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index stay_todos_stay_idx on public.stay_todos (stay_id, sort_order, created_at);
create index stay_todos_trip_idx on public.stay_todos (trip_id);

-- A to-do must belong to a stay of the same trip; done_by/done_at are filled in for you.
create function private.stay_todo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.stays s where s.id = new.stay_id and s.trip_id = new.trip_id) then
    raise exception 'stay is not in this trip' using errcode = '23514';
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_by := auth.uid();
    new.done_at := now();
  elsif not new.done then
    new.done_by := null;
    new.done_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.stay_todo_guard() from public, anon, authenticated;

create trigger stay_todos_guard before insert or update on public.stay_todos
  for each row execute function private.stay_todo_guard();

alter table public.stay_todos enable row level security;

create policy stay_todos_select on public.stay_todos for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy stay_todos_insert on public.stay_todos for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy stay_todos_update on public.stay_todos for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy stay_todos_delete on public.stay_todos for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));

revoke all on public.stay_todos from anon;
revoke insert, update on public.stay_todos from authenticated;
grant insert (trip_id, stay_id, text, done, sort_order) on public.stay_todos to authenticated;
grant update (text, done, sort_order) on public.stay_todos to authenticated;

alter publication supabase_realtime add table public.stay_todos;
