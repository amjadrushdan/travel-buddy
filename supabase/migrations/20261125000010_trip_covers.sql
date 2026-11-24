-- Trip cover photos in Supabase Storage, with hard limits enforced by the database:
--   * private bucket: only trip members can view; owners/editors can add/remove
--   * 1 MB per file, WebP or JPEG only (the app shrinks photos to ~1600px first)
--   * file names must be "<trip id>/cover-<timestamp>.webp|jpg" (can't target another trip)
--   * at most 2 files per trip at once (current cover + the new one while swapping)
--   * at most 10 cover uploads per trip per rolling 24 hours
-- trips.cover_url stores the storage path of the current cover.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- "<uuid>/cover-<10..16 digits>.<webp|jpg>" → the trip id, else null
create function private.cover_trip(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover-[0-9]{10,16}\.(webp|jpg)$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

create table private.cover_upload_log (
  trip_id  uuid not null,
  at       timestamptz not null default now()
);
create index cover_upload_log_trip_at on private.cover_upload_log (trip_id, at);
revoke all on private.cover_upload_log from public, anon, authenticated;

-- Called from the insert policy: room for another file, and under the daily cap.
-- Records the attempt, so the daily cap counts every upload that got this far.
create function private.cover_upload_allowed(p_trip uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_files int;
  v_today int;
begin
  if p_trip is null then return false; end if;
  -- Check the role here too, so a refused upload (viewer, stranger) never counts toward the cap.
  if coalesce(private.trip_role(p_trip), '') not in ('owner', 'editor') then return false; end if;
  select count(*) into v_files from storage.objects
    where bucket_id = 'trip-covers' and name like p_trip::text || '/%';
  select count(*) into v_today from private.cover_upload_log
    where trip_id = p_trip and at > now() - interval '24 hours';
  if v_files >= 2 or v_today >= 10 then return false; end if;
  insert into private.cover_upload_log (trip_id) values (p_trip);
  delete from private.cover_upload_log where at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function private.cover_trip(text) from public, anon;
revoke all on function private.cover_upload_allowed(uuid) from public, anon;
grant execute on function private.cover_trip(text) to authenticated;
grant execute on function private.cover_upload_allowed(uuid) to authenticated;

create policy trip_covers_select on storage.objects
  for select to authenticated
  using (bucket_id = 'trip-covers' and private.trip_role(private.cover_trip(name)) is not null);

create policy trip_covers_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trip-covers'
    and private.trip_role(private.cover_trip(name)) in ('owner', 'editor')
    and private.cover_upload_allowed(private.cover_trip(name))
  );

create policy trip_covers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-covers' and private.trip_role(private.cover_trip(name)) in ('owner', 'editor'));
-- No update policy: covers are never overwritten in place (new name per upload).

-- The trip's cover must be a file in its own folder.
alter table public.trips add constraint trips_cover_url_ok
  check (cover_url is null or private.cover_trip(cover_url) = id);
