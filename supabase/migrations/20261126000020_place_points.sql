-- Where each plan place is on the map, looked up once per trip (Google place search near the
-- day's stay) and reused by every route that starts or ends there.

create table public.place_points (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  -- lower(trim(place)), so "Matsuya Ginza " and "matsuya ginza" share one lookup
  place_key   text not null check (char_length(place_key) between 1 and 200),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  -- What Google matched, to show and check ("T&T Fujiyama · Fujikawaguchiko").
  found_name  text check (char_length(found_name) <= 200),
  found_addr  text check (char_length(found_addr) <= 300),
  source      text not null check (source in ('places', 'map_link', 'none')),
  resolved_at timestamptz not null default now(),
  primary key (trip_id, place_key)
);

alter table public.place_points enable row level security;
create policy place_points_select on public.place_points for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy place_points_insert on public.place_points for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy place_points_update on public.place_points for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy place_points_delete on public.place_points for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));
revoke all on public.place_points from anon;
grant select, insert, update, delete on public.place_points to authenticated;

-- Count place searches like route lookups.
create or replace function public.route_claim(p_secret text, p_api text, p_daily_cap int, p_monthly_cap int)
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
  if p_api not in ('routes_google', 'routes_navitime', 'places_google') then
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
