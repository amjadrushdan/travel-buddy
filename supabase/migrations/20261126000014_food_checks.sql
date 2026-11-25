-- Halal food scanner: ingredient lists the group has read from product labels, shared per trip,
-- so once one person photographs a product everyone else gets the answer when they scan it.
-- The halal verdict is not stored: the app works it out from `ingredients` with its word list,
-- so a better word list improves old checks too.

create table public.food_checks (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  barcode     text check (barcode ~ '^([0-9]{8}|[0-9]{13})$'),
  name        text check (char_length(name) <= 200),
  ingredients text not null check (char_length(ingredients) between 1 and 4000),
  checked_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One saved reading per product per trip; a newer reading replaces it.
create unique index food_checks_trip_barcode_idx on public.food_checks (trip_id, barcode) where barcode is not null;
create index food_checks_trip_idx on public.food_checks (trip_id, updated_at desc);

-- checked_by / timestamps are filled in for you.
create function private.food_check_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.checked_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.food_check_stamp() from public, anon, authenticated;

create trigger food_checks_stamp before insert or update on public.food_checks
  for each row execute function private.food_check_stamp();

alter table public.food_checks enable row level security;

-- Any member can read and add checks (viewers too: checking food doesn't change the trip plan).
create policy food_checks_select on public.food_checks for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy food_checks_insert on public.food_checks for insert to authenticated
  with check (private.trip_role(trip_id) is not null);
create policy food_checks_update on public.food_checks for update to authenticated
  using (private.trip_role(trip_id) is not null)
  with check (private.trip_role(trip_id) is not null);
-- Delete: whoever added it, or an owner/editor.
create policy food_checks_delete on public.food_checks for delete to authenticated
  using (checked_by = (select auth.uid()) or private.trip_role(trip_id) in ('owner', 'editor'));

revoke all on public.food_checks from anon;
revoke insert, update on public.food_checks from authenticated;
grant insert (trip_id, barcode, name, ingredients) on public.food_checks to authenticated;
grant update (name, ingredients) on public.food_checks to authenticated;

alter publication supabase_realtime add table public.food_checks;
