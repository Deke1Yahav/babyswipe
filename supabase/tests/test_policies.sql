-- Policy tests for the BabySwipe schema. Run with supabase/tests/run_local.sh,
-- which loads this file after a minimal stand-in for Supabase's auth schema.
\set ON_ERROR_STOP 1
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- parent A
  ('00000000-0000-0000-0000-00000000000b'),  -- parent B
  ('00000000-0000-0000-0000-000000000001'),  -- sitter 1
  ('00000000-0000-0000-0000-000000000002');  -- sitter 2

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

-- Sign-up
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'sitter', 'נועה');
insert into public.sitters (id, age, hourly_price, lat, lng, available_until)
  values (auth.uid(), 22, 55, 32.08712, 34.78133, now() + interval '3 hours');
select pg_temp.check((select lat from public.sitters where id = auth.uid()) = 32.085, 'sitter location is snapped to the grid');
select pg_temp.expect_error($$update public.profiles set role = 'parent' where id = auth.uid()$$, 'changing your own role');

select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'sitter', 'איתי');
insert into public.sitters (id, age, hourly_price, lat, lng) values (auth.uid(), 25, 90, 32.10, 34.80);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'דנה');
select pg_temp.expect_error($$insert into public.profiles (id, role, display_name) values ('00000000-0000-0000-0000-00000000000b', 'parent', 'x')$$, 'creating a profile for someone else');
select pg_temp.expect_error($$insert into public.sitters (id, hourly_price, lat, lng) values (auth.uid(), 50, 32, 34)$$, 'a parent creating a sitter listing');
update public.sitters set hourly_price = 20 where id = '00000000-0000-0000-0000-000000000001';
select pg_temp.check((select hourly_price from public.sitters where id = '00000000-0000-0000-0000-000000000001') = 55, 'editing another user''s listing has no effect');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'יואב');

-- Search
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.nearby_sitters(32.0853, 34.7818, 10, 100, false)) = 2, 'parent sees both sitters within 10 km');
select pg_temp.check((select count(*) from public.nearby_sitters(32.0853, 34.7818, 10, 60, false)) = 1, 'price filter');
select pg_temp.check((select count(*) from public.nearby_sitters(32.0853, 34.7818, 1, 100, false)) = 1, 'distance filter');
select pg_temp.check((select count(*) from public.nearby_sitters(32.0853, 34.7818, 10, 100, true)) = 1, 'available-now filter');

-- Swipes
insert into public.swipes (parent_id, sitter_id, verdict) values (auth.uid(), '00000000-0000-0000-0000-000000000001', 'like');
insert into public.swipes (parent_id, sitter_id, verdict) values (auth.uid(), '00000000-0000-0000-0000-000000000002', 'pass');
insert into public.swipes (parent_id, sitter_id, verdict) values (auth.uid(), '00000000-0000-0000-0000-000000000002', 'like')
  on conflict (parent_id, sitter_id) do update set parent_id = excluded.parent_id, sitter_id = excluded.sitter_id, verdict = excluded.verdict;
select pg_temp.check((select verdict from public.swipes where sitter_id = '00000000-0000-0000-0000-000000000002') = 'like', 'changing a pass to a like (client upsert)');
delete from public.swipes where sitter_id = '00000000-0000-0000-0000-000000000002';
select pg_temp.check((select my_verdict from public.nearby_sitters(32.0853, 34.7818, 10, 100, false) where id = '00000000-0000-0000-0000-000000000001') = 'like', 'verdict shows in search');
select pg_temp.expect_error($$insert into public.swipes (parent_id, sitter_id, verdict) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000002', 'like')$$, 'swiping as someone else');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.swipes) = 0, 'swipes are private');
select pg_temp.check((select count(*) from public.profiles where role = 'parent' and id <> auth.uid()) = 0, 'parents cannot list other parents');

-- Conversations
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.start_conversation('00000000-0000-0000-0000-000000000001') as conv \gset
select pg_temp.check(public.start_conversation('00000000-0000-0000-0000-000000000001') = :'conv', 'start_conversation is idempotent');
insert into public.messages (conversation_id, body) values (:'conv', 'היי, את פנויה הערב?');
select pg_temp.expect_error($$insert into public.messages (conversation_id, sender_id, body) values ('$$ || :'conv' || $$', '00000000-0000-0000-0000-000000000001', 'spoof')$$, 'sending a message as someone else');

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select public.start_conversation('00000000-0000-0000-0000-000000000002')$$, 'a sitter starting a conversation');
select pg_temp.check((select unread from public.my_conversations()) = 1, 'sitter has one unread message');
select pg_temp.check((select other_name from public.my_conversations()) = 'דנה', 'sitter sees the parent''s name');
select pg_temp.check((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 1, 'sitter can read the parent profile of a conversation');
select public.mark_read(:'conv');
select pg_temp.check((select unread from public.my_conversations()) = 0, 'mark_read clears unread');
insert into public.messages (conversation_id, body) values (:'conv', 'כן, מ-19:00');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.messages) = 0, 'outsiders cannot read messages');
select pg_temp.check((select count(*) from public.conversations) = 0, 'outsiders cannot see conversations');
select pg_temp.expect_error($$insert into public.messages (conversation_id, body) values ('$$ || :'conv' || $$', 'hi')$$, 'an outsider posting into a conversation');

-- Blocking and reporting
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.messages where conversation_id = :'conv') = 2, 'parent sees both messages');
insert into public.reports (reported_id, reason) values ('00000000-0000-0000-0000-000000000001', 'בדיקה');
select pg_temp.expect_error($$select count(*) from public.reports$$, 'reading reports');
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.nearby_sitters(32.0853, 34.7818, 10, 100, false)) = 1, 'blocked sitter is hidden from search');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$insert into public.messages (conversation_id, body) values ('$$ || :'conv' || $$', 'still there?')$$, 'messaging after being blocked');
select pg_temp.check((select blocked from public.my_conversations()) = true, 'conversation shows as blocked');

-- Account deletion
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
reset role;
select pg_temp.check((select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000a') = 0, 'account deleted');
select pg_temp.check((select count(*) from public.conversations) = 0, 'conversations removed with the account');
select pg_temp.check((select count(*) from public.messages) = 0, 'messages removed with the account');

\echo ALL POLICY TESTS PASSED
