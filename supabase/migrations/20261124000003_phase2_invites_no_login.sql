-- Phase 2: invite links, with no login.
-- Everyone uses a Supabase anonymous session (one per device) and just types a name.
-- Invites default to 'editor' so people who join can manage the trip straight away.
-- Owners and editors can create and revoke invite links.

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  token       text not null unique,
  role        text not null default 'editor' check (role in ('editor', 'viewer')),
  expires_at  timestamptz not null,
  max_uses    int not null check (max_uses between 1 and 100),
  uses        int not null default 0,
  revoked     boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index invites_trip_idx on public.invites (trip_id);

-- No direct client access at all: everything goes through the RPCs below.
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- ---------------------------------------------------------------
-- create_invite: owner/editor only
-- ---------------------------------------------------------------
create function public.create_invite(
  p_trip_id uuid,
  p_role text default 'editor',
  p_expires_hours int default 168,
  p_max_uses int default 10
)
returns table (id uuid, token text, role text, expires_at timestamptz, max_uses int, uses int, revoked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if coalesce(private.trip_role(p_trip_id), '') not in ('owner', 'editor') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'bad role' using errcode = '22023';
  end if;
  if p_expires_hours not in (24, 168, 720) then
    raise exception 'bad expiry' using errcode = '22023';
  end if;
  if p_max_uses not between 1 and 100 then
    raise exception 'bad max uses' using errcode = '22023';
  end if;

  -- 32 random bytes, base64url without padding (43 chars)
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  return query
  insert into public.invites as i (trip_id, token, role, expires_at, max_uses, created_by)
  values (p_trip_id, v_token, p_role, now() + make_interval(hours => p_expires_hours), p_max_uses, (select auth.uid()))
  returning i.id, i.token, i.role, i.expires_at, i.max_uses, i.uses, i.revoked;
end;
$$;

-- ---------------------------------------------------------------
-- list_invites: owner/editor only
-- ---------------------------------------------------------------
create function public.list_invites(p_trip_id uuid)
returns table (id uuid, token text, role text, expires_at timestamptz, max_uses int, uses int, revoked boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.trip_role(p_trip_id), '') not in ('owner', 'editor') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select i.id, i.token, i.role, i.expires_at, i.max_uses, i.uses, i.revoked, i.created_at
  from public.invites i
  where i.trip_id = p_trip_id
  order by i.created_at desc;
end;
$$;

-- ---------------------------------------------------------------
-- revoke_invite: owner/editor only
-- ---------------------------------------------------------------
create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
begin
  select trip_id into v_trip from public.invites where id = p_invite_id;
  if v_trip is null or coalesce(private.trip_role(v_trip), '') not in ('owner', 'editor') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.invites set revoked = true where id = p_invite_id;
end;
$$;

-- ---------------------------------------------------------------
-- get_invite_preview: anyone holding the token (also before they have a session)
-- ---------------------------------------------------------------
create function public.get_invite_preview(p_token text)
returns table (
  trip_id uuid,
  trip_name text,
  destination text,
  start_date date,
  end_date date,
  inviter_name text,
  role text,
  uses_left int,
  member_names text[],
  status text            -- ok | revoked | expired | used_up
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.name,
    t.destination,
    t.start_date,
    t.end_date,
    p.name,
    i.role,
    greatest(i.max_uses - i.uses, 0),
    array(
      select pr.name from public.trip_members m
      join public.profiles pr on pr.id = m.user_id
      where m.trip_id = t.id
      order by m.joined_at
    ),
    case
      when i.revoked then 'revoked'
      when i.expires_at <= now() then 'expired'
      when i.uses >= i.max_uses then 'used_up'
      else 'ok'
    end
  from public.invites i
  join public.trips t on t.id = i.trip_id
  left join public.profiles p on p.id = i.created_by
  where i.token = p_token;
$$;

-- ---------------------------------------------------------------
-- redeem_invite: validate + add member + count the use, atomically
-- ---------------------------------------------------------------
create function public.redeem_invite(p_token text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invites%rowtype;
  v_name text := nullif(trim(p_name), '');
  v_inserted int;
begin
  if v_uid is null then
    raise exception 'no session' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) > 40 then
    raise exception 'enter a name (max 40 characters)' using errcode = '22023';
  end if;

  select * into v_inv from public.invites where token = p_token for update;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  -- Already a member: just go to the trip, don't use up the link.
  if exists (select 1 from public.trip_members where trip_id = v_inv.trip_id and user_id = v_uid) then
    update public.profiles set name = v_name where id = v_uid;
    return v_inv.trip_id;
  end if;

  if v_inv.revoked then raise exception 'this invite link was revoked' using errcode = '22023'; end if;
  if v_inv.expires_at <= now() then raise exception 'this invite link has expired' using errcode = '22023'; end if;
  if v_inv.uses >= v_inv.max_uses then raise exception 'this invite link has been used up' using errcode = '22023'; end if;

  update public.profiles set name = v_name where id = v_uid;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_inv.trip_id, v_uid, v_inv.role)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.invites set uses = uses + 1 where id = v_inv.id;
  end if;

  return v_inv.trip_id;
end;
$$;

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
revoke all on function public.create_invite(uuid, text, int, int) from public, anon;
revoke all on function public.list_invites(uuid) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.redeem_invite(text, text) from public, anon;
revoke all on function public.get_invite_preview(text) from public;

grant execute on function public.create_invite(uuid, text, int, int) to authenticated;
grant execute on function public.list_invites(uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
