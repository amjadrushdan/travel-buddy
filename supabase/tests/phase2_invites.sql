-- Phase 2 check: invite links with name-only (anonymous) members.
-- Run as a superuser. Always ends in an exception so every test row is rolled back:
--   "PHASE 2 INVITES OK ..." = pass, "FAIL ..." = the assertion that broke.

do $$
declare
  a uuid := gen_random_uuid();  -- owner
  b uuid := gen_random_uuid();  -- invitee
  c uuid := gen_random_uuid();  -- stranger
  d uuid := gen_random_uuid();  -- late invitee
  trip uuid; tok text; inv uuid; r uuid; n int; st text; nm text;
begin
  insert into auth.users (id, raw_user_meta_data, aud, role, is_anonymous) values
    (a, '{"name":"Aisyah"}', 'authenticated', 'authenticated', true),
    (b, '{"name":"tmp"}',    'authenticated', 'authenticated', true),
    (c, '{"name":"Eve"}',    'authenticated', 'authenticated', true),
    (d, '{"name":"Dan"}',    'authenticated', 'authenticated', true);

  select name into nm from public.profiles where id = a;
  if nm <> 'Aisyah' then raise exception 'FAIL name from metadata: %', nm; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  trip := public.create_trip('Japan 26', 'Tokyo', '2026-12-12', '2026-12-21');
  select ci.id, ci.token into inv, tok from public.create_invite(trip, 'editor', 168, 1) ci;
  if length(tok) <> 43 then raise exception 'FAIL token length %', length(tok); end if;

  begin
    select count(*) into n from public.invites;
    raise exception 'FAIL invites readable directly';
  exception when insufficient_privilege then null; end;

  perform set_config('role', 'anon', true);
  select status, inviter_name into st, nm from public.get_invite_preview(tok);
  if st <> 'ok' or nm <> 'Aisyah' then raise exception 'FAIL preview % %', st, nm; end if;
  begin
    perform public.redeem_invite(tok, 'x');
    raise exception 'FAIL anon redeemed';
  exception when insufficient_privilege then null; end;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin perform * from public.list_invites(trip); raise exception 'FAIL stranger listed';
  exception when insufficient_privilege then null; end;
  begin perform * from public.create_invite(trip); raise exception 'FAIL stranger created';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.redeem_invite(tok, '  Hafiz ');
  if r <> trip then raise exception 'FAIL redeem returned wrong trip'; end if;
  select count(*) into n from public.trip_members where trip_id = trip and user_id = b and role = 'editor';
  if n <> 1 then raise exception 'FAIL B not editor'; end if;
  select name into nm from public.profiles where id = b;
  if nm <> 'Hafiz' then raise exception 'FAIL B name %', nm; end if;
  select count(*) into n from public.profiles where id = a;
  if n <> 1 then raise exception 'FAIL B cannot see co-member profile'; end if;
  update public.trips set destination = 'Tokyo · Osaka' where id = trip;
  select count(*) into n from public.trips where destination = 'Tokyo · Osaka';
  if n <> 1 then raise exception 'FAIL editor could not edit trip'; end if;
  perform * from public.create_invite(trip, 'viewer', 24, 5);
  r := public.redeem_invite(tok, 'Hafiz');

  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin perform public.redeem_invite(tok, 'Dan'); raise exception 'FAIL used-up link worked';
  exception when sqlstate '22023' then null; end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select li.token, li.id into tok, inv from public.list_invites(trip) li where li.role = 'viewer';
  perform public.revoke_invite(inv);
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin perform public.redeem_invite(tok, 'Dan'); raise exception 'FAIL revoked link worked';
  exception when sqlstate '22023' then null; end;
  select count(*) into n from public.trips;
  if n <> 0 then raise exception 'FAIL D sees trips'; end if;

  perform set_config('role', 'postgres', true);
  raise exception 'PHASE 2 INVITES OK (all test rows rolled back)';
end;
$$;
