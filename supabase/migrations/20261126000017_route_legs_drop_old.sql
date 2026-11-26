-- Routes v2 is live: drop the old single-answer columns (see 20261126000016).
alter table public.route_legs
  drop column mode,
  drop column minutes,
  drop column leave_at,
  drop column fare,
  drop column currency,
  drop column steps;
