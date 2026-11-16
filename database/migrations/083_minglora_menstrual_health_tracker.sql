-- Minglora Menstrual Health Tracker: owner-only health records and consent.

create table if not exists public.menstrual_tracker_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 consent_version text,
 consented_at timestamptz,
 fertility_estimates_enabled boolean not null default false,
 pregnancy_planning_enabled boolean not null default false,
 average_cycle_length smallint check (average_cycle_length is null or average_cycle_length between 15 and 90),
 average_period_length smallint check (average_period_length is null or average_period_length between 1 and 15),
 timezone text not null default 'America/Jamaica' check (char_length(timezone) between 1 and 80),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint menstrual_profile_consent_check check (not enabled or (consented_at is not null and consent_version is not null))
);
create table if not exists public.menstrual_cycles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 start_date date not null,
 end_date date,
 flow_intensity text not null default 'unspecified' check (flow_intensity in ('spotting','light','medium','heavy','unspecified')),
 notes text not null default '' check (char_length(notes)<=800),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint menstrual_cycle_date_order_check check (end_date is null or end_date>=start_date)
);
create index if not exists menstrual_cycles_owner_start_idx on public.menstrual_cycles(user_id,start_date desc);
create table if not exists public.menstrual_daily_logs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 entry_date date not null,
 flow_level text not null default 'none' check (flow_level in ('none','spotting','light','medium','heavy')),
 symptoms jsonb not null default '[]'::jsonb check (jsonb_typeof(symptoms)='array'),
 pain_level smallint check (pain_level is null or pain_level between 0 and 10),
 mood text not null default 'not_set' check (mood in ('not_set','great','good','okay','low','anxious','irritable','sad')),
 energy_level smallint check (energy_level is null or energy_level between 1 and 5),
 sleep_hours numeric(4,1) check (sleep_hours is null or sleep_hours between 0 and 24),
 basal_temperature_c numeric(4,2) check (basal_temperature_c is null or basal_temperature_c between 30 and 43),
 cervical_mucus text not null default 'unknown' check (cervical_mucus in ('unknown','dry','sticky','creamy','watery','egg_white')),
 notes text not null default '' check (char_length(notes)<=1200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,entry_date)
);
create index if not exists menstrual_daily_logs_owner_date_idx on public.menstrual_daily_logs(user_id,entry_date desc);
create table if not exists public.menstrual_journal_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 entry_date date not null default current_date,
 title text not null check (char_length(title) between 1 and 120),
 content text not null check (char_length(content) between 1 and 5000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists menstrual_journal_owner_date_idx on public.menstrual_journal_entries(user_id,entry_date desc);
create table if not exists public.menstrual_reminders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 reminder_type text not null check (reminder_type in ('period_due','daily_log','symptom_checkin')),
 enabled boolean not null default true,
 lead_days smallint not null default 1 check (lead_days between 0 and 7),
 time_local text not null default '09:00' check (time_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 timezone text not null default 'America/Jamaica' check (char_length(timezone) between 1 and 80),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists menstrual_reminders_owner_type_uidx on public.menstrual_reminders(user_id,reminder_type);

alter table public.menstrual_tracker_profiles enable row level security;
alter table public.menstrual_cycles enable row level security;
alter table public.menstrual_daily_logs enable row level security;
alter table public.menstrual_journal_entries enable row level security;
alter table public.menstrual_reminders enable row level security;
drop policy if exists menstrual_tracker_profiles_owner_all on public.menstrual_tracker_profiles;
create policy menstrual_tracker_profiles_owner_all on public.menstrual_tracker_profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists menstrual_cycles_owner_all on public.menstrual_cycles;
create policy menstrual_cycles_owner_all on public.menstrual_cycles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists menstrual_daily_logs_owner_all on public.menstrual_daily_logs;
create policy menstrual_daily_logs_owner_all on public.menstrual_daily_logs for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists menstrual_journal_entries_owner_all on public.menstrual_journal_entries;
create policy menstrual_journal_entries_owner_all on public.menstrual_journal_entries for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists menstrual_reminders_owner_all on public.menstrual_reminders;
create policy menstrual_reminders_owner_all on public.menstrual_reminders for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.menstrual_tracker_profiles,public.menstrual_cycles,public.menstrual_daily_logs,public.menstrual_journal_entries,public.menstrual_reminders from anon,public;
grant select,insert,update,delete on public.menstrual_tracker_profiles,public.menstrual_cycles,public.menstrual_daily_logs,public.menstrual_journal_entries,public.menstrual_reminders to authenticated;
comment on table public.menstrual_tracker_profiles is 'Private menstrual-health preferences and explicit consent; owner-only access.';
comment on table public.menstrual_cycles is 'Private period dates and bleeding observations; owner-only access.';
comment on table public.menstrual_daily_logs is 'Private daily symptom, flow and wellbeing logs; owner-only access.';
comment on table public.menstrual_journal_entries is 'Private menstrual-health journal entries; owner-only access.';
comment on table public.menstrual_reminders is 'Private menstrual-health reminder preferences; owner-only access.';
