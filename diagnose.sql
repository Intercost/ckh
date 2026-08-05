-- 1. Confirm the auth user actually exists, and grab their id + email:
select id, email from auth.users order by created_at desc limit 5;

-- 2. Confirm the trigger exists:
select tgname from pg_trigger where tgname = 'on_auth_user_created';

-- 3. Check profiles table directly (bypasses any UI caching):
select * from profiles;
