-- Profile photos and richer profiles. Run after 0002_verification_reviews.sql.

alter table public.profiles
  add column avatar_path text,
  add column about text not null default '' check (char_length(about) <= 300),
  add column kids_text text not null default '' check (char_length(kids_text) <= 100);
alter table public.sitters
  add column occupation text not null default '' check (char_length(occupation) <= 60);

grant update (avatar_path, about, kids_text) on public.profiles to authenticated;
grant update (occupation) on public.sitters to authenticated;

-- The photo must live in the user's own folder of the avatars bucket.
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and (avatar_path is null or split_part(avatar_path, '/', 1) = auth.uid()::text));

-- Public bucket: photos are shown on cards. File names are random, so they cannot be guessed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy avatars_delete on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
-- Listing is only needed by the owner (to clean up old photos) and admins.
create policy avatars_select on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- Lets an admin take down an inappropriate photo. Returns the path so the caller can delete the file.
create function public.admin_clear_avatar(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  old text;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select avatar_path into old from public.profiles where id = p_user;
  update public.profiles set avatar_path = null where id = p_user;
  return old;
end $$;

-- Search and conversations now carry the photo and the extra profile text.
drop function public.nearby_sitters(double precision, double precision, double precision, int, boolean);
create function public.nearby_sitters(
  p_lat double precision, p_lng double precision,
  p_max_km double precision, p_max_price int, p_now_only boolean
) returns table (
  id uuid, display_name text, age int, bio text, hourly_price int, years_experience int,
  tags text[], available_text text, available_now boolean, lat double precision,
  lng double precision, distance_km double precision, my_verdict text,
  verified boolean, rating_avg numeric, rating_count int,
  avatar_path text, occupation text
)
language sql stable set search_path = public as $$
  select s.id, p.display_name, s.age, s.bio, s.hourly_price, s.years_experience, s.tags,
         s.available_text, coalesce(s.available_until > now(), false), s.lat, s.lng, d.km, sw.verdict,
         p.verified_at is not null, rv.avg, coalesce(rv.n, 0), p.avatar_path, s.occupation
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
  other_verified boolean, other_avatar text
)
language sql stable security definer set search_path = public as $$
  select c.id, o.id, o.display_name, o.role, lm.body, lm.created_at, lm.sender_id = auth.uid(),
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > case when c.parent_id = auth.uid() then c.parent_last_read else c.sitter_last_read end),
         public.is_blocked_between(c.parent_id, c.sitter_id),
         o.verified_at is not null, o.avatar_path
  from public.conversations c
  join public.profiles o on o.id = case when c.parent_id = auth.uid() then c.sitter_id else c.parent_id end
  left join lateral (
    select m.body, m.created_at, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
  ) lm on true
  where auth.uid() in (c.parent_id, c.sitter_id)
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

drop function public.sitter_reviews(uuid);
create function public.sitter_reviews(p_sitter uuid) returns table (
  id bigint, parent_id uuid, parent_name text, parent_verified boolean, rating int, body text,
  sitter_reply text, created_at timestamptz, mine boolean, parent_avatar text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.parent_id, p.display_name, p.verified_at is not null, r.rating, r.body,
         r.sitter_reply, r.created_at, r.parent_id = auth.uid(), p.avatar_path
  from public.reviews r join public.profiles p on p.id = r.parent_id
  where r.sitter_id = p_sitter and auth.uid() is not null
  order by r.created_at desc
  limit 200;
$$;

revoke execute on function public.admin_clear_avatar(uuid),
  public.nearby_sitters(double precision, double precision, double precision, int, boolean),
  public.my_conversations(), public.sitter_reviews(uuid)
  from public, anon;
grant execute on function public.admin_clear_avatar(uuid),
  public.nearby_sitters(double precision, double precision, double precision, int, boolean),
  public.my_conversations(), public.sitter_reviews(uuid)
  to authenticated;
