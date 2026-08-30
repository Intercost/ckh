-- ============================================================================
-- Migration: Agreement sign-off (student + teacher) + role-escalation fix.
--
-- Run this ONCE in the Supabase SQL editor against your LIVE project if the
-- database already exists (i.e. you're not running schema.sql fresh).
-- schema.sql has already been updated with these same changes for anyone
-- setting up a brand-new project from scratch.
-- Safe to re-run: every statement below is idempotent (IF NOT EXISTS /
-- OR REPLACE / DROP ... IF EXISTS before CREATE).
-- ============================================================================

-- 1. Student Terms & Conditions sign-off, captured at application time.
alter table admissions
  add column if not exists agreement_accepted    boolean not null default false,
  add column if not exists agreement_accepted_at timestamptz,
  add column if not exists agreement_version     text;

-- Reject any insert that doesn't explicitly accept the agreement. Existing
-- rows (submitted before this feature existed) are backfilled to `true`
-- first so the constraint doesn't fail on historical data.
update admissions set agreement_accepted = true where agreement_accepted = false;

alter table admissions drop constraint if exists admissions_agreement_required;
alter table admissions add constraint admissions_agreement_required check (agreement_accepted = true);

-- 2. Teacher Agreement & Code of Conduct sign-off, captured on first login
--    after a successful interview, before any teacher portal page loads.
alter table profiles
  add column if not exists agreement_signed      boolean not null default false,
  add column if not exists agreement_signed_at   timestamptz,
  add column if not exists agreement_version     text,
  add column if not exists agreement_signed_name text;  -- the typed name entered as their signature

-- 3. Security hardening: prevent privilege escalation via the profiles
--    table. The existing "profiles_update" policy correctly lets a user
--    update their OWN row (e.g. to sign the agreement above, or change
--    their phone number) - but without this trigger, that same policy
--    also lets any signed-in student or teacher run
--      update profiles set role = 'admin' where id = auth.uid()
--    using nothing but the public anon key, since RLS's USING/WITH CHECK
--    clauses don't restrict individual columns. This trigger blocks role
--    changes from anyone except an existing admin.
create or replace function public.prevent_role_self_escalation()
returns trigger as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a user''s role';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_role_self_escalation on profiles;
create trigger trg_prevent_role_self_escalation
  before update on profiles
  for each row execute procedure public.prevent_role_self_escalation();
