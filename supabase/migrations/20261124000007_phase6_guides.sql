-- Phase 6: guide notes (markdown) grouped by category.
-- Done when: markdown notes render by category. Members read; owners and editors write.

create table public.guides (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  category    text not null default 'other'
              check (category in ('food', 'prayer', 'transport', 'phrases', 'other')),
  title       text not null check (char_length(title) between 1 and 120),
  body_md     text not null default '' check (char_length(body_md) <= 10000),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index guides_trip_idx on public.guides (trip_id, category, created_at);

create trigger guides_touch before update on public.guides
  for each row execute function private.touch_updated_at();

alter table public.guides enable row level security;

create policy guides_select on public.guides for select to authenticated
  using (private.trip_role(trip_id) is not null);
create policy guides_insert on public.guides for insert to authenticated
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy guides_update on public.guides for update to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'))
  with check (private.trip_role(trip_id) in ('owner', 'editor'));
create policy guides_delete on public.guides for delete to authenticated
  using (private.trip_role(trip_id) in ('owner', 'editor'));

revoke all on public.guides from anon;
revoke insert, update on public.guides from authenticated;
grant insert (trip_id, category, title, body_md) on public.guides to authenticated;
grant update (category, title, body_md) on public.guides to authenticated;
