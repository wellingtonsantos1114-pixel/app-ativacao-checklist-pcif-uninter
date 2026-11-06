begin;
-- Run as the project owner through the Supabase SQL Editor, never in React.
create table public.pcif_comment_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true
);
alter table public.pcif_comment_members enable row level security;
alter table public.pcif_comment_members force row level security;
revoke all on public.pcif_comment_members from public, anon, authenticated;
grant select on public.pcif_comment_members to authenticated;
create policy members_read_self on public.pcif_comment_members for select to authenticated
 using (user_id = (select auth.uid()) and active);

create table public.pcif_comments (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id),
 analyst_name text not null check (char_length(btrim(analyst_name)) between 1 and 120),
 team_id text check (team_id is null or team_id ~ '^GAR (0[1-9]|1[0-9]|2[0-3])$' or team_id ~ '^GAC 0[1-8]$'),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index pcif_comments_recent_idx on public.pcif_comments (created_at desc, id desc);
create index pcif_comments_team_recent_idx on public.pcif_comments (team_id, created_at desc, id desc);
alter table public.pcif_comments enable row level security;
alter table public.pcif_comments force row level security;
revoke all on public.pcif_comments from public, anon, authenticated;
grant select on public.pcif_comments to authenticated;
-- Column grants prevent overriding the identity, timestamp and ID via direct REST calls.
grant insert (analyst_name, team_id, body) on public.pcif_comments to authenticated;
create policy comments_read_members on public.pcif_comments for select to authenticated
 using ((select auth.uid()) is not null and exists (
  select 1 from public.pcif_comment_members m where m.user_id = (select auth.uid()) and m.active
 ));
create policy comments_insert_members on public.pcif_comments for insert to authenticated
 with check (author_id = (select auth.uid()) and exists (
  select 1 from public.pcif_comment_members m where m.user_id = (select auth.uid()) and m.active
 ));
-- Append-only: no UPDATE/DELETE grants or policies for authenticated users.
-- Realtime respects SELECT RLS; polling also remains available in the client.
do $$
begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
 and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pcif_comments') then
  alter publication supabase_realtime add table public.pcif_comments;
 end if;
end $$;
commit;
