-- Keep category directories predictably ordered while preserving relevance for non-empty searches.
create or replace function public.help_center_search(
 p_query text default '',p_locale text default 'en',p_category_slug text default null,
 p_subcategory_slug text default null,p_limit integer default 20,p_offset integer default 0
)
returns table(article_id uuid,translation_id uuid,article_slug text,category_slug text,category_title text,
 subcategory_slug text,subcategory_title text,question text,excerpt text,updated_at timestamptz,search_rank real)
language sql stable security invoker set search_path=public as $$
 with qi as(select nullif(trim(coalesce(p_query,'')),'') q)
 select a.id,t.id,a.slug,c.slug,coalesce(ct.title,c.slug),s.slug,coalesce(st.title,s.slug),t.title,
  coalesce(nullif(t.excerpt,''),left(regexp_replace(t.answer_markdown,E'\\s+',' ','g'),220)),
  t.updated_at,
  case when qi.q is null then 0::real else
    ts_rank_cd(t.search_document,websearch_to_tsquery('english',qi.q)) +
    case when ct.title ilike '%'||qi.q||'%' then 0.35::real else 0::real end +
    case when st.title ilike '%'||qi.q||'%' then 0.25::real else 0::real end
  end
 from public.help_article_translations t
 join public.help_articles a on a.id=t.article_id and a.is_active
 join public.help_categories c on c.id=a.category_id and c.is_active
 left join public.help_subcategories s on s.id=a.subcategory_id and s.is_active
 left join public.help_category_translations ct on ct.category_id=c.id and ct.locale=p_locale and ct.translation_status='published'
 left join public.help_subcategory_translations st on st.subcategory_id=s.id and st.locale=p_locale and st.translation_status='published'
 cross join qi
 where t.status='published' and (t.locale=p_locale or (p_locale<>'en' and t.locale='en'))
  and (p_category_slug is null or c.slug=p_category_slug)
  and (p_subcategory_slug is null or s.slug=p_subcategory_slug)
  and (
    qi.q is null
    or t.search_document@@websearch_to_tsquery('english',qi.q)
    or t.title ilike '%'||qi.q||'%'
    or exists(select 1 from public.help_keywords k where k.translation_id=t.id and k.keyword ilike '%'||qi.q||'%')
    or ct.title ilike '%'||qi.q||'%'
    or ct.description ilike '%'||qi.q||'%'
    or st.title ilike '%'||qi.q||'%'
    or st.description ilike '%'||qi.q||'%'
    or c.slug ilike '%'||qi.q||'%'
    or s.slug ilike '%'||qi.q||'%'
    or exists(select 1 from unnest(regexp_split_to_array(qi.q,E'\\s+')) term
      where length(term)>=3 and (
        t.search_document@@plainto_tsquery('english',term)
        or ct.title ilike '%'||term||'%'
        or st.title ilike '%'||term||'%'
        or c.slug ilike '%'||term||'%'
        or s.slug ilike '%'||term||'%'
      ))
  )
 order by
  case when qi.q is null then a.sort_order else 0 end asc,
  case when qi.q is null then 0 else
    ts_rank_cd(t.search_document,websearch_to_tsquery('english',qi.q)) +
    case when ct.title ilike '%'||qi.q||'%' then 0.35::real else 0::real end +
    case when st.title ilike '%'||qi.q||'%' then 0.25::real else 0::real end
  end desc,
  a.is_featured desc,t.updated_at desc
 limit greatest(1,least(coalesce(p_limit,20),50)) offset greatest(0,coalesce(p_offset,0));
$$;
