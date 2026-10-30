-- Identity verification (manual review by an admin) and reviews of sitters.
-- Run after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
-- Add yourself once, in the SQL editor:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Identity verification
-- ---------------------------------------------------------------------------
-- Set only by review_verification(); clients cannot write it (profiles only grants update on display_name).
alter table public.profiles add column verified_at timestamptz;

create table public.verification_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  id_path       text,
  selfie_path   text,
  reject_reason text check (char_length(reject_reason) <= 300),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewer_id   uuid references auth.users (id) on delete set null
);
create unique index verification_one_pending on public.verification_requests (user_id) where status = 'pending';

alter table public.verification_requests enable row level security;
revoke all on public.verification_requests from anon, authenticated;
grant select, insert (id_path, selfie_path) on public.verification_requests to authenticated;
create policy verification_select_own on public.verification_requests for select to authenticated
  using (user_id = auth.uid());
create policy verification_insert_own on public.verification_requests for insert to authenticated with check (
  user_id = auth.uid()
  and status = 'pending'
  and split_part(id_path, '/', 1) = auth.uid()::text
  and split_part(selfie_path, '/', 1) = auth.uid()::text
  and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.verified_at is not null)
);

-- Private bucket for the photos. Users may only upload into their own folder;
-- only admins can view or delete. Files are deleted after review.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-documents', 'id-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy id_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy id_documents_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'id-documents' and public.is_admin());
create policy id_documents_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'id-documents' and public.is_admin());

create function public.pending_verifications() returns table (
  id bigint, user_id uuid, display_name text, role public.user_role,
  id_path text, selfie_path text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select v.id, v.user_id, p.display_name, p.role, v.id_path, v.selfie_path, v.created_at
    from public.verification_requests v join public.profiles p on p.id = v.user_id
    where v.status = 'pending'
    order by v.created_at;
end $$;

-- Approves or rejects a request. The caller then deletes the two photos from storage.
create function public.review_verification(p_request bigint, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reject_reason = case when p_approve then null else left(p_reason, 300) end,
         reviewed_at = now(), reviewer_id = auth.uid(), id_path = null, selfie_path = null
   where id = p_request and status = 'pending'
   returning user_id into uid;
  if uid is null then raise exception 'request not found or already reviewed'; end if;
  if p_approve then
    update public.profiles set verified_at = now() where id = uid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reviews: parents review sitters after a real conversation; sitters may reply.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id           bigint generated always as identity primary key,
  sitter_id    uuid not null references public.sitters (id) on delete cascade,
  parent_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating       int not null check (rating between 1 and 5),
  body         text not null default '' check (char_length(body) <= 1000),
  sitter_reply text check (char_length(sitter_reply) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sitter_id, parent_id)
);

-- True when the caller (a parent) and the sitter have both written in a conversation.
create function public.can_review(p_sitter uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.parent_id = auth.uid() and c.sitter_id = p_sitter
      and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.parent_id)
      and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.sitter_id)
  );
$$;

create function public.reviews_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger reviews_before_update before update on public.reviews
  for each row execute function public.reviews_before_update();

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, insert (sitter_id, rating, body), update (rating, body), delete on public.reviews to authenticated;
create policy reviews_select on public.reviews for select to authenticated using (true);
create policy reviews_insert on public.reviews for insert to authenticated
  with check (parent_id = auth.uid() and public.can_review(sitter_id));
create policy reviews_update on public.reviews for update to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy reviews_delete on public.reviews for delete to authenticated
  using (parent_id = auth.uid() or public.is_admin());

create function public.reply_to_review(p_review bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reviews set sitter_reply = nullif(left(trim(p_body), 500), '')
   where id = p_review and sitter_id = auth.uid();
  if not found then raise exception 'review not found'; end if;
end $$;

-- A sitter's reviews with the reviewer's first name (profiles of parents are otherwise private).
create function public.sitter_reviews(p_sitter uuid) returns table (
  id bigint, parent_id uuid, parent_name text, parent_verified boolean, rating int, body text,
  sitter_reply text, created_at timestamptz, mine boolean
)
language sql stable security definer set search_path = public as $$
  select r.id, r.parent_id, p.display_name, p.verified_at is not null, r.rating, r.body,
         r.sitter_reply, r.created_at, r.parent_id = auth.uid()
  from public.reviews r join public.profiles p on p.id = r.parent_id
  where r.sitter_id = p_sitter and auth.uid() is not null
  order by r.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- Reports, readable by admins
-- ---------------------------------------------------------------------------
create function public.recent_reports() returns table (
  id bigint, reporter_name text, reported_id uuid, reported_name text, reason text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select r.id, a.display_name, r.reported_id, b.display_name, r.reason, r.created_at
    from public.reports r
    join public.profiles a on a.id = r.reporter_id
    join public.profiles b on b.id = r.reported_id
    order by r.created_at desc limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- Search and conversation list now include verification and ratings
-- ---------------------------------------------------------------------------
drop function public.nearby_sitters(double precision, double precision, double precision, int, boolean);
create function public.nearby_sitters(
  p_lat double precision, p_lng double precision,
  p_max_km double precision, p_max_price int, p_now_only boolean
) returns table (
  id uuid, display_name text, age int, bio text, hourly_price int, years_experience int,
  tags text[], available_text text, available_now boolean, lat double precision,
  lng double precision, distance_km double precision, my_verdict text,
  verified boolean, rating_avg numeric, rating_count int
)
language sql stable set search_path = public as $$
  select s.id, p.display_name, s.age, s.bio, s.hourly_price, s.years_experience, s.tags,
         s.available_text, coalesce(s.available_until > now(), false), s.lat, s.lng, d.km, sw.verdict,
         p.verified_at is not null, rv.avg, coalesce(rv.n, 0)
  from public.sitters s
  join public.profiles p on p.id = s.id
  cross join lateral (
    select 2 * 6371 * asin(sqrt(
      power(sin(radians(s.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
    )) as km
  ) d
  left join lateral (
    select round(avg(r.rating), 1) as avg, count(*)::int as n from public.reviews r where r.sitter_id = s.id
  ) rv on true
  left join public.swipes sw on sw.sitter_id = s.id and sw.parent_id = auth.uid()
  where s.is_active
    and s.id <> auth.uid()
    and d.km <= least(p_max_km, 50)
    and s.hourly_price <= p_max_price
    and (not p_now_only or s.available_until > now())
    and not public.is_blocked_between(auth.uid(), s.id)
  order by d.km
  limit 200;
$$;

drop function public.my_conversations();
create function public.my_conversations() returns table (
  id uuid, other_id uuid, other_name text, other_role public.user_role,
  last_body text, last_at timestamptz, last_from_me boolean, unread int, blocked boolean,
  other_verified boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, o.id, o.display_name, o.role, lm.body, lm.created_at, lm.sender_id = auth.uid(),
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > case when c.parent_id = auth.uid() then c.parent_last_read else c.sitter_last_read end),
         public.is_blocked_between(c.parent_id, c.sitter_id),
         o.verified_at is not null
  from public.conversations c
  join public.profiles o on o.id = case when c.parent_id = auth.uid() then c.sitter_id else c.parent_id end
  left join lateral (
    select m.body, m.created_at, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
  ) lm on true
  where auth.uid() in (c.parent_id, c.sitter_id)
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

revoke execute on function public.is_admin(), public.pending_verifications(),
  public.review_verification(bigint, boolean, text), public.can_review(uuid),
  public.reply_to_review(bigint, text), public.sitter_reviews(uuid), public.recent_reports(),
  public.nearby_sitters(double precision, double precision, double precision, int, boolean),
  public.my_conversations()
  from public, anon;
grant execute on function public.is_admin(), public.pending_verifications(),
  public.review_verification(bigint, boolean, text), public.can_review(uuid),
  public.reply_to_review(bigint, text), public.sitter_reviews(uuid), public.recent_reports(),
  public.nearby_sitters(double precision, double precision, double precision, int, boolean),
  public.my_conversations()
  to authenticated;
