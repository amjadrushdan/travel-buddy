-- Phase 8: realtime. Edits appear on other members' devices without a refresh.
-- Supabase Realtime checks each subscriber against the tables' RLS select policies,
-- so members only receive changes for trips they belong to.
-- (Delete events can't be filtered or RLS-checked by Realtime; they carry only the row id.)

alter publication supabase_realtime add table
  public.trips,
  public.trip_members,
  public.itinerary_items,
  public.flights,
  public.stays,
  public.guides;
