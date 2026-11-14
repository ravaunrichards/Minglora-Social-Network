
-- Additional foreign-key indexes, internal analytics RLS and verified popularity query.

create index if not exists help_articles_subcategory_idx on public.help_articles(subcategory_id);
create index if not exists help_articles_created_by_idx on public.help_articles(created_by);
create index if not exists help_articles_updated_by_idx on public.help_articles(updated_by);
create index if not exists help_article_translations_approved_by_idx on public.help_article_translations(approved_by);
create index if not exists help_article_translations_created_by_idx on public.help_article_translations(created_by);
create index if not exists help_article_translations_updated_by_idx on public.help_article_translations(updated_by);
create index if not exists help_related_articles_related_article_idx on public.help_related_articles(related_article_id);
create index if not exists help_article_feedback_user_idx on public.help_article_feedback(user_id);
create index if not exists help_article_revisions_created_by_idx on public.help_article_revisions(created_by);
create index if not exists help_user_bookmarks_translation_idx on public.help_user_bookmarks(translation_id);
create index if not exists help_article_views_user_idx on public.help_article_views(user_id);

do $$
declare table_name text;
begin
 foreach table_name in array array['help_keywords','help_related_articles','help_article_revisions','help_article_views','help_search_events'] loop
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=table_name and policyname=table_name||'_service_role_all') then
   execute format('create policy %I on public.%I for all to service_role using(true) with check(true)',table_name||'_service_role_all',table_name);
  end if;
 end loop;
end $$;

create or replace function public.help_center_popular(p_locale text default 'en',p_limit integer default 10)
returns table(translation_id uuid,article_id uuid,article_slug text,question text,excerpt text,
 category_slug text,category_title text,view_count bigint)
language sql stable security invoker set search_path=public as $$
 select t.id,a.id,a.slug,t.title,t.excerpt,c.slug,coalesce(ct.title,c.slug),sum(v.view_count)::bigint
 from public.help_article_views v
 join public.help_article_translations t on t.id=v.translation_id and t.status='published'
 join public.help_articles a on a.id=t.article_id and a.is_active
 join public.help_categories c on c.id=a.category_id and c.is_active
 left join public.help_category_translations ct on ct.category_id=c.id
  and ct.locale=p_locale and ct.translation_status='published'
 where t.locale=p_locale
 group by t.id,a.id,a.slug,t.title,t.excerpt,c.slug,ct.title
 order by sum(v.view_count) desc,t.updated_at desc
 limit greatest(1,least(coalesce(p_limit,10),20));
$$;
revoke all on function public.help_center_popular(text,integer) from public,anon,authenticated;
grant execute on function public.help_center_popular(text,integer) to service_role;
