create extension if not exists pgcrypto;

alter table public.mistake_book_items
  add column if not exists question_fingerprint text;

update public.mistake_book_items
set question_fingerprint = encode(
  digest(
    -- 历史回填保持保守；新写入以后端传入的 p_question_fingerprint 为准。
    regexp_replace(question_text, '[[:space:]，。、；：！？]+', '', 'g'),
    'sha256'
  ),
  'hex'
)
where question_fingerprint is null;

create table if not exists public.mistake_book_item_dedupe_candidates (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  question_fingerprint text not null,
  mistake_book_item_ids uuid[] not null,
  detected_at timestamptz not null default now(),
  unique (student_id, question_fingerprint)
);

insert into public.mistake_book_item_dedupe_candidates (
  student_id,
  question_fingerprint,
  mistake_book_item_ids
)
select
  student_id,
  question_fingerprint,
  array_agg(id order by created_at asc, id asc)
from public.mistake_book_items
where question_fingerprint is not null
group by student_id, question_fingerprint
having count(*) > 1
on conflict do nothing;

do $$
declare
  duplicate_group_count integer;
begin
  select count(*)
  into duplicate_group_count
  from public.mistake_book_item_dedupe_candidates;

  if exists (
    select 1
    from public.mistake_book_item_dedupe_candidates
  ) then
    raise exception 'Duplicate mistake book items must be reviewed before enforcing fingerprint uniqueness: % groups',
      duplicate_group_count;
  end if;
end;
$$;

alter table public.mistake_book_items
  alter column question_fingerprint set not null;

create unique index if not exists mistake_book_items_student_question_fingerprint_idx
  on public.mistake_book_items(student_id, question_fingerprint);

grant select, insert, update, delete on table public.mistake_book_items to service_role;
grant select, insert, delete on table public.memory_events to service_role;

drop function if exists public.persist_mathtrace_diagnosis(
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
);

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
  p_diagnosis_summary text,
  p_question_fingerprint text
)
returns table (
  diagnosis_run_id uuid,
  mistake_book_item_id uuid,
  memory_event_id uuid,
  persistence_status text
)
language plpgsql
set search_path = public
as $$
declare
  active_run_id uuid;
  inserted_item_id uuid;
  existing_item_id uuid;
  inserted_event_id uuid;
begin
  if p_student_id <> 'demo_student_001' then
    raise exception 'Only demo_student_001 is supported in P1.7';
  end if;

  if nullif(trim(p_question_fingerprint), '') is null then
    raise exception 'question_fingerprint is required';
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
  returning id into active_run_id;

  if active_run_id is null then
    select id
    into active_run_id
    from public.diagnosis_runs
    where student_id = p_student_id
      and client_diagnosis_id = p_client_diagnosis_id;

    select id
    into existing_item_id
    from public.mistake_book_items
    where student_id = p_student_id
      and question_fingerprint = p_question_fingerprint
    order by created_at asc, id asc
    limit 1;

    if active_run_id is null then
      raise exception 'Existing diagnosis run is missing';
    end if;

    if existing_item_id is not null then
      -- duplicate branch returns memory_event_id=null and does not insert memory_events.
      return query select active_run_id, existing_item_id, null::uuid, 'duplicate'::text;
      return;
    end if;
  end if;

  insert into public.mistake_book_items (
    student_id,
    diagnosis_run_id,
    source,
    question_fingerprint,
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
    active_run_id,
    p_source,
    p_question_fingerprint,
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
  on conflict (student_id, question_fingerprint) do nothing
  returning id into inserted_item_id;

  if inserted_item_id is null then
    select id
    into existing_item_id
    from public.mistake_book_items
    where student_id = p_student_id
      and question_fingerprint = p_question_fingerprint
    order by created_at asc, id asc
    limit 1;

    if existing_item_id is null then
      raise exception 'Duplicate mistake book item was not found';
    end if;

    -- duplicate branch returns memory_event_id=null and does not insert memory_events.
    return query select active_run_id, existing_item_id, null::uuid, 'duplicate'::text;
    return;
  end if;

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
    active_run_id,
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

  return query select active_run_id, inserted_item_id, inserted_event_id, 'persisted'::text;
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
  text,
  text
) to service_role;
