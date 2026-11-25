-- Getting between plan stops: walking time, or the train/bus lines to take. Worked out on the
-- server (lib/routes) only when an editor asks, then saved here so the group reads it offline.
-- One row per stop: how to get TO `to_item` from the stop before it (`from_item`).

create table public.route_legs (
  to_item     uuid primary key references public.itinerary_items (id) on delete cascade,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  from_item   uuid not null references public.itinerary_items (id) on delete cascade,
  -- What the leg was worked out for. If a stop's place changes, the leg no longer matches
  -- and the app hides it until routes are worked out again.
  from_place  text not null check (char_length(from_place) <= 200),
  to_place    text not null check (char_length(to_place) <= 200),
  mode        text not null check (mode in ('walk', 'transit', 'none')),
  minutes     int check (minutes between 0 and 1440),
  leave_at    text check (leave_at ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  fare        int check (fare >= 0),
  currency    text check (currency ~ '^[A-Z]{3}$'),
  -- [{ k: 'walk', min } | { k: 'ride', min, line, line_local?, code?, color?, from?, to?, vehicle? }]
  steps       jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and pg_column_size(steps) < 16000),
  provider    text check (char_length(provider) <= 40),
  computed_at timestamptz not null default now()
);
create index route_legs_trip_idx on public.route_legs (trip_id);

-- A leg must join two stops of the same trip.
create function private.route_leg_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.itinerary_items
      where id in (new.from_item, new.to_item) and trip_id = new.trip_id) <> 2 then
    raise exception 'stops are not in this trip' using errcode = '23514';
  end if;
  new.computed_at := now();
  return new;
end;
$$;
revoke all on function private.route_leg_guard() from public, anon, authenticated;
create trigger route_legs_guard before insert or update on public.route_legs
  for each row execute function private.route_leg_guard();

alter table public.route_legs enable row level security;
create policy route_legs_select on public.route_legs for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy route_legs_insert on public.route_legs for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy route_legs_update on public.route_legs for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy route_legs_delete on public.route_legs for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));
revoke all on public.route_legs from anon;
grant select, insert, update, delete on public.route_legs to authenticated;

alter publication supabase_realtime add table public.route_legs;

-- ---------------------------------------------------------------
-- route_claim: may the server make one more call to a route provider?
-- Same counters as flight status (private.api_usage / api_usage_daily), one row per provider
-- ('routes_google', 'routes_navitime'). Only the server knows the secret, so a client can't
-- run up the count. Returns true and counts the call, or false when a cap is reached.
-- ---------------------------------------------------------------
create function public.route_claim(p_secret text, p_api text, p_daily_cap int, p_monthly_cap int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_day date := (now() at time zone 'UTC')::date;
  v_m int;
  v_d int;
begin
  perform private.check_secret('flight_status', p_secret);
  if p_api not in ('routes_google', 'routes_navitime') then
    raise exception 'unknown api' using errcode = '22023';
  end if;

  insert into private.api_usage (api, month) values (p_api, v_month) on conflict do nothing;
  insert into private.api_usage_daily (api, day) values (p_api, v_day) on conflict do nothing;
  select calls into v_m from private.api_usage where api = p_api and month = v_month for update;
  select calls into v_d from private.api_usage_daily where api = p_api and day = v_day for update;
  if v_m >= p_monthly_cap or v_d >= p_daily_cap then return false; end if;

  update private.api_usage set calls = calls + 1 where api = p_api and month = v_month;
  update private.api_usage_daily set calls = calls + 1 where api = p_api and day = v_day;
  return true;
end;
$$;
revoke all on function public.route_claim(text, text, int, int) from public, anon;
grant execute on function public.route_claim(text, text, int, int) to authenticated;
