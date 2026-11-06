begin;
-- Only the owner can inspect auth.sessions. Expose a boolean, never session data.
-- Live Auth sessions are required, so a revoked refresh session cannot keep reading
-- comments using an otherwise unexpired JWT. Verify against the hosted Auth release.
create or replace function public.pcif_has_access()
returns boolean language sql stable security definer
set search_path = ''
as $$
 select exists (
  select 1 from public.pcif_comment_members m
  join auth.sessions s on s.user_id=m.user_id
  where m.user_id=auth.uid() and m.active
  and s.id::text=coalesce(auth.jwt()->>'session_id','')
 );
$$;
revoke all on function public.pcif_has_access() from public,anon;
grant execute on function public.pcif_has_access() to authenticated;
drop policy members_read_self on public.pcif_comment_members;
create policy members_read_self on public.pcif_comment_members for select to authenticated
 using (user_id=(select auth.uid()) and active and (select public.pcif_has_access()));
drop policy comments_read_members on public.pcif_comments;
create policy comments_read_members on public.pcif_comments for select to authenticated
 using ((select public.pcif_has_access()));
drop policy comments_insert_members on public.pcif_comments;
create policy comments_insert_members on public.pcif_comments for insert to authenticated
 with check (author_id=(select auth.uid()) and (select public.pcif_has_access()));
commit;
