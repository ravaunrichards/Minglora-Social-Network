-- Merge duplicate Help Center articles without deleting the source article or its history.
-- Translation IDs remain stable, preserving feedback, bookmarks, views, and revision references.
create or replace function public.help_center_merge_articles(
  p_source_article_id uuid,
  p_target_article_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_slug text;
  target_slug text;
  moved_translations integer := 0;
begin
  if p_source_article_id is null or p_target_article_id is null
     or p_actor_id is null or p_source_article_id = p_target_article_id then
    raise exception 'Choose two different valid articles.' using errcode = '22023';
  end if;

  perform id
  from public.help_articles
  where id in (p_source_article_id, p_target_article_id)
  order by id
  for update;

  select slug into source_slug
  from public.help_articles
  where id = p_source_article_id and is_active = true;

  select slug into target_slug
  from public.help_articles
  where id = p_target_article_id and is_active = true;

  if source_slug is null or target_slug is null then
    raise exception 'Both source and destination articles must be active.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.help_article_translations source
    join public.help_article_translations target on target.locale = source.locale
    where source.article_id = p_source_article_id
      and target.article_id = p_target_article_id
  ) then
    raise exception 'Both articles contain at least one translation for the same language. Consolidate those answers manually before merging.' using errcode = '23505';
  end if;

  -- Redirect outgoing and incoming related-question edges to the canonical article.
  update public.help_related_articles relation
  set article_id = p_target_article_id
  where relation.article_id = p_source_article_id
    and relation.related_article_id <> p_target_article_id
    and not exists (
      select 1 from public.help_related_articles existing
      where existing.article_id = p_target_article_id
        and existing.related_article_id = relation.related_article_id
    );

  delete from public.help_related_articles
  where article_id = p_source_article_id;

  update public.help_related_articles relation
  set related_article_id = p_target_article_id
  where relation.related_article_id = p_source_article_id
    and relation.article_id <> p_target_article_id
    and not exists (
      select 1 from public.help_related_articles existing
      where existing.article_id = relation.article_id
        and existing.related_article_id = p_target_article_id
    );

  delete from public.help_related_articles
  where related_article_id = p_source_article_id
     or article_id = related_article_id;

  update public.help_article_translations
  set article_id = p_target_article_id
  where article_id = p_source_article_id;

  get diagnostics moved_translations = row_count;

  -- Keep the duplicate article as an inactive audit/history record.
  update public.help_articles
  set is_active = false,
      is_featured = false,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_source_article_id;

  update public.help_articles
  set updated_by = p_actor_id,
      updated_at = now()
  where id = p_target_article_id;

  return jsonb_build_object(
    'sourceArticleId', p_source_article_id,
    'targetArticleId', p_target_article_id,
    'archivedSlug', source_slug,
    'canonicalSlug', target_slug,
    'movedTranslations', moved_translations,
    'sourceRetainedAsInactive', true
  );
end;
$$;

revoke all on function public.help_center_merge_articles(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.help_center_merge_articles(uuid, uuid, uuid) to service_role;
