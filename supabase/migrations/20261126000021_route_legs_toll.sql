-- Expressway tolls for car legs (Google's estimate, ETC price in Japan). 0 = no tolls on the way;
-- null = not known.
alter table public.route_legs
  add column toll          int check (toll >= 0),
  add column toll_currency text check (toll_currency ~ '^[A-Z]{3}$');
