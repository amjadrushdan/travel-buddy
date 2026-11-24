-- Phase 5: live flight status (FlightAware AeroAPI), fetched lazily on the server.
-- Done when: the badge updates, and repeated opens within the cache time make no extra API calls.
--
-- flight_status is shared by every trip, so one lookup serves everyone on the same flight.
-- Members can READ rows for flights on their trips. Nobody writes directly: the app server
-- calls flight_status_claim / flight_status_save with a secret only it knows (FLIGHT_STATUS_SECRET),
-- so a member can't plant a fake "Cancelled" for someone else's flight.

create table public.flight_status (
  flight_no      text not null check (flight_no ~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$'), -- no space: MH88
  flight_date    date not null,  -- scheduled departure date, local at the origin airport
  status         text not null default 'scheduled'
                 check (status in ('scheduled', 'on_time', 'delayed', 'departed', 'landed', 'cancelled')),
  delay_min      int,
  est_departure  timestamptz,
  est_arrival    timestamptz,
  gate_dep       text check (char_length(gate_dep) <= 10),
  gate_arr       text check (char_length(gate_arr) <= 10),
  terminal_dep   text check (char_length(terminal_dep) <= 10),
  terminal_arr   text check (char_length(terminal_arr) <= 10),
  raw            jsonb,
  fetched_at     timestamptz,
  claimed_until  timestamptz,
  primary key (flight_no, flight_date)
);

alter table public.flight_status enable row level security;
revoke all on public.flight_status from anon, authenticated;
grant select (flight_no, flight_date, status, delay_min, est_departure, est_arrival,
              gate_dep, gate_arr, terminal_dep, terminal_arr, fetched_at)
  on public.flight_status to authenticated;

-- Readable when one of my trips has this flight on this date (flights RLS applies inside).
create policy flight_status_select on public.flight_status
  for select to authenticated
  using (exists (
    select 1 from public.flights f
    where replace(f.flight_no, ' ', '') = flight_status.flight_no
      and (f.depart_at at time zone f.depart_tz)::date = flight_status.flight_date
  ));

-- ---------------------------------------------------------------
-- Server-only secret (stored as a SHA-256 hash) and monthly API call counter
-- ---------------------------------------------------------------
create table private.app_secrets (
  name  text primary key,
  hash  bytea not null
);
create table private.api_usage (
  api    text not null,
  month  date not null,
  calls  int not null default 0,
  primary key (api, month)
);
revoke all on private.app_secrets, private.api_usage from public, anon, authenticated;

create function private.check_secret(p_name text, p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_secret is null or not exists (
    select 1 from private.app_secrets
    where name = p_name and hash = extensions.digest(p_secret, 'sha256')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.check_secret(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- flight_status_claim: decide whether THIS request should call the API.
-- Returns 'go' (you fetch), 'fresh' (cache is new enough), 'frozen' (landed/cancelled),
-- 'busy' (someone else is fetching right now) or 'cap' (monthly allowance used up).
-- The row lock makes two members opening the app at once trigger only one call.
-- ---------------------------------------------------------------
create function public.flight_status_claim(
  p_secret text,
  p_flight_no text,
  p_flight_date date,
  p_ttl_minutes int default 12,
  p_monthly_cap int default 500
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.flight_status;
  v_month date := date_trunc('month', now())::date;
  v_calls int;
begin
  perform private.check_secret('flight_status', p_secret);

  insert into public.flight_status (flight_no, flight_date)
  values (p_flight_no, p_flight_date)
  on conflict do nothing;

  select * into r from public.flight_status
  where flight_no = p_flight_no and flight_date = p_flight_date
  for update;

  if r.status in ('landed', 'cancelled') and r.fetched_at is not null then return 'frozen'; end if;
  if r.fetched_at > now() - make_interval(mins => greatest(p_ttl_minutes, 1)) then return 'fresh'; end if;
  if r.claimed_until > now() then return 'busy'; end if;

  insert into private.api_usage (api, month) values ('flightaware', v_month) on conflict do nothing;
  select calls into v_calls from private.api_usage where api = 'flightaware' and month = v_month for update;
  if v_calls >= p_monthly_cap then return 'cap'; end if;

  update private.api_usage set calls = calls + 1 where api = 'flightaware' and month = v_month;
  update public.flight_status set claimed_until = now() + interval '30 seconds'
  where flight_no = p_flight_no and flight_date = p_flight_date;
  return 'go';
end;
$$;

-- flight_status_save: store what the API said and release the claim.
create function public.flight_status_save(
  p_secret text,
  p_flight_no text,
  p_flight_date date,
  p_status text,
  p_delay_min int,
  p_est_departure timestamptz,
  p_est_arrival timestamptz,
  p_gate_dep text,
  p_gate_arr text,
  p_terminal_dep text,
  p_terminal_arr text,
  p_raw jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_secret('flight_status', p_secret);
  update public.flight_status set
    status = p_status,
    delay_min = p_delay_min,
    est_departure = p_est_departure,
    est_arrival = p_est_arrival,
    gate_dep = left(p_gate_dep, 10),
    gate_arr = left(p_gate_arr, 10),
    terminal_dep = left(p_terminal_dep, 10),
    terminal_arr = left(p_terminal_arr, 10),
    raw = p_raw,
    fetched_at = now(),
    claimed_until = null
  where flight_no = p_flight_no and flight_date = p_flight_date;
end;
$$;

-- flight_status_release: the API call failed; let the next request try again.
create function public.flight_status_release(p_secret text, p_flight_no text, p_flight_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_secret('flight_status', p_secret);
  update public.flight_status set claimed_until = null
  where flight_no = p_flight_no and flight_date = p_flight_date;
end;
$$;

revoke all on function public.flight_status_claim(text, text, date, int, int) from public, anon;
revoke all on function public.flight_status_save(text, text, date, text, int, timestamptz, timestamptz, text, text, text, text, jsonb) from public, anon;
revoke all on function public.flight_status_release(text, text, date) from public, anon;
grant execute on function public.flight_status_claim(text, text, date, int, int) to authenticated;
grant execute on function public.flight_status_save(text, text, date, text, int, timestamptz, timestamptz, text, text, text, text, jsonb) to authenticated;
grant execute on function public.flight_status_release(text, text, date) to authenticated;
