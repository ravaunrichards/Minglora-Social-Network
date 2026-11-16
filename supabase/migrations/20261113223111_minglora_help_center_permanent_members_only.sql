
-- Feedback and saved answers are member-only. Supabase anonymous users also use
-- the authenticated Postgres role, so add restrictive JWT-claim guards.
create policy help_article_feedback_permanent_member_guard
on public.help_article_feedback as restrictive
for all to authenticated
using ((select (auth.jwt()->>'is_anonymous')::boolean) is false)
with check ((select (auth.jwt()->>'is_anonymous')::boolean) is false);

create policy help_user_bookmarks_permanent_member_guard
on public.help_user_bookmarks as restrictive
for all to authenticated
using ((select (auth.jwt()->>'is_anonymous')::boolean) is false)
with check ((select (auth.jwt()->>'is_anonymous')::boolean) is false);
