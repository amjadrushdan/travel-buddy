-- Enforce cover upload limits with a trigger instead of inside the RLS policy.
-- Why: the Storage API checks RLS in a trial transaction it rolls back, so a counter written by
-- the policy never persisted (the 10/day cap didn't count real uploads). A BEFORE INSERT
-- trigger runs on the real insert, whoever performs it, and its log row commits with it.

-- Read-only pre-check used by the insert policy (role + limits). No side effects.
create or replace function private.cover_upload_allowed(p_trip uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_trip is null then return false; end if;
  if coalesce(private.trip_role(p_trip), '') not in ('owner', 'editor') then return false; end if;
  return (select count(*) from storage.objects
            where bucket_id = 'trip-covers' and name like p_trip::text || '/%') < 2
     and (select count(*) from private.cover_upload_log
            where trip_id = p_trip and at > now() - interval '24 hours') < 10;
end;
$$;

-- The real gate: runs on every insert into the covers bucket and records it.
create function private.cover_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid := private.cover_trip(new.name);
  v_files int;
  v_today int;
begin
  if new.bucket_id <> 'trip-covers' then return new; end if;
  if v_trip is null then
    raise exception 'cover file name not allowed' using errcode = '42501';
  end if;
  -- one upload per trip at a time, so two parallel uploads can't both slip under the caps
  perform pg_advisory_xact_lock(hashtext('trip-cover:' || v_trip::text));
  select count(*) into v_files from storage.objects
    where bucket_id = 'trip-covers' and name like v_trip::text || '/%';
  select count(*) into v_today from private.cover_upload_log
    where trip_id = v_trip and at > now() - interval '24 hours';
  if v_files >= 2 then
    raise exception 'cover limit: this trip already has 2 files' using errcode = '42501';
  end if;
  if v_today >= 10 then
    raise exception 'cover limit: 10 uploads per trip per day' using errcode = '42501';
  end if;
  insert into private.cover_upload_log (trip_id) values (v_trip);
  delete from private.cover_upload_log where at < now() - interval '2 days';
  return new;
end;
$$;

revoke all on function private.cover_before_insert() from public, anon, authenticated;

create trigger trip_covers_limits
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'trip-covers')
  execute function private.cover_before_insert();
