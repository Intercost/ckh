-- ============================================================================
-- Migration 2: Student e-signature name.
--
-- Run this in the Supabase SQL editor. It's a small follow-up to
-- migration_agreement_signoff_and_security.sql (which you've already run):
-- the student application form now captures a typed signature name
-- alongside the existing agreement_accepted/agreement_accepted_at fields,
-- instead of just a plain checkbox.
-- Safe to re-run: uses IF NOT EXISTS.
-- ============================================================================

alter table admissions
  add column if not exists agreement_signed_name text;  -- the typed name entered as their signature
