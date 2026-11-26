-- Legs between towns (Tokyo → Fuji) can be days on foot; the walk is kept (the app shows
-- "Too far to walk") instead of refusing the save.
alter table public.route_legs drop constraint route_legs_walk_min_check;
alter table public.route_legs add constraint route_legs_walk_min_check check (walk_min >= 0);
