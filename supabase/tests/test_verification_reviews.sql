-- Tests for identity verification and reviews (migration 0002).
\set ON_ERROR_STOP 1
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),  -- parent C
  ('00000000-0000-0000-0000-0000000000c2'),  -- parent D (never talked to the sitter)
  ('00000000-0000-0000-0000-0000000000c3'),  -- sitter S
  ('00000000-0000-0000-0000-0000000000ad');  -- admin
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');

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

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'sitter', 'שירה');
insert into public.sitters (id, hourly_price, lat, lng) values (auth.uid(), 50, 31.77, 35.21);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'רון');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'מיכל');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
insert into public.profiles (id, role, display_name) values (auth.uid(), 'parent', 'מנהל');

-- ---------------- Verification ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.expect_error($$update public.profiles set verified_at = now() where id = auth.uid()$$, 'verifying yourself');
insert into storage.objects (bucket_id, name) values ('id-documents', '00000000-0000-0000-0000-0000000000c3/r1-id.jpg');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('id-documents', '00000000-0000-0000-0000-0000000000c1/x.jpg')$$, 'uploading into someone else''s folder');
select pg_temp.check((select count(*) from storage.objects) = 0, 'users cannot read ID photos, not even their own');
select pg_temp.expect_error($$insert into public.verification_requests (id_path, selfie_path) values ('00000000-0000-0000-0000-0000000000c1/a.jpg', '00000000-0000-0000-0000-0000000000c3/b.jpg')$$, 'a request pointing at another user''s files');
insert into public.verification_requests (id_path, selfie_path)
  values ('00000000-0000-0000-0000-0000000000c3/r1-id.jpg', '00000000-0000-0000-0000-0000000000c3/r1-selfie.jpg');
select pg_temp.expect_error($$insert into public.verification_requests (id_path, selfie_path) values ('00000000-0000-0000-0000-0000000000c3/c.jpg', '00000000-0000-0000-0000-0000000000c3/d.jpg')$$, 'a second pending request');
select pg_temp.expect_error($$select * from public.pending_verifications()$$, 'a non-admin listing requests');
select pg_temp.check((select status from public.verification_requests) = 'pending', 'user sees own request as pending');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from public.verification_requests) = 0, 'other users cannot see a request');
select pg_temp.expect_error($$select public.review_verification(1, true)$$, 'a non-admin approving');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'id-documents') = 1, 'admin can read ID photos');
select id as req from public.pending_verifications() \gset
select pg_temp.check((select display_name from public.pending_verifications()) = 'שירה', 'admin sees the pending request');
select public.review_verification(:req, true);
select pg_temp.check((select verified_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'), 'approval marks the profile verified');
select pg_temp.check((select count(*) from public.pending_verifications()) = 0, 'no pending requests left');
delete from storage.objects where bucket_id = 'id-documents';
select pg_temp.check((select count(*) from storage.objects) = 0, 'admin can delete ID photos');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((select id_path is null and status = 'approved' from public.verification_requests), 'photo paths are cleared after review');

-- Rejection path
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.verification_requests (id_path, selfie_path)
  values ('00000000-0000-0000-0000-0000000000c1/a.jpg', '00000000-0000-0000-0000-0000000000c1/b.jpg');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select id as req2 from public.pending_verifications() \gset
select public.review_verification(:req2, false, 'התמונה לא ברורה');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select reject_reason from public.verification_requests order by id desc limit 1) = 'התמונה לא ברורה', 'user sees the rejection reason');
select pg_temp.check((select verified_at is null from public.profiles where id = auth.uid()), 'rejection does not verify');

-- ---------------- Reviews ----------------
select pg_temp.check(not public.can_review('00000000-0000-0000-0000-0000000000c3'), 'no review before any conversation');
select pg_temp.expect_error($$insert into public.reviews (sitter_id, rating, body) values ('00000000-0000-0000-0000-0000000000c3', 5, 'מעולה')$$, 'reviewing without a conversation');
select public.start_conversation('00000000-0000-0000-0000-0000000000c3') as conv \gset
insert into public.messages (conversation_id, body) values (:'conv', 'היי');
select pg_temp.check(not public.can_review('00000000-0000-0000-0000-0000000000c3'), 'no review until the sitter has replied');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.messages (conversation_id, body) values (:'conv', 'היי, פנויה');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(public.can_review('00000000-0000-0000-0000-0000000000c3'), 'review allowed after both sides wrote');
insert into public.reviews (sitter_id, rating, body) values ('00000000-0000-0000-0000-0000000000c3', 4, 'הגיעה בזמן');
select pg_temp.expect_error($$insert into public.reviews (sitter_id, rating, body) values ('00000000-0000-0000-0000-0000000000c3', 5, 'שוב')$$, 'a second review by the same parent');
update public.reviews set rating = 5 where sitter_id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.expect_error($$insert into public.reviews (sitter_id, rating) values ('00000000-0000-0000-0000-0000000000c3', 9)$$, 'a rating outside 1-5');
select pg_temp.check((select rating_avg = 5 and rating_count = 1 and verified from public.nearby_sitters(31.77, 35.21, 5, 100, false) where id = '00000000-0000-0000-0000-0000000000c3'), 'search shows rating and verified badge');
select pg_temp.check((select other_verified from public.my_conversations()), 'conversation list shows verified badge');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$insert into public.reviews (sitter_id, rating) values ('00000000-0000-0000-0000-0000000000c3', 1)$$, 'a review from a parent who never talked to the sitter');
update public.reviews set rating = 1;
select pg_temp.check((select rating from public.reviews) = 5, 'editing someone else''s review has no effect');
select pg_temp.check((select parent_name from public.sitter_reviews('00000000-0000-0000-0000-0000000000c3')) = 'רון', 'anyone signed in sees the review with the reviewer name');
select pg_temp.expect_error($$select public.reply_to_review((select id from public.reviews limit 1), 'hack')$$, 'replying to a review that is not about you');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.reply_to_review((select id from public.reviews limit 1), 'תודה רבה!');
select pg_temp.check((select sitter_reply from public.reviews) = 'תודה רבה!', 'sitter can reply');
update public.reviews set rating = 1;
select pg_temp.check((select rating from public.reviews) = 5, 'a sitter cannot change the rating');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.check((select count(*) from public.recent_reports()) >= 0, 'admin can list reports');
delete from public.reviews;
select pg_temp.check((select count(*) from public.reviews) = 0, 'admin can remove a review');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$select * from public.recent_reports()$$, 'a non-admin listing reports');

\echo ALL VERIFICATION AND REVIEW TESTS PASSED
