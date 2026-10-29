-- BabySwipe schema: profiles, sitter listings, swipes, conversations, messages,
-- blocks and reports. Every table has row level security; clients only reach
-- data through the policies and functions below.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('parent', 'sitter');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role not null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- A sitter's public listing. lat/lng are snapped to a ~500 m grid by a trigger,
-- so a sitter's exact home location is never stored.
create table public.sitters (
  id               uuid primary key references public.profiles (id) on delete cascade,
  age              int check (age between 16 and 99),
  bio              text not null default '' check (char_length(bio) <= 500),
  hourly_price     int not null check (hourly_price between 20 and 300),
  years_experience int not null default 0 check (years_experience between 0 and 60),
  tags             text[] not null default '{}' check (cardinality(tags) <= 10),
  available_text   text not null default '' check (char_length(available_text) <= 60),
  available_until  timestamptz,
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  is_active        boolean not null default true,
  updated_at       timestamptz not null default now()
);

create function public.sitters_before_write() returns trigger
language plpgsql as $$
begin
  new.lat := round(new.lat * 200) / 200;
  new.lng := round(new.lng * 200) / 200;
  new.updated_at := now();
  return new;
end $$;

create trigger sitters_before_write
  before insert or update on public.sitters
  for each row execute function public.sitters_before_write();

-- ---------------------------------------------------------------------------
-- Swipes, blocks, reports
-- ---------------------------------------------------------------------------
create table public.swipes (
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  sitter_id  uuid not null references public.sitters (id) on delete cascade,
  verdict    text not null check (verdict in ('like', 'pass')),
  created_at timestamptz not null default now(),
  primary key (parent_id, sitter_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason      text not null check (char_length(trim(reason)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid not null references public.profiles (id) on delete cascade,
  sitter_id        uuid not null references public.sitters (id) on delete cascade,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  parent_last_read timestamptz not null default now(),
  sitter_last_read timestamptz not null default now(),
  unique (parent_id, sitter_id)
);

create table public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body            text not null check (char_length(trim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_created on public.messages (conversation_id, created_at);

create function public.is_participant(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and auth.uid() in (c.parent_id, c.sitter_id)
  );
$$;

create function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.sitters       enable row level security;
alter table public.swipes        enable row level security;
alter table public.blocks        enable row level security;
alter table public.reports       enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

revoke all on public.profiles, public.sitters, public.swipes, public.blocks,
  public.reports, public.conversations, public.messages from anon, authenticated;

-- profiles: your own; any sitter's (they are listed publicly to signed-in users);
-- and the other side of any conversation you are in.
grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or role = 'sitter'
  or exists (select 1 from public.conversations c
             where auth.uid() in (c.parent_id, c.sitter_id) and profiles.id in (c.parent_id, c.sitter_id))
);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- sitters: active listings are visible to signed-in users; only the sitter edits.
grant select, insert, delete on public.sitters to authenticated;
grant update (age, bio, hourly_price, years_experience, tags, available_text, available_until, lat, lng, is_active)
  on public.sitters to authenticated;
create policy sitters_select on public.sitters for select to authenticated
  using (is_active or id = auth.uid());
create policy sitters_insert on public.sitters for insert to authenticated with check (
  id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sitter')
);
create policy sitters_update on public.sitters for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy sitters_delete on public.sitters for delete to authenticated using (id = auth.uid());

-- swipes: private to the parent who made them.
-- Full-row update is granted because the client upserts; the policy still pins parent_id.
grant select, insert, update, delete on public.swipes to authenticated;
create policy swipes_own on public.swipes for all to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent'));

-- blocks: you see and manage only your own.
grant select, insert, delete on public.blocks to authenticated;
create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- reports: insert only. Reports are read by the team in the Supabase dashboard.
grant insert on public.reports to authenticated;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- conversations: participants read; created only through start_conversation().
grant select on public.conversations to authenticated;
create policy conversations_select on public.conversations for select to authenticated
  using (auth.uid() in (parent_id, sitter_id));

-- messages: participants read and write, unless either side blocked the other.
grant select, insert (conversation_id, body) on public.messages to authenticated;
create policy messages_select on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and public.is_participant(conversation_id)
  and not exists (
    select 1 from public.conversations c
    where c.id = conversation_id and public.is_blocked_between(c.parent_id, c.sitter_id)
  )
);

-- ---------------------------------------------------------------------------
-- Functions called by the app
-- ---------------------------------------------------------------------------

-- Sitters near a point, with the caller's own swipe verdict (null = not swiped yet).
create function public.nearby_sitters(
  p_lat double precision, p_lng double precision,
  p_max_km double precision, p_max_price int, p_now_only boolean
) returns table (
  id uuid, display_name text, age int, bio text, hourly_price int, years_experience int,
  tags text[], available_text text, available_now boolean, lat double precision,
  lng double precision, distance_km double precision, my_verdict text
)
language sql stable set search_path = public as $$
  select s.id, p.display_name, s.age, s.bio, s.hourly_price, s.years_experience, s.tags,
         s.available_text, coalesce(s.available_until > now(), false), s.lat, s.lng, d.km, sw.verdict
  from public.sitters s
  join public.profiles p on p.id = s.id
  cross join lateral (
    select 2 * 6371 * asin(sqrt(
      power(sin(radians(s.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
    )) as km
  ) d
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

-- Opens (or returns) the conversation between the calling parent and a sitter.
create function public.start_conversation(p_sitter uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'parent') then
    raise exception 'only parents can start a conversation';
  end if;
  if not exists (select 1 from public.sitters where id = p_sitter and is_active) then
    raise exception 'sitter not found';
  end if;
  if public.is_blocked_between(auth.uid(), p_sitter) then
    raise exception 'blocked';
  end if;
  insert into public.conversations (parent_id, sitter_id) values (auth.uid(), p_sitter)
    on conflict (parent_id, sitter_id) do nothing;
  select id into conv from public.conversations where parent_id = auth.uid() and sitter_id = p_sitter;
  return conv;
end $$;

-- The caller's conversations with the other side's name, last message and unread count.
create function public.my_conversations() returns table (
  id uuid, other_id uuid, other_name text, other_role public.user_role,
  last_body text, last_at timestamptz, last_from_me boolean, unread int, blocked boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, o.id, o.display_name, o.role, lm.body, lm.created_at, lm.sender_id = auth.uid(),
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > case when c.parent_id = auth.uid() then c.parent_last_read else c.sitter_last_read end),
         public.is_blocked_between(c.parent_id, c.sitter_id)
  from public.conversations c
  join public.profiles o on o.id = case when c.parent_id = auth.uid() then c.sitter_id else c.parent_id end
  left join lateral (
    select m.body, m.created_at, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
  ) lm on true
  where auth.uid() in (c.parent_id, c.sitter_id)
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

create function public.mark_read(p_conversation uuid) returns void
language sql security definer set search_path = public as $$
  update public.conversations set
    parent_last_read = case when parent_id = auth.uid() then now() else parent_last_read end,
    sitter_last_read = case when sitter_id = auth.uid() then now() else sitter_last_read end
  where id = p_conversation and auth.uid() in (parent_id, sitter_id);
$$;

-- Permanently deletes the caller's account and everything that cascades from it.
create function public.delete_my_account() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.is_blocked_between(uuid, uuid), public.is_participant(uuid),
  public.nearby_sitters(double precision, double precision, double precision, int, boolean),
  public.start_conversation(uuid), public.my_conversations(), public.mark_read(uuid),
  public.delete_my_account()
  from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid), public.is_participant(uuid),
  public.nearby_sitters(double precision, double precision, double precision, int, boolean),
  public.start_conversation(uuid), public.my_conversations(), public.mark_read(uuid),
  public.delete_my_account()
  to authenticated;

-- Live chat: stream new messages to participants (realtime applies the RLS above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
