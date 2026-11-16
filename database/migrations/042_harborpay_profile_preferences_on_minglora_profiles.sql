-- Applied to Minglora Supabase on 20261102050819; source migration 041_harborpay_profile_preferences_on_minglora_profiles.
-- This migration is for the single shared Minglora project.

alter table public.profiles
  add column if not exists locale text not null default 'en',
  add column if not exists timezone text not null default 'America/Jamaica';
alter table public.profiles
  drop constraint if exists profiles_locale_length_check,
  add constraint profiles_locale_length_check check (length(locale) between 2 and 20),
  drop constraint if exists profiles_timezone_length_check,
  add constraint profiles_timezone_length_check check (length(timezone) between 1 and 80);
