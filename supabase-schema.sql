-- Sidequestio first Supabase schema.
-- Before running this, enable Auth > Sign In / Providers > Email in Supabase.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 18),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 72),
  description text not null default '' check (char_length(description) <= 280),
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'reported', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'unsafe', 'offensive', 'other')),
  created_at timestamptz not null default now(),
  unique (idea_id, reporter_user_id)
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  event_type text not null check (event_type in ('hidden_for_review')),
  report_count int not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.hide_idea_after_report_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_total int;
  hidden_idea_id uuid;
begin
  select count(*)::int into report_total
  from public.reports
  where idea_id = new.idea_id;

  if report_total >= 3 then
    update public.ideas
    set status = 'hidden', updated_at = now()
    where id = new.idea_id and status = 'active'
    returning id into hidden_idea_id;

    if hidden_idea_id is not null then
      insert into public.moderation_events (idea_id, event_type, report_count)
      values (hidden_idea_id, 'hidden_for_review', report_total);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists hide_idea_after_report_threshold on public.reports;
create trigger hide_idea_after_report_threshold
  after insert on public.reports
  for each row execute function public.hide_idea_after_report_threshold();

-- Drop the old view before recreating it because Postgres cannot insert new
-- columns into the middle of an existing view with CREATE OR REPLACE VIEW.
drop view if exists public.ideas_with_counts;

create view public.ideas_with_counts
with (security_invoker = true) as
select
  i.id,
  i.user_id,
  i.title,
  i.description,
  i.tags,
  i.status,
  i.created_at,
  i.updated_at,
  coalesce(p.display_name, 'guest') as author_name,
  (i.user_id = auth.uid()) as is_mine,
  count(v.id) filter (where v.vote = 'yes')::int as yes_count,
  count(v.id) filter (where v.vote = 'no')::int as no_count,
  (count(v.id) filter (where v.vote = 'yes') - count(v.id) filter (where v.vote = 'no'))::int as hot_score,
  abs(50 - coalesce(round((count(v.id) filter (where v.vote = 'yes')) * 100.0 / nullif(count(v.id), 0)), 50))::int as debate_score
from public.ideas i
left join public.votes v on v.idea_id = i.id
left join public.profiles p on p.id = i.user_id
where i.status = 'active'
group by i.id, p.display_name;

alter table public.profiles enable row level security;
alter table public.ideas enable row level security;
alter table public.votes enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_events enable row level security;

grant select on public.ideas_with_counts to anon, authenticated;
grant select, insert, update on public.profiles to anon, authenticated;
grant select, insert, update on public.ideas to anon, authenticated;
grant select, insert, update, delete on public.votes to anon, authenticated;
grant select, insert on public.reports to anon, authenticated;

drop policy if exists "Anyone can read profiles" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Anyone can read active ideas" on public.ideas;
drop policy if exists "Anonymous users can create ideas" on public.ideas;
drop policy if exists "Logged-in users can create ideas" on public.ideas;
drop policy if exists "Authors can update their own ideas" on public.ideas;
drop policy if exists "Anyone can read votes" on public.votes;
drop policy if exists "Users can create their own votes" on public.votes;
drop policy if exists "Users can update their own votes" on public.votes;
drop policy if exists "Users can delete their own votes" on public.votes;
drop policy if exists "Users can read their own reports" on public.reports;
drop policy if exists "Users can report active ideas they did not write" on public.reports;

create policy "Anyone can read profiles" on public.profiles
  for select using (true);

create policy "Users can create their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Anyone can read active ideas" on public.ideas
  for select using (status = 'active');

create policy "Logged-in users can create ideas" on public.ideas
  for insert with check (auth.uid() = user_id);

create policy "Authors can update their own ideas" on public.ideas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Anyone can read votes" on public.votes
  for select using (true);

create policy "Users can create their own votes" on public.votes
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own votes" on public.votes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own votes" on public.votes
  for delete using (auth.uid() = user_id);

create policy "Users can read their own reports" on public.reports
  for select using (auth.uid() = reporter_user_id);

create policy "Users can report active ideas they did not write" on public.reports
  for insert with check (
    auth.uid() = reporter_user_id
    and exists (
      select 1 from public.ideas
      where ideas.id = reports.idea_id
        and ideas.status = 'active'
        and ideas.user_id <> auth.uid()
    )
  );

