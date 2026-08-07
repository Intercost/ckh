-- ============================================================================
-- Migration: expand "programmes" to cover the full Key Stage range per
-- pathway (Cambridge, Pearson Edexcel, IB) and standardise curriculum labels
-- to match the admin dropdowns.
--
-- Run this ONCE in the Supabase SQL editor against your LIVE project.
-- Safe to re-run: updates are scoped to old label values, and inserts are
-- guarded so they won't create duplicates if you run it twice.
-- ============================================================================

-- 1. Fix curriculum labels on the 4 existing seeded programmes so they match
--    the standardised dropdown values in admin/admissions.html.
update programmes set curriculum = 'Cambridge International'      where name = 'Cambridge IGCSE'            and curriculum = 'Cambridge IGCSE';
update programmes set curriculum = 'Pearson Edexcel'               where name = 'Pearson Edexcel A-Level'     and curriculum = 'Edexcel';
update programmes set curriculum = 'International Baccalaureate'   where name = 'IB Diploma Programme'        and curriculum = 'IB';
update programmes set curriculum = 'Competency-Based Education'    where name = 'Competency-Based Education (CBE)' and curriculum = 'CBE';

-- Also bring the level field for Cambridge IGCSE / Pearson Edexcel A-Level in
-- line with the Key Stage wording used on the rest of the pathway.
update programmes set level = 'Key Stage 4 - Years 10 to 11' where name = 'Cambridge IGCSE' and level = 'Years 9 - 11';
update programmes set level = 'Key Stage 5 - Years 12 to 13' where name = 'Pearson Edexcel A-Level' and level = 'Years 12 - 13';

-- 2. Fix curriculum labels on cert_courses too, so "Certificate courses open
--    for applications" matches the same standard list.
update cert_courses set curriculum = 'Cambridge International'    where curriculum = 'Cambridge IGCSE';
update cert_courses set curriculum = 'Pearson Edexcel'             where curriculum = 'Pearson Edexcel A-Level';
update cert_courses set curriculum = 'International Baccalaureate' where curriculum = 'IB Diploma Programme';
update cert_courses set curriculum = 'Competency-Based Education'  where curriculum = 'CBE Junior School';

-- 3. Add the missing Key Stages for Cambridge, Pearson Edexcel and IB.
--    Each insert is guarded with "where not exists" so running this twice
--    won't create duplicate rows.

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'Cambridge Primary', 'Cambridge International', 'Key Stage 1-2 - Years 1 to 6', 15, 'open',
  'Foundational learning for Years 1 to 6, building towards the Primary Checkpoint.',
  'Our Cambridge Primary pathway (Key Stage 1-2) builds strong foundations in English, Mathematics and Science, culminating in the Cambridge Primary Checkpoint exam in Year 6.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']
where not exists (select 1 from programmes where name = 'Cambridge Primary');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'Cambridge Lower Secondary', 'Cambridge International', 'Key Stage 3 - Years 7 to 9', 12, 'open',
  'Develops skills and understanding for Years 7 to 9, building towards the Lower Secondary Checkpoint.',
  'Our Cambridge Lower Secondary pathway (Key Stage 3) develops learners'' skills and understanding across subjects, with Lower Secondary Checkpoint exams sat in Year 9.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']
where not exists (select 1 from programmes where name = 'Cambridge Lower Secondary');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'Cambridge AS & A-Level', 'Cambridge International', 'Key Stage 5 - Years 12 to 13', 6, 'open',
  'University-preparation subject combinations for senior learners.',
  'Our Cambridge Advanced pathway (Key Stage 5) offers AS & A-Level qualifications for university preparation, with subject combinations tailored to each learner''s goals.',
  'Apply below selecting your preferred subject combination. Admissions will confirm available seats.',
  array['IGCSE / O-Level certificate or latest results', 'Copy of learner''s birth certificate or passport', 'Copy of parent/guardian ID', 'Transfer letter (if applicable)']
where not exists (select 1 from programmes where name = 'Cambridge AS & A-Level');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'Edexcel Primary', 'Pearson Edexcel', 'Key Stage 1-2 - Years 1 to 6', 15, 'open',
  'Foundational Pearson Edexcel learning for Years 1 to 6.',
  'Our Edexcel Primary pathway (Key Stage 1-2) builds core skills across subjects, following the Pearson Edexcel International Primary curriculum.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']
where not exists (select 1 from programmes where name = 'Edexcel Primary');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'Edexcel Lower Secondary', 'Pearson Edexcel', 'Key Stage 3 - Years 7 to 9', 12, 'open',
  'Develops knowledge and skills across subjects for Years 7 to 9.',
  'Our Edexcel Lower Secondary pathway (Key Stage 3) develops learners'' knowledge and skills across subjects, preparing them for IGCSE study.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']
where not exists (select 1 from programmes where name = 'Edexcel Lower Secondary');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'Edexcel IGCSE', 'Pearson Edexcel', 'Key Stage 4 - Years 10 to 11', 12, 'open',
  'International GCSE qualifications for Years 10 to 11.',
  'Our Edexcel IGCSE pathway (Key Stage 4 / Secondary) offers internationally recognised qualifications across sciences, humanities, mathematics and languages.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']
where not exists (select 1 from programmes where name = 'Edexcel IGCSE');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'IB PYP', 'International Baccalaureate', 'Primary Years Programme', 15, 'open',
  'The IB Primary Years Programme for our youngest learners.',
  'Our IB PYP pathway nurtures curious, knowledgeable and caring young learners through holistic, inquiry-based learning that encourages global-mindedness.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Copy of learner''s birth certificate', 'Latest school report / transcript', 'Copy of parent/guardian national ID or passport', '2 passport-size photos']
where not exists (select 1 from programmes where name = 'IB PYP');

insert into programmes (name, curriculum, level, vacancies, status, summary, description, how_to_apply, required_documents)
select 'IB MYP', 'International Baccalaureate', 'Middle Years Programme', 12, 'open',
  'The IB Middle Years Programme for middle school learners.',
  'Our IB MYP pathway encourages learners to make practical connections between their studies and the real world, building towards the IB Diploma.',
  'Submit an admission application with the learner''s details and the intake you are applying for. Our admissions office will review and contact you within 3 working days.',
  array['Latest school report / transcript', 'Copy of learner''s birth certificate or passport', 'Copy of parent/guardian ID']
where not exists (select 1 from programmes where name = 'IB MYP');
