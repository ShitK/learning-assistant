-- P1.8: Cloud current student profile read model.
-- The source of truth remains public.memory_events; this table stores the
-- latest projected snapshot for fast demo recovery.

create table if not exists public.student_profiles (
  student_id text primary key references public.students(id) on delete cascade,
  subject text not null default 'math',
  grade text not null,
  profile jsonb not null,
  profile_version integer not null default 1,
  event_count integer not null default 0,
  last_memory_event_id uuid references public.memory_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_profiles_subject_check check (subject = 'math'),
  constraint student_profiles_demo_student_check check (student_id = 'demo_student_001'),
  constraint student_profiles_event_count_check check (event_count >= 0),
  constraint student_profiles_profile_is_object_check check (jsonb_typeof(profile) = 'object')
);

alter table public.student_profiles enable row level security;

grant select, insert, update on public.student_profiles to service_role;
