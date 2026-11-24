-- Flight status: add a DAILY call cap alongside the monthly one, so one busy day can't use up
-- a small free quota (aviationstack free plan is ~100 calls/month). Counters are now
-- provider-neutral ('flight_status') instead of 'flightaware'.

create table private.api_usage_daily (
  api    text not null,
  day    date not null,
  calls  int not null default 0,
  primary key (api, day)
);
revoke all on private.api_usage_daily from public, anon, authenticated;

update private.api_usage set api = 'flight_status' where api = 'flightaware';

drop function public.flight_status_claim(text, text, date, int, int);

create function public.flight_status_claim(
  p_secret text,
  p_flight_no text,
  p_flight_date date,
  p_ttl_minutes int default 30,
  p_monthly_cap int default 90,
  p_daily_cap int default 15
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.flight_status;
  v_month date := date_trunc('month', now())::date;
  v_day date := (now() at time zone 'UTC')::date;
  v_month_calls int;
  v_day_calls int;
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

  insert into private.api_usage (api, month) values ('flight_status', v_month) on conflict do nothing;
  insert into private.api_usage_daily (api, day) values ('flight_status', v_day) on conflict do nothing;
  select calls into v_month_calls from private.api_usage
    where api = 'flight_status' and month = v_month for update;
  select calls into v_day_calls from private.api_usage_daily
    where api = 'flight_status' and day = v_day for update;
  if v_month_calls >= p_monthly_cap or v_day_calls >= p_daily_cap then return 'cap'; end if;

  update private.api_usage set calls = calls + 1 where api = 'flight_status' and month = v_month;
  update private.api_usage_daily set calls = calls + 1 where api = 'flight_status' and day = v_day;
  update public.flight_status set claimed_until = now() + interval '30 seconds'
  where flight_no = p_flight_no and flight_date = p_flight_date;
  return 'go';
end;
$$;

revoke all on function public.flight_status_claim(text, text, date, int, int, int) from public, anon;
grant execute on function public.flight_status_claim(text, text, date, int, int, int) to authenticated;
