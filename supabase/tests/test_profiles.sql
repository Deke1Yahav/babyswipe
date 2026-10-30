-- Tests for profile photos and profile details (migration 0003).
\set ON_ERROR_STOP 1
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),  -- parent
  ('00000000-0000-0000-0000-0000000000e2'),  -- sitter
  ('00000000-0000-0000-0000-0000000000e3'),  -- unrelated parent
  ('00000000-0000-0000-0000-0000000000ea');  -- admin
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000ea');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;
create function pg_temp.expect_error(stmt text, what text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % succeeded but should have been refused', what;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok: % refused (%)', what, sqlerrm;
end $$;
create function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', what; end if;
  raise notice 'ok: %', what;
end $$;

set role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'sitter', 'טל');
insert into public.sitters (id, hourly_price, lat, lng, occupation) values (auth.uid(), 60, 32.79, 34.99, 'סטודנטית לסיעוד');
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000e2/a.jpg');
update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000e2/a.jpg', about = 'אוהבת ילדים' where id = auth.uid();
select pg_temp.check((select avatar_path from public.profiles where id = auth.uid()) like '%/a.jpg', 'user can set own photo');
select pg_temp.expect_error($$update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000e1/x.jpg' where id = auth.uid()$$, 'pointing your photo at another user''s file');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000e1/x.jpg')$$, 'uploading a photo into someone else''s folder');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'עדי');
update public.profiles set kids_text = '2 ילדים, בני 3 ו-6', about = 'גרים ליד הפארק' where id = auth.uid();
select pg_temp.check((select avatar_path like '%/a.jpg' and occupation = 'סטודנטית לסיעוד' from public.nearby_sitters(32.79, 34.99, 5, 100, false)), 'search returns photo and occupation');
update public.profiles set about = 'hacked' where id = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check((select about from public.profiles where id = '00000000-0000-0000-0000-0000000000e2') = 'אוהבת ילדים', 'editing someone else''s profile has no effect');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'others cannot list photo files');
select public.start_conversation('00000000-0000-0000-0000-0000000000e2') as conv \gset

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check((select kids_text from public.profiles where id = '00000000-0000-0000-0000-0000000000e1') = '2 ילדים, בני 3 ו-6', 'sitter sees parent details once they are in a conversation');
select pg_temp.check((select other_name from public.my_conversations()) = 'עדי', 'conversation list still works');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'גיל');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000e3') = 0, 'sitter cannot see parents they never talked to');
select pg_temp.expect_error($$select public.admin_clear_avatar('00000000-0000-0000-0000-0000000000e1')$$, 'a non-admin removing photos');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ea');
select pg_temp.check(public.admin_clear_avatar('00000000-0000-0000-0000-0000000000e2') like '%/a.jpg', 'admin can take down a photo');
delete from storage.objects where bucket_id = 'avatars';
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'admin can delete the photo file');
reset role;
select pg_temp.check((select avatar_path is null from public.profiles where id = '00000000-0000-0000-0000-0000000000e2'), 'photo removed from the profile');

\echo ALL PROFILE TESTS PASSED
