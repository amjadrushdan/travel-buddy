-- Driving days (rental car to Fuji): keep Google's driving time for legs marked "car", so the
-- timeline can say "Drive 1 h 40 min · leave 08:50". No train lookup is made for these legs.
alter table public.route_legs
  add column drive_min int check (drive_min >= 0),
  add column drive_m   int check (drive_m >= 0);
