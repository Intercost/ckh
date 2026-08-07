-- =====================================================================
-- CKH International School Portal - Supabase schema (v2)
-- Run this in the Supabase SQL editor.
--
-- Design note: the original app referenced courses/students/teachers by
-- their display NAME almost everywhere (not by ID) and had no real link
-- between "roster/gradebook/attendance" demo rows and actual login
-- accounts. This schema keeps that same shape (text columns instead of
-- foreign keys) so the existing pages keep working unchanged, while still
-- giving you real auth, real role-based access control, and a real
-- catalog for courses/programmes/certificate courses/profiles.
-- =====================================================================

create extension if not exists pgcrypto;

create type user_role          as enum ('student', 'teacher', 'admin');
create type application_status as enum ('pending', 'approved', 'rejected', 'more_info');
create type fee_status         as enum ('paid', 'pending', 'overdue');
create type programme_status   as enum ('open', 'closed');

-- ---------------------------------------------------------------------
-- profiles - extends auth.users (replaces ckh_users)
-- ---------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        user_role not null default 'student',
  name        text not null,
  email       text not null unique,
  phone       text,
  grade       text,
  curriculum  text,
  subjects    text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up (self signup
-- for students, or supabase.auth.admin.createUser() for admin-created
-- teachers - both go through this trigger).
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, name, email, phone, grade, curriculum, subjects)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'student'),
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'curriculum',
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'subjects', '[]'::jsonb)) x),
      '{}'
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helper functions for RLS
-- ---------------------------------------------------------------------
create function public.current_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create function public.is_admin() returns boolean as $$
  select public.current_role() = 'admin';
$$ language sql stable security definer set search_path = public;

create function public.is_teacher() returns boolean as $$
  select public.current_role() = 'teacher';
$$ language sql stable security definer set search_path = public;

create function public.is_staff() returns boolean as $$
  select public.current_role() in ('admin', 'teacher');
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------
-- courses (replaces ckh_courses). `teacher` stays a plain display name,
-- exactly like the original - actual per-teacher visibility is driven by
-- profiles.subjects, not this column.
-- ---------------------------------------------------------------------
create table courses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  teacher     text,
  room        text,
  materials   jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- roster (replaces ckh_roster) - read-only reference data for teachers
-- ---------------------------------------------------------------------
create table roster (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  course      text not null,
  grade       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- announcements (replaces ckh_announcements)
-- ---------------------------------------------------------------------
create table announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  author      text not null,
  audience    text not null default 'all',
  course      text,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- assignments (replaces ckh_assignments) + submissions (replaces ckh_submissions)
-- ---------------------------------------------------------------------
create table assignments (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  course      text not null,
  due_date    date,
  status      text not null default 'upcoming',
  created_at  timestamptz not null default now()
);

create table submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment     text not null,
  course         text not null,
  student        text not null,
  submitted_at   date not null default current_date,
  status         text not null default 'pending',
  grade          numeric,
  feedback       text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- grades (replaces ckh_grades - the logged-in student's own scores)
-- ---------------------------------------------------------------------
create table grades (
  id          uuid primary key default gen_random_uuid(),
  course      text not null,
  score       numeric not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- gradebook (replaces ckh_gradebook)
-- ---------------------------------------------------------------------
create table gradebook (
  id          uuid primary key default gen_random_uuid(),
  student_id  text not null,     -- e.g. 'stu_001' from the roster, not an auth id
  name        text not null,
  course      text not null,
  score       numeric,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- lesson_plans, quizzes, question_bank
-- ---------------------------------------------------------------------
create table lesson_plans (
  id          uuid primary key default gen_random_uuid(),
  course      text not null,
  week        text,
  topic       text not null,
  objectives  text,
  teacher     text,
  created_at  timestamptz not null default now()
);

create table quizzes (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  course          text not null,
  question_count  int not null default 0,
  duration        int not null default 0,
  date            date,
  created_at      timestamptz not null default now()
);

create table question_bank (
  id          uuid primary key default gen_random_uuid(),
  course      text not null,
  question    text not null,
  type        text,
  difficulty  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- attendance_log (replaces ckh_attendance_log)
-- ---------------------------------------------------------------------
create table attendance_log (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  course      text not null,
  records     jsonb not null default '[]',   -- [{studentId, name, status}]
  created_at  timestamptz not null default now()
);

-- attendance (replaces ckh_attendance - a single overview row the current
-- student sees on their dashboard: percentage / absences / term)
create table attendance (
  id          uuid primary key default gen_random_uuid(),
  percentage  numeric not null default 0,
  absences    int not null default 0,
  term        text not null default 'This term',
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- programmes (replaces ckh_programmes) + admissions (replaces ckh_admissions)
-- ---------------------------------------------------------------------
create table programmes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  curriculum         text,
  level              text,
  vacancies          int not null default 0,
  status             programme_status not null default 'open',
  summary            text,
  description        text,
  how_to_apply       text,
  required_documents text[] not null default '{}',
  created_at         timestamptz not null default now()
);

-- id is the human-readable reference itself (e.g. "ADM-4821"), exactly
-- like the original app - generated client-side at submission time.
create table admissions (
  id              text primary key,
  name            text not null,
  email           text,
  phone           text,
  programme_id    uuid references programmes (id) on delete set null,
  programme_name  text,
  curriculum      text,
  level           text,
  notes           text,
  status          application_status not null default 'pending',
  admin_note      text,
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  student_id      uuid references profiles (id)   -- set at signup time, see below
);

-- ---------------------------------------------------------------------
-- cert_courses (replaces ckh_cert_courses) + teacher_applications
-- ---------------------------------------------------------------------
create table cert_courses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  curriculum  text,
  status      programme_status not null default 'open',
  created_at  timestamptz not null default now()
);

create table teacher_applications (
  id                text primary key,   -- e.g. "JOB-4821"
  name              text not null,
  email             text,
  phone             text,
  cert_course_id    uuid references cert_courses (id) on delete set null,
  cert_course_name  text,
  curriculum        text,
  qualifications    text,
  notes             text,
  status            application_status not null default 'pending',
  admin_note        text,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz
);

-- ---------------------------------------------------------------------
-- fees (replaces ckh_fees)
-- ---------------------------------------------------------------------
create table fees (
  id          uuid primary key default gen_random_uuid(),
  student     text not null,
  term        text not null,
  amount      numeric not null,
  status      fee_status not null default 'pending',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- academic_calendar + timetable
-- ---------------------------------------------------------------------
create table academic_calendar (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  date        date not null,
  type        text,
  created_at  timestamptz not null default now()
);

create table timetable (
  id          uuid primary key default gen_random_uuid(),
  day         text not null,
  time        text not null,
  course      text not null,
  room        text,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- Rule of thumb used throughout: admins can do anything; teachers can
-- read everything and manage day-to-day operational data (courses,
-- assignments, grades, attendance, lesson plans, quizzes, timetable,
-- announcements); students get read access to what they need to see and
-- can only manage their own profile. Public marketing tables (programmes,
-- cert_courses) are readable by anyone, and prospective applicants
-- (no account yet) can insert into admissions / teacher_applications.
-- =====================================================================

alter table profiles            enable row level security;
alter table courses             enable row level security;
alter table roster              enable row level security;
alter table announcements       enable row level security;
alter table assignments         enable row level security;
alter table submissions         enable row level security;
alter table grades              enable row level security;
alter table gradebook           enable row level security;
alter table lesson_plans        enable row level security;
alter table quizzes             enable row level security;
alter table question_bank       enable row level security;
alter table attendance_log      enable row level security;
alter table attendance          enable row level security;
alter table programmes          enable row level security;
alter table admissions          enable row level security;
alter table cert_courses        enable row level security;
alter table teacher_applications enable row level security;
alter table fees                enable row level security;
alter table academic_calendar   enable row level security;
alter table timetable           enable row level security;

-- profiles
create policy "profiles_select" on profiles
  for select using (id = auth.uid() or is_staff());
create policy "profiles_update" on profiles
  for update using (id = auth.uid() or is_admin());
create policy "profiles_admin_insert" on profiles
  for insert with check (is_admin());
create policy "profiles_admin_delete" on profiles
  for delete using (is_admin());

-- courses
create policy "courses_read" on courses for select using (auth.role() = 'authenticated');
create policy "courses_write" on courses for insert with check (is_staff());
create policy "courses_update" on courses for update using (is_staff());
create policy "courses_delete" on courses for delete using (is_staff());

-- roster (read-only reference data; admin/teacher maintain it)
create policy "roster_read" on roster for select using (is_staff());
create policy "roster_write" on roster for all using (is_staff()) with check (is_staff());

-- announcements
create policy "announcements_read" on announcements for select using (auth.role() = 'authenticated');
create policy "announcements_write" on announcements for insert with check (is_staff());
create policy "announcements_update" on announcements for update using (is_staff());
create policy "announcements_delete" on announcements for delete using (is_staff());

-- assignments
create policy "assignments_read" on assignments for select using (auth.role() = 'authenticated');
create policy "assignments_write" on assignments for all using (is_staff()) with check (is_staff());

-- submissions (teacher/admin manage; students can view)
create policy "submissions_read" on submissions for select using (auth.role() = 'authenticated');
create policy "submissions_write" on submissions for all using (is_staff()) with check (is_staff());

-- grades
create policy "grades_read" on grades for select using (auth.role() = 'authenticated');
create policy "grades_write" on grades for all using (is_staff()) with check (is_staff());

-- gradebook
create policy "gradebook_read" on gradebook for select using (is_staff());
create policy "gradebook_write" on gradebook for all using (is_staff()) with check (is_staff());

-- lesson_plans / quizzes / question_bank
create policy "lesson_plans_read" on lesson_plans for select using (auth.role() = 'authenticated');
create policy "lesson_plans_write" on lesson_plans for all using (is_staff()) with check (is_staff());

create policy "quizzes_read" on quizzes for select using (auth.role() = 'authenticated');
create policy "quizzes_write" on quizzes for all using (is_staff()) with check (is_staff());

create policy "question_bank_read" on question_bank for select using (is_staff());
create policy "question_bank_write" on question_bank for all using (is_staff()) with check (is_staff());

-- attendance_log / attendance
create policy "attendance_log_read" on attendance_log for select using (is_staff());
create policy "attendance_log_write" on attendance_log for all using (is_staff()) with check (is_staff());

create policy "attendance_read" on attendance for select using (auth.role() = 'authenticated');
create policy "attendance_write" on attendance for all using (is_staff()) with check (is_staff());

-- programmes / cert_courses - public marketing data
create policy "programmes_public_read" on programmes for select using (true);
create policy "programmes_admin_write" on programmes for all using (is_admin()) with check (is_admin());

create policy "cert_courses_public_read" on cert_courses for select using (true);
create policy "cert_courses_admin_write" on cert_courses for all using (is_admin()) with check (is_admin());

-- admissions - anyone can apply (even signed-in applicants); an applicant
-- can see their own application by email; admin sees/manages everything
create policy "admissions_insert" on admissions for insert with check (true);
create policy "admissions_admin_all" on admissions for all using (is_admin()) with check (is_admin());
create policy "admissions_select_own" on admissions
  for select using (is_admin() or email = auth.jwt() ->> 'email' or student_id = auth.uid());

-- teacher_applications - same pattern
create policy "teacher_apps_insert" on teacher_applications for insert with check (true);
create policy "teacher_apps_admin_all" on teacher_applications for all using (is_admin()) with check (is_admin());
create policy "teacher_apps_select_own" on teacher_applications
  for select using (is_admin() or email = auth.jwt() ->> 'email');

-- fees
create policy "fees_read" on fees for select using (auth.role() = 'authenticated');
create policy "fees_write" on fees for all using (is_admin()) with check (is_admin());

-- academic_calendar / timetable
create policy "calendar_read" on academic_calendar for select using (auth.role() = 'authenticated');
create policy "calendar_write" on academic_calendar for all using (is_admin()) with check (is_admin());

create policy "timetable_read" on timetable for select using (auth.role() = 'authenticated');
create policy "timetable_write" on timetable for all using (is_admin()) with check (is_admin());

-- =====================================================================
-- Indexes
-- =====================================================================
create index idx_assignments_course      on assignments (course);
create index idx_submissions_course      on submissions (course);
create index idx_grades_created          on grades (created_at);
create index idx_gradebook_course        on gradebook (course);
create index idx_attendance_log_course   on attendance_log (course, date);
create index idx_admissions_status       on admissions (status);
create index idx_admissions_email        on admissions (email);
create index idx_teacher_apps_status     on teacher_applications (status);
create index idx_teacher_apps_email      on teacher_applications (email);
create index idx_fees_student            on fees (student);
create index idx_timetable_course        on timetable (course);

-- =====================================================================
-- Seed data (mirrors the sample data hard-coded in js/db.js).
-- Comment this whole block out for a clean production install.
-- =====================================================================
insert into courses (name, room) values
  ('Additional Mathematics', 'Room 4'),
  ('English Language', 'Room 2'),
  ('Combined Science', 'Lab 1');

insert into attendance (percentage, absences, term) values (94, 3, 'This term');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents) values
  ('Cambridge Primary', 'Cambridge International', 'Key Stage 1-2 - Years 1 to 6', 15, 'open',
   'Foundational learning for Years 1 to 6, building towards the Primary Checkpoint.',
   'Our Cambridge Primary pathway (Key Stage 1-2) builds strong foundations in English, Mathematics and Science, culminating in the Cambridge Primary Checkpoint exam in Year 6.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('Cambridge Lower Secondary', 'Cambridge International', 'Key Stage 3 - Years 7 to 9', 12, 'open',
   'Develops skills and understanding for Years 7 to 9, building towards the Lower Secondary Checkpoint.',
   'Our Cambridge Lower Secondary pathway (Key Stage 3) develops learners'' skills and understanding across subjects, with Lower Secondary Checkpoint exams sat in Year 9.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('Cambridge IGCSE', 'Cambridge International', 'Key Stage 4 - Years 10 to 11', 12, 'open',
   'Broad, internationally-recognised subjects for Years 10 to 11.',
   'Our Cambridge IGCSE pathway (Key Stage 4 / Secondary) prepares learners for internationally recognised qualifications across sciences, humanities, mathematics and languages, with small class sizes and continuous assessment.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('Cambridge AS & A-Level', 'Cambridge International', 'Key Stage 5 - Years 12 to 13', 6, 'open',
   'University-preparation subject combinations for senior learners.',
   'Our Cambridge Advanced pathway (Key Stage 5) offers AS & A-Level qualifications for university preparation, with subject combinations tailored to each learner''s goals.',
   'Apply below selecting your preferred subject combination. Admissions will confirm available seats.',
   array['IGCSE / O-Level certificate or latest results', 'Copy of learner''s birth certificate or passport', 'Copy of parent/guardian ID', 'Transfer letter (if applicable)']),
  ('Edexcel Primary', 'Pearson Edexcel', 'Key Stage 1-2 - Years 1 to 6', 15, 'open',
   'Foundational Pearson Edexcel learning for Years 1 to 6.',
   'Our Edexcel Primary pathway (Key Stage 1-2) builds core skills across subjects, following the Pearson Edexcel International Primary curriculum.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('Edexcel Lower Secondary', 'Pearson Edexcel', 'Key Stage 3 - Years 7 to 9', 12, 'open',
   'Develops knowledge and skills across subjects for Years 7 to 9.',
   'Our Edexcel Lower Secondary pathway (Key Stage 3) develops learners'' knowledge and skills across subjects, preparing them for IGCSE study.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('Edexcel IGCSE', 'Pearson Edexcel', 'Key Stage 4 - Years 10 to 11', 12, 'open',
   'International GCSE qualifications for Years 10 to 11.',
   'Our Edexcel IGCSE pathway (Key Stage 4 / Secondary) offers internationally recognised qualifications across sciences, humanities, mathematics and languages.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('Pearson Edexcel A-Level', 'Pearson Edexcel', 'Key Stage 5 - Years 12 to 13', 6, 'open',
   'Specialist A-Level subject combinations for senior learners.',
   'A focused two-year A-Level programme (Key Stage 5) with subject combinations tailored to each learner''s university and career goals.',
   'Apply below selecting your preferred subject combination. Admissions will confirm available seats.',
   array['IGCSE / O-Level certificate or latest results', 'Copy of learner''s birth certificate or passport', 'Copy of parent/guardian ID', 'Transfer letter (if applicable)']),
  ('IB PYP', 'International Baccalaureate', 'Primary Years Programme', 15, 'open',
   'The IB Primary Years Programme for our youngest learners.',
   'Our IB PYP pathway nurtures curious, knowledgeable and caring young learners through holistic, inquiry-based learning that encourages global-mindedness.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']),
  ('IB MYP', 'International Baccalaureate', 'Middle Years Programme', 12, 'open',
   'The IB Middle Years Programme for middle school learners.',
   'Our IB MYP pathway encourages learners to make practical connections between their studies and the real world, building towards the IB Diploma.',
   'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
   array['Latest school report / transcript', 'Copy of learner''s birth certificate or passport', 'Copy of parent/guardian ID']),
  ('IB Diploma Programme', 'International Baccalaureate', 'Years 12 - 13', 0, 'open',
   'The full International Baccalaureate Diploma pathway.',
   'A rigorous, globally respected two-year diploma covering six subject groups plus Theory of Knowledge, the Extended Essay and CAS.',
   'Applications are still accepted even when the intake is full - approved learners are waitlisted.',
   array['Latest two years of school transcripts', 'Copy of learner''s birth certificate or passport', 'Reference letter from current school', 'Copy of parent/guardian ID']),
  ('Competency-Based Education (CBE)', 'Competency-Based Education', 'Junior School', 18, 'open',
   'Kenya''s CBE pathway for junior school learners.',
   'A hands-on, competency-based programme aligned to the Kenyan CBC framework.',
   'Apply below with the learner''s current grade. Admissions will confirm a vacant slot.',
   array['Learner''s birth certificate', 'Immunisation / health record', 'Latest school report (if transferring)', 'Copy of parent/guardian ID']);

insert into cert_courses (name, curriculum, status) values
  ('Additional Mathematics', 'Cambridge International', 'open'),
  ('English Language', 'Cambridge International', 'open'),
  ('Physics', 'Pearson Edexcel', 'open'),
  ('Mathematics', 'International Baccalaureate', 'open'),
  ('Integrated Science', 'Competency-Based Education', 'open');
