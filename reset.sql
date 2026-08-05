-- Run this FIRST, then run schema.sql fresh, top to bottom.
-- CASCADE means: drop this, and anything (policies, views, etc.) that
-- depends on it, too - so order doesn't matter and it's safe to run
-- however many times, on whatever partial state is currently there.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_teacher() cascade;
drop function if exists public.is_staff() cascade;
drop function if exists public.teaches_course(uuid) cascade;
drop function if exists public.enrolled_in_course(uuid) cascade;

drop view if exists attendance_summary cascade;

-- Covers table names from BOTH schema drafts you may have partially run.
drop table if exists
  timetable, academic_calendar, fees, teacher_applications, cert_courses,
  admissions, programmes, attendance, attendance_log,
  attendance_records, question_bank, quizzes, lesson_plans, gradebook,
  grades, submissions, assignments, announcements, roster,
  course_enrollments, courses, profiles
  cascade;

drop type if exists user_role cascade;
drop type if exists application_status cascade;
drop type if exists fee_status cascade;
drop type if exists attendance_status cascade;
drop type if exists assignment_status cascade;
drop type if exists submission_status cascade;
drop type if exists programme_status cascade;
drop type if exists weekday cascade;
