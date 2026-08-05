insert into profiles (id, role, name, email)
select id, 'admin', 'Admin', email
from auth.users
where email = 'ckh@gmail.com'
on conflict (id) do update set role = 'admin';

-- Confirm it actually landed this time:
select * from profiles where email = 'ckh@gmail.com';
