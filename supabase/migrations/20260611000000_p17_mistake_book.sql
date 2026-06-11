create extension if not exists pgcrypto;

create table if not exists public.students (
  id text primary key,
  display_name text not null,
  grade text not null,
  subject text not null default 'math',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_demo_student_id_check check (id = 'demo_student_001'),
  constraint students_subject_check check (subject = 'math')
);

create table if not exists public.diagnosis_runs (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  client_diagnosis_id text not null,
  source text not null,
  evidence_level text,
  persistence_evidence text,
  profile_update_kind text,
  recognized_question jsonb not null,
  knowledge_mapping jsonb not null,
  mistake_diagnosis jsonb not null,
  memory_delta jsonb not null,
  student_profile_snapshot jsonb not null,
  practice_questions jsonb not null,
  review_plan jsonb not null,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint diagnosis_runs_source_check check (source in ('sample', 'image')),
  constraint diagnosis_runs_evidence_level_check check (
    evidence_level is null
    or evidence_level in ('student_work_sufficient', 'problem_only', 'insufficient')
  ),
  constraint diagnosis_runs_persistence_evidence_check check (
    persistence_evidence is null
    or persistence_evidence in ('student_work', 'user_confirmed', 'uploaded_problem_only', 'none')
  ),
  constraint diagnosis_runs_profile_update_kind_check check (
    profile_update_kind is null
    or profile_update_kind in ('mistake_cause', 'problem_type_focus', 'none')
  )
);

create table if not exists public.mistake_book_items (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  diagnosis_run_id uuid not null references public.diagnosis_runs(id) on delete cascade,
  source text not null,
  question_text text not null,
  student_answer text not null,
  standard_solution text not null,
  knowledge_points text[] not null,
  mistake_causes text[] not null,
  severity text not null,
  diagnosis_summary text not null,
  evidence_level text,
  persistence_evidence text,
  profile_update_kind text not null,
  review_status smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mistake_book_items_source_check check (source in ('sample', 'image')),
  constraint mistake_book_items_severity_check check (severity in ('minor', 'medium', 'severe')),
  constraint mistake_book_items_review_status_check check (review_status in (0, 1, 2, 3)),
  constraint mistake_book_items_evidence_level_check check (
    evidence_level is null
    or evidence_level in ('student_work_sufficient', 'problem_only', 'insufficient')
  ),
  constraint mistake_book_items_persistence_evidence_check check (
    persistence_evidence is null
    or persistence_evidence in ('student_work', 'user_confirmed', 'uploaded_problem_only', 'none')
  ),
  constraint mistake_book_items_profile_update_kind_check check (
    profile_update_kind in ('mistake_cause', 'problem_type_focus', 'none')
  )
);

create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  diagnosis_run_id uuid not null references public.diagnosis_runs(id) on delete cascade,
  mistake_book_item_id uuid not null references public.mistake_book_items(id) on delete cascade,
  event_type text not null,
  memory_delta jsonb not null,
  knowledge_mastery_changes jsonb not null,
  mistake_cause_changes jsonb not null,
  review_priority_changes text[] not null,
  is_repeated_mistake boolean not null,
  rationale text not null,
  evidence_level text,
  persistence_evidence text,
  profile_update_kind text not null,
  created_at timestamptz not null default now(),
  constraint memory_events_event_type_check check (
    event_type in ('mistake_cause', 'problem_type_focus')
  ),
  constraint memory_events_evidence_level_check check (
    evidence_level is null
    or evidence_level in ('student_work_sufficient', 'problem_only', 'insufficient')
  ),
  constraint memory_events_persistence_evidence_check check (
    persistence_evidence is null
    or persistence_evidence in ('student_work', 'user_confirmed', 'uploaded_problem_only', 'none')
  ),
  constraint memory_events_profile_update_kind_check check (
    profile_update_kind in ('mistake_cause', 'problem_type_focus')
  )
);

create index if not exists diagnosis_runs_student_created_idx
  on public.diagnosis_runs(student_id, created_at desc);

create unique index if not exists diagnosis_runs_student_client_diagnosis_idx
  on public.diagnosis_runs(student_id, client_diagnosis_id);

create index if not exists mistake_book_items_student_created_idx
  on public.mistake_book_items(student_id, created_at desc);

create index if not exists mistake_book_items_student_review_status_idx
  on public.mistake_book_items(student_id, review_status, created_at desc);

create index if not exists memory_events_student_created_idx
  on public.memory_events(student_id, created_at desc);

create index if not exists memory_events_diagnosis_run_idx
  on public.memory_events(diagnosis_run_id);

alter table public.students enable row level security;
alter table public.diagnosis_runs enable row level security;
alter table public.mistake_book_items enable row level security;
alter table public.memory_events enable row level security;

grant select, insert, update on table public.students to service_role;
grant select, insert on table public.diagnosis_runs to service_role;
grant select, insert on table public.mistake_book_items to service_role;
grant select, insert on table public.memory_events to service_role;

create or replace function public.persist_mathtrace_diagnosis(
  p_student_id text,
  p_student_display_name text,
  p_student_grade text,
  p_client_diagnosis_id text,
  p_source text,
  p_evidence_level text,
  p_persistence_evidence text,
  p_profile_update_kind text,
  p_recognized_question jsonb,
  p_knowledge_mapping jsonb,
  p_mistake_diagnosis jsonb,
  p_memory_delta jsonb,
  p_student_profile_snapshot jsonb,
  p_practice_questions jsonb,
  p_review_plan jsonb,
  p_warnings text[],
  p_question_text text,
  p_student_answer text,
  p_standard_solution text,
  p_knowledge_points text[],
  p_mistake_causes text[],
  p_severity text,
  p_diagnosis_summary text
)
returns table (
  diagnosis_run_id uuid,
  mistake_book_item_id uuid,
  memory_event_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  inserted_run_id uuid;
  inserted_item_id uuid;
  inserted_event_id uuid;
begin
  if p_student_id <> 'demo_student_001' then
    raise exception 'Only demo_student_001 is supported in P1.7';
  end if;

  if coalesce(p_memory_delta -> 'should_persist', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'memory_delta.should_persist must be true';
  end if;

  if p_profile_update_kind not in ('mistake_cause', 'problem_type_focus') then
    raise exception 'profile_update_kind must be persistable';
  end if;

  if p_source = 'sample' then
    if not (
      p_evidence_level is null
      and p_persistence_evidence = 'student_work'
      and p_profile_update_kind = 'mistake_cause'
    ) then
      raise exception 'Invalid sample diagnosis persistence policy';
    end if;
  elsif p_source = 'image' then
    if not (
      (
        p_evidence_level = 'student_work_sufficient'
        and p_persistence_evidence = 'student_work'
        and p_profile_update_kind = 'mistake_cause'
      )
      or (
        p_evidence_level = 'problem_only'
        and p_persistence_evidence = 'uploaded_problem_only'
        and p_profile_update_kind = 'problem_type_focus'
      )
      or (
        p_evidence_level = 'problem_only'
        and p_persistence_evidence = 'user_confirmed'
        and p_profile_update_kind = 'mistake_cause'
      )
    ) then
      raise exception 'Invalid image diagnosis persistence policy';
    end if;
  else
    raise exception 'Invalid diagnosis source';
  end if;

  insert into public.students (id, display_name, grade, subject, updated_at)
  values (p_student_id, p_student_display_name, p_student_grade, 'math', now())
  on conflict (id) do update
    set display_name = excluded.display_name,
        grade = excluded.grade,
        updated_at = now();

  insert into public.diagnosis_runs (
    student_id,
    client_diagnosis_id,
    source,
    evidence_level,
    persistence_evidence,
    profile_update_kind,
    recognized_question,
    knowledge_mapping,
    mistake_diagnosis,
    memory_delta,
    student_profile_snapshot,
    practice_questions,
    review_plan,
    warnings
  )
  values (
    p_student_id,
    p_client_diagnosis_id,
    p_source,
    p_evidence_level,
    p_persistence_evidence,
    p_profile_update_kind,
    p_recognized_question,
    p_knowledge_mapping,
    p_mistake_diagnosis,
    p_memory_delta,
    p_student_profile_snapshot,
    p_practice_questions,
    p_review_plan,
    coalesce(p_warnings, '{}'::text[])
  )
  on conflict (student_id, client_diagnosis_id) do nothing
  returning id into inserted_run_id;

  if inserted_run_id is null then
    select id
    into inserted_run_id
    from public.diagnosis_runs
    where student_id = p_student_id
      and client_diagnosis_id = p_client_diagnosis_id;

    select mistake_book_items.id, memory_events.id
    into inserted_item_id, inserted_event_id
    from public.mistake_book_items
    join public.memory_events
      on memory_events.diagnosis_run_id = inserted_run_id
      and memory_events.mistake_book_item_id = mistake_book_items.id
    where mistake_book_items.diagnosis_run_id = inserted_run_id
    order by mistake_book_items.created_at
    limit 1;

    if inserted_run_id is null
      or inserted_item_id is null
      or inserted_event_id is null then
      raise exception 'Existing diagnosis run is missing mistake book item or memory event';
    end if;

    return query select inserted_run_id, inserted_item_id, inserted_event_id;
    return;
  end if;

  insert into public.mistake_book_items (
    student_id,
    diagnosis_run_id,
    source,
    question_text,
    student_answer,
    standard_solution,
    knowledge_points,
    mistake_causes,
    severity,
    diagnosis_summary,
    evidence_level,
    persistence_evidence,
    profile_update_kind
  )
  values (
    p_student_id,
    inserted_run_id,
    p_source,
    p_question_text,
    p_student_answer,
    p_standard_solution,
    p_knowledge_points,
    p_mistake_causes,
    p_severity,
    p_diagnosis_summary,
    p_evidence_level,
    p_persistence_evidence,
    p_profile_update_kind
  )
  returning id into inserted_item_id;

  insert into public.memory_events (
    student_id,
    diagnosis_run_id,
    mistake_book_item_id,
    event_type,
    memory_delta,
    knowledge_mastery_changes,
    mistake_cause_changes,
    review_priority_changes,
    is_repeated_mistake,
    rationale,
    evidence_level,
    persistence_evidence,
    profile_update_kind
  )
  values (
    p_student_id,
    inserted_run_id,
    inserted_item_id,
    p_profile_update_kind,
    p_memory_delta,
    coalesce(p_memory_delta -> 'knowledge_mastery_changes', '{}'::jsonb),
    coalesce(p_memory_delta -> 'mistake_cause_changes', '{}'::jsonb),
    case
      when jsonb_typeof(p_memory_delta -> 'review_priority_changes') = 'array'
      then array(select jsonb_array_elements_text(p_memory_delta -> 'review_priority_changes'))
      else array[]::text[]
    end,
    coalesce((p_memory_delta ->> 'is_repeated_mistake')::boolean, false),
    coalesce(p_memory_delta ->> 'rationale', ''),
    p_evidence_level,
    p_persistence_evidence,
    p_profile_update_kind
  )
  returning id into inserted_event_id;

  return query select inserted_run_id, inserted_item_id, inserted_event_id;
end;
$$;

revoke execute on function public.persist_mathtrace_diagnosis(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text[],
  text,
  text,
  text,
  text[],
  text[],
  text,
  text
) from public, anon, authenticated;

grant execute on function public.persist_mathtrace_diagnosis(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text[],
  text,
  text,
  text,
  text[],
  text[],
  text,
  text
) to service_role;
