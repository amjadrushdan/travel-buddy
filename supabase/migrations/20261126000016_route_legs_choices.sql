-- Routes v2: keep BOTH ways of getting there (walk and train) plus the editor's choice, so
-- switching costs no API call, and keep both stops' map points so a later train check needs no
-- second lookup. The leave time is now worked out in the app from the next stop's time, so
-- changing a time never needs a new route.

alter table public.route_legs
  add column choice     text not null default 'auto' check (choice in ('auto', 'walk', 'transit', 'car', 'hidden')),
  add column from_lat   double precision check (from_lat between -90 and 90),
  add column from_lng   double precision check (from_lng between -180 and 180),
  add column to_lat     double precision check (to_lat between -90 and 90),
  add column to_lng     double precision check (to_lng between -180 and 180),
  add column walk_min   int check (walk_min between 0 and 1440),
  add column walk_m     int check (walk_m >= 0),
  -- { minutes, fare, currency, steps } or null. transit_at set + transit null = no train found.
  add column transit    jsonb check (transit is null or (jsonb_typeof(transit) = 'object' and pg_column_size(transit) < 16000)),
  add column transit_at timestamptz;

-- Carry over what was already worked out.
update public.route_legs set walk_min = minutes where mode = 'walk';
update public.route_legs
  set transit = jsonb_build_object('minutes', minutes, 'fare', fare, 'currency', currency, 'steps', steps),
      transit_at = computed_at
  where mode = 'transit';

-- The old single-answer columns stay readable until the new app is live, then go
-- (20261126000017). New rows leave them empty.
alter table public.route_legs alter column mode drop not null;
