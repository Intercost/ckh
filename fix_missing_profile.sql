-- 1. See who this user is and what metadata they signed up with:
select id, email, raw_user_meta_data
from auth.users
where id = 'b305749a-231a-4610-a8b0-084c31df249a';

-- 2. Confirm there's really no profile row for them:
select * from profiles where id = 'b305749a-231a-4610-a8b0-084c31df249a';

-- 3. If query 2 came back empty, create the missing profile from their
-- own auth metadata (this mirrors exactly what the trigger should have
-- done). Run this after checking query 1's output:
insert into profiles (id, role, name, email, phone, grade, curriculum, subjects)
select
  id,
  coalesce((raw_user_meta_data->>'role')::user_role, 'student'),
  coalesce(raw_user_meta_data->>'name', email),
  email,
  raw_user_meta_data->>'phone',
  raw_user_meta_data->>'grade',
  raw_user_meta_data->>'curriculum',
  coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(raw_user_meta_data->'subjects', '[]'::jsonb)) x),
    '{}'
  )
from auth.users
where id = 'b305749a-231a-4610-a8b0-084c31df249a'
on conflict (id) do nothing;
