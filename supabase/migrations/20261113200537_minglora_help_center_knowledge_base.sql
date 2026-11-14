
-- Minglora Help Center knowledge base foundation.
-- Additive schema only: existing Minglora support ticket tables and records are untouched.

create table if not exists public.help_categories (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 icon_key text not null default 'request',
 sort_order integer not null default 0,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint help_categories_slug_format check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create table if not exists public.help_category_translations (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.help_categories(id) on delete cascade,
 locale text not null default 'en',
 title text not null,
 description text not null default '',
 translation_status text not null default 'published'
   check(translation_status in ('draft','review','fact_check','approved','published','archived')),
 updated_at timestamptz not null default now(),
 unique(category_id,locale)
);
create table if not exists public.help_subcategories (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.help_categories(id) on delete cascade,
 slug text not null,
 sort_order integer not null default 0,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(category_id,slug),
 constraint help_subcategories_slug_format check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create table if not exists public.help_subcategory_translations (
 id uuid primary key default gen_random_uuid(),
 subcategory_id uuid not null references public.help_subcategories(id) on delete cascade,
 locale text not null default 'en',
 title text not null,
 description text not null default '',
 translation_status text not null default 'published'
   check(translation_status in ('draft','review','fact_check','approved','published','archived')),
 updated_at timestamptz not null default now(),
 unique(subcategory_id,locale)
);
create table if not exists public.help_articles (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.help_categories(id) on delete restrict,
 subcategory_id uuid references public.help_subcategories(id) on delete set null,
 slug text not null unique,
 is_featured boolean not null default false,
 is_active boolean not null default true,
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint help_articles_slug_format check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create table if not exists public.help_article_translations (
 id uuid primary key default gen_random_uuid(),
 article_id uuid not null references public.help_articles(id) on delete cascade,
 locale text not null default 'en',
 title text not null,
 excerpt text not null default '',
 answer_markdown text not null default '',
 search_terms text[] not null default '{}',
 search_document tsvector not null default ''::tsvector,
 status text not null default 'draft'
   check(status in ('draft','review','fact_check','approved','published','archived')),
 source_reference text not null default '',
 source_verified_at timestamptz,
 last_reviewed_at timestamptz,
 approved_by uuid references auth.users(id) on delete set null,
 published_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(article_id,locale)
);
create table if not exists public.help_keywords (
 id uuid primary key default gen_random_uuid(),
 translation_id uuid not null references public.help_article_translations(id) on delete cascade,
 keyword text not null,
 created_at timestamptz not null default now(),
 unique(translation_id,keyword)
);
create table if not exists public.help_related_articles (
 article_id uuid not null references public.help_articles(id) on delete cascade,
 related_article_id uuid not null references public.help_articles(id) on delete cascade,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 primary key(article_id,related_article_id),
 constraint help_related_articles_not_self check(article_id<>related_article_id)
);
create table if not exists public.help_article_feedback (
 id uuid primary key default gen_random_uuid(),
 translation_id uuid not null references public.help_article_translations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 helpful boolean not null,
 note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(translation_id,user_id),
 constraint help_article_feedback_note_length check(char_length(note)<=1000)
);
create table if not exists public.help_article_revisions (
 id uuid primary key default gen_random_uuid(),
 translation_id uuid not null references public.help_article_translations(id) on delete cascade,
 revision_number integer not null,
 snapshot jsonb not null,
 change_note text not null default '',
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(translation_id,revision_number)
);
create table if not exists public.help_user_bookmarks (
 user_id uuid not null references auth.users(id) on delete cascade,
 translation_id uuid not null references public.help_article_translations(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,translation_id)
);
create table if not exists public.help_article_views (
 translation_id uuid not null references public.help_article_translations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 view_date date not null default current_date,
 view_count integer not null default 1 check(view_count>0),
 last_viewed_at timestamptz not null default now(),
 primary key(translation_id,user_id,view_date)
);
create table if not exists public.help_search_events (
 query_hash text primary key,
 query_normalized text not null,
 result_count integer not null default 0 check(result_count>=0),
 search_count bigint not null default 1 check(search_count>0),
 last_searched_at timestamptz not null default now()
);

-- Store full-text search as a trigger-maintained tsvector so the index expression
-- remains compatible with PostgreSQL immutability requirements.
create or replace function public.help_article_translation_search_sync()
returns trigger language plpgsql set search_path=public as $$
begin
 new.search_document :=
   setweight(to_tsvector('english',coalesce(new.title,'')),'A') ||
   setweight(to_tsvector('english',coalesce(new.excerpt,'')),'B') ||
   setweight(to_tsvector('english',coalesce(new.answer_markdown,'')),'C') ||
   setweight(to_tsvector('english',coalesce(array_to_string(new.search_terms,' '),'')),'A');
 return new;
end;
$$;
drop trigger if exists help_article_translation_search_sync on public.help_article_translations;
create trigger help_article_translation_search_sync
before insert or update of title,excerpt,answer_markdown,search_terms
on public.help_article_translations for each row
execute function public.help_article_translation_search_sync();

create index if not exists help_subcategories_category_order_idx on public.help_subcategories(category_id,sort_order) where is_active;
create index if not exists help_articles_category_subcategory_idx on public.help_articles(category_id,subcategory_id,sort_order) where is_active;
create index if not exists help_article_translations_published_locale_idx on public.help_article_translations(locale,updated_at desc) where status='published';
create index if not exists help_article_translations_search_idx on public.help_article_translations using gin(search_document);
create index if not exists help_article_views_popularity_idx on public.help_article_views(translation_id,last_viewed_at desc);
create index if not exists help_article_feedback_article_idx on public.help_article_feedback(translation_id,helpful);
create index if not exists help_article_revisions_history_idx on public.help_article_revisions(translation_id,revision_number desc);

alter table public.help_categories enable row level security;
alter table public.help_category_translations enable row level security;
alter table public.help_subcategories enable row level security;
alter table public.help_subcategory_translations enable row level security;
alter table public.help_articles enable row level security;
alter table public.help_article_translations enable row level security;
alter table public.help_keywords enable row level security;
alter table public.help_related_articles enable row level security;
alter table public.help_article_feedback enable row level security;
alter table public.help_article_revisions enable row level security;
alter table public.help_user_bookmarks enable row level security;
alter table public.help_article_views enable row level security;
alter table public.help_search_events enable row level security;

revoke all on public.help_categories,public.help_category_translations,public.help_subcategories,public.help_subcategory_translations,
 public.help_articles,public.help_article_translations,public.help_keywords,public.help_related_articles,
 public.help_article_feedback,public.help_article_revisions,public.help_user_bookmarks,public.help_article_views,public.help_search_events
 from anon,authenticated;
grant select on public.help_categories,public.help_category_translations,public.help_subcategories,public.help_subcategory_translations,
 public.help_articles,public.help_article_translations to anon,authenticated;
grant select,insert,update,delete on public.help_article_feedback,public.help_user_bookmarks to authenticated;
grant all on public.help_categories,public.help_category_translations,public.help_subcategories,public.help_subcategory_translations,
 public.help_articles,public.help_article_translations,public.help_keywords,public.help_related_articles,
 public.help_article_feedback,public.help_article_revisions,public.help_user_bookmarks,public.help_article_views,public.help_search_events
 to service_role;

create policy help_categories_public_read on public.help_categories for select to anon,authenticated using(is_active);
create policy help_category_translations_public_read on public.help_category_translations for select to anon,authenticated
 using(translation_status='published' and exists(select 1 from public.help_categories c where c.id=category_id and c.is_active));
create policy help_subcategories_public_read on public.help_subcategories for select to anon,authenticated
 using(is_active and exists(select 1 from public.help_categories c where c.id=category_id and c.is_active));
create policy help_subcategory_translations_public_read on public.help_subcategory_translations for select to anon,authenticated
 using(translation_status='published' and exists(select 1 from public.help_subcategories s
 join public.help_categories c on c.id=s.category_id where s.id=subcategory_id and s.is_active and c.is_active));
create policy help_articles_public_read on public.help_articles for select to anon,authenticated
 using(is_active and exists(select 1 from public.help_article_translations t
 join public.help_categories c on c.id=help_articles.category_id and c.is_active
 where t.article_id=help_articles.id and t.status='published'));
create policy help_article_translations_public_read on public.help_article_translations for select to anon,authenticated
 using(status='published' and exists(select 1 from public.help_articles a
 join public.help_categories c on c.id=a.category_id and c.is_active where a.id=article_id and a.is_active));
create policy help_article_feedback_owner_read on public.help_article_feedback for select to authenticated
 using((select auth.uid())=user_id);
create policy help_article_feedback_owner_insert on public.help_article_feedback for insert to authenticated
 with check((select auth.uid())=user_id and exists(select 1 from public.help_article_translations t where t.id=translation_id and t.status='published'));
create policy help_article_feedback_owner_update on public.help_article_feedback for update to authenticated
 using((select auth.uid())=user_id)
 with check((select auth.uid())=user_id and exists(select 1 from public.help_article_translations t where t.id=translation_id and t.status='published'));
create policy help_article_bookmarks_owner_read on public.help_user_bookmarks for select to authenticated
 using((select auth.uid())=user_id);
create policy help_article_bookmarks_owner_insert on public.help_user_bookmarks for insert to authenticated
 with check((select auth.uid())=user_id and exists(select 1 from public.help_article_translations t where t.id=translation_id and t.status='published'));
create policy help_article_bookmarks_owner_delete on public.help_user_bookmarks for delete to authenticated
 using((select auth.uid())=user_id);

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
  case when qi.q is null then 0::real else ts_rank_cd(t.search_document,websearch_to_tsquery('english',qi.q)) end
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
  and (qi.q is null or t.search_document@@websearch_to_tsquery('english',qi.q)
    or t.title ilike '%'||qi.q||'%'
    or exists(select 1 from public.help_keywords k where k.translation_id=t.id and k.keyword ilike '%'||qi.q||'%')
    or exists(select 1 from unnest(regexp_split_to_array(qi.q,E'\\s+')) term
      where length(term)>=3 and t.search_document@@plainto_tsquery('english',term)))
 order by case when qi.q is null then 0 else ts_rank_cd(t.search_document,websearch_to_tsquery('english',qi.q)) end desc,
  a.is_featured desc,t.updated_at desc
 limit greatest(1,least(coalesce(p_limit,20),50)) offset greatest(0,coalesce(p_offset,0));
$$;

create or replace function public.help_center_record_view(p_translation_id uuid,p_user_id uuid)
returns void language sql security invoker set search_path=public as $$
 insert into public.help_article_views(translation_id,user_id,view_date,view_count,last_viewed_at)
 select t.id,p_user_id,current_date,1,now()
 from public.help_article_translations t join public.help_articles a on a.id=t.article_id and a.is_active
 join public.help_categories c on c.id=a.category_id and c.is_active
 where t.id=p_translation_id and t.status='published'
 on conflict(translation_id,user_id,view_date) do update
 set view_count=public.help_article_views.view_count+1,last_viewed_at=now();
$$;

create or replace function public.help_center_record_search(p_query text,p_result_count integer)
returns void language sql security invoker set search_path=public as $$
 insert into public.help_search_events(query_hash,query_normalized,result_count,search_count,last_searched_at)
 select md5(lower(trim(p_query))),lower(trim(regexp_replace(p_query,E'\\s+',' ','g'))),
  greatest(0,coalesce(p_result_count,0)),1,now()
 where length(trim(coalesce(p_query,''))) between 2 and 80
  and p_query !~* '@' and length(regexp_replace(p_query,'[^0-9]','','g'))<7
 on conflict(query_hash) do update set result_count=excluded.result_count,
  search_count=public.help_search_events.search_count+1,last_searched_at=now();
$$;

revoke all on function public.help_center_search(text,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.help_center_record_view(uuid,uuid) from public,anon,authenticated;
revoke all on function public.help_center_record_search(text,integer) from public,anon,authenticated;
grant execute on function public.help_center_search(text,text,text,text,integer,integer) to service_role;
grant execute on function public.help_center_record_view(uuid,uuid) to service_role;
grant execute on function public.help_center_record_search(text,integer) to service_role;

insert into public.help_categories(slug,icon_key,sort_order) values
('getting-started','home',1),('accounts-registration','profile',2),('passwords-security','lock',3),
('profiles-personalization','profile',4),('friends-followers','friends',5),('home-feed-posts','home',6),
('photos-albums','photo',7),('videos-reels-stories','video',8),('messenger','messages',9),
('voice-video-calls','call',10),('groups-pages','groups',11),('live-streaming','live',12),
('creator-features','creator',13),('gifts-coins','gift',14),('creator-earnings-payouts','coins',15),
('meetwave','meetwave',16),('notifications-activity','activity',17),('privacy-permissions','privacy',18),
('safety-reporting','request',19),('settings-accessibility','settings',20),('troubleshooting','search',21),
('rules-policies-information','lock',22)
on conflict(slug) do nothing;

insert into public.help_category_translations(category_id,locale,title,description,translation_status)
select c.id,'en',v.title,v.description,'published'
from (values
('getting-started','Getting Started','Learn about Minglora, the home screen, navigation and first steps.'),
('accounts-registration','Accounts & Registration','Creating, signing in to and managing a Minglora account.'),
('passwords-security','Passwords & Security','Password changes, account recovery, login checks and protecting your account.'),
('profiles-personalization','Profiles & Personalization','Profile information, photos, visibility and personal settings.'),
('friends-followers','Friends & Followers','Following, followers, mutual follows, friendships and blocks.'),
('home-feed-posts','Home Feed & Posts','Using the feed and creating, editing, sharing and managing posts.'),
('photos-albums','Photos & Albums','Uploading, organizing, editing and protecting photographs and albums.'),
('videos-reels-stories','Videos, Reels & Stories','Video posts, Reels, Stories, highlights and video discovery.'),
('messenger','Messenger & Private Messaging','Private and group conversations, attachments and voice messages.'),
('voice-video-calls','Voice & Video Calls','Calling controls, permissions, privacy and connection support.'),
('groups-pages','Groups & Pages','Creating and managing groups, Pages and communities.'),
('live-streaming','Minglora LIVE','Broadcasting, viewing, moderation, LIVE tools and gifts.'),
('creator-features','Creator Features','Creator Studio, Creator Hub, analytics and creator tools.'),
('gifts-coins','Gifts & Coins','Minglora Coins, wallet activity, gifts, rewards and badges.'),
('creator-earnings-payouts','Creator Earnings & Payouts','Eligible earnings, revenue sharing, payouts and transaction records.'),
('meetwave','MeetWave Meetings','Meeting rooms, invitations, layouts, permissions and troubleshooting.'),
('notifications-activity','Notifications & Activity','Notification preferences, Activity Center and Activity Log.'),
('privacy-permissions','Privacy & Permissions','Privacy choices, audience controls, device permissions and personal data.'),
('safety-reporting','Safety & Reporting','Community safety, reports, restrictions, moderation and appeals.'),
('settings-accessibility','Settings & Accessibility','Appearance, language, themes, accessibility and preferences.'),
('troubleshooting','Troubleshooting','Help diagnosing errors, performance, device, browser and connection problems.'),
('rules-policies-information','Rules, Policies & Information','Minglora rules, policies, legal information and contact details.')
) v(slug,title,description) join public.help_categories c on c.slug=v.slug
on conflict(category_id,locale) do nothing;

insert into public.help_subcategories(category_id,slug,sort_order)
select c.id,v.slug,v.sort_order from (values
('getting-started','introduction-to-minglora',1),
('getting-started','creating-your-first-account',2),
('getting-started','getting-started-guidance',3),
('getting-started','home-screen',4),
('getting-started','navigation-and-main-menus',5),
('getting-started','understanding-features',6),
('getting-started','first-time-user-guidance',7),
('accounts-registration','creating-an-account',1),
('accounts-registration','registration-requirements',2),
('accounts-registration','email-addresses',3),
('accounts-registration','phone-numbers',4),
('accounts-registration','signing-in',5),
('accounts-registration','multiple-device-access',6),
('accounts-registration','account-information',7),
('accounts-registration','changing-account-details',8),
('accounts-registration','account-management',9),
('accounts-registration','deactivation-and-deletion',10),
('passwords-security','creating-secure-passwords',1),
('passwords-security','changing-passwords',2),
('passwords-security','forgotten-passwords',3),
('passwords-security','account-recovery',4),
('passwords-security','two-factor-authentication',5),
('passwords-security','login-verification',6),
('passwords-security','active-sessions',7),
('passwords-security','device-management',8),
('passwords-security','suspicious-login-activity',9),
('passwords-security','account-protection',10),
('profiles-personalization','creating-a-profile',1),
('profiles-personalization','editing-profile-information',2),
('profiles-personalization','profile-pictures',3),
('profiles-personalization','cover-photos',4),
('profiles-personalization','personal-introduction-and-details',5),
('profiles-personalization','work-and-education',6),
('profiles-personalization','hobbies-and-interests',7),
('profiles-personalization','travel-information',8),
('profiles-personalization','website-and-social-links',9),
('profiles-personalization','contact-information',10),
('profiles-personalization','profile-visibility',11),
('profiles-personalization','profile-layouts-and-themes',12),
('profiles-personalization','profile-customization',13),
('friends-followers','following-and-unfollowing',1),
('friends-followers','followers-and-following-lists',2),
('friends-followers','mutual-follows-and-friends',3),
('friends-followers','friend-lists',4),
('friends-followers','removing-friends',5),
('friends-followers','blocking-and-connection-management',6),
('home-feed-posts','understanding-the-home-feed',1),
('home-feed-posts','creating-posts',2),
('home-feed-posts','editing-and-deleting-posts',3),
('home-feed-posts','post-visibility-and-audiences',4),
('home-feed-posts','reactions-and-comments',5),
('home-feed-posts','sharing-and-saving-posts',6),
('home-feed-posts','managing-and-reporting-posts',7),
('photos-albums','uploading-and-taking-photos',1),
('photos-albums','selecting-photographs',2),
('photos-albums','creating-and-editing-albums',3),
('photos-albums','organizing-galleries',4),
('photos-albums','deleting-photographs',5),
('photos-albums','profile-and-cover-uploads',6),
('photos-albums','photo-privacy-quality-and-cropping',7),
('videos-reels-stories','uploading-videos',1),
('videos-reels-stories','creating-and-publishing-reels',2),
('videos-reels-stories','watching-reels-and-video-centre',3),
('videos-reels-stories','creating-and-viewing-stories',4),
('videos-reels-stories','story-privacy-highlights-and-archives',5),
('videos-reels-stories','video-playback-and-management',6),
('messenger','opening-messenger',1),
('messenger','sending-and-receiving-messages',2),
('messenger','private-and-group-conversations',3),
('messenger','voice-messages',4),
('messenger','photos-and-attachments',5),
('messenger','stickers-gifs-and-emojis',6),
('messenger','editing-and-deleting-messages',7),
('messenger','removing-conversations',8),
('messenger','message-notifications',9),
('messenger','calling-from-messenger',10),
('voice-video-calls','making-and-receiving-voice-calls',1),
('voice-video-calls','making-and-receiving-video-calls',2),
('voice-video-calls','camera-and-microphone-permissions',3),
('voice-video-calls','call-controls-and-notifications',4),
('voice-video-calls','call-connection-problems',5),
('voice-video-calls','ending-and-managing-sessions',6),
('voice-video-calls','call-privacy',7),
('groups-pages','creating-joining-and-leaving-groups',1),
('groups-pages','group-administrators-and-moderators',2),
('groups-pages','group-permissions-and-membership',3),
('groups-pages','group-posts-and-discussions',4),
('groups-pages','creating-and-managing-pages',5),
('groups-pages','page-visibility-and-roles',6),
('groups-pages','community-management',7),
('live-streaming','understanding-minglora-live',1),
('live-streaming','starting-and-ending-a-live',2),
('live-streaming','live-host-controls-and-guests',3),
('live-streaming','joining-and-watching-live',4),
('live-streaming','live-audience-and-privacy',5),
('live-streaming','audio-only-and-video-live',6),
('live-streaming','live-comments-and-moderation',7),
('live-streaming','live-gifts-and-coins',8),
('live-streaming','live-notifications-and-connection',9),
('live-streaming','live-creator-tools',10),
('creator-features','creator-accounts-and-profiles',1),
('creator-features','creator-studio',2),
('creator-features','creator-dashboards-and-analytics',3),
('creator-features','creator-tools-and-content',4),
('creator-features','audience-and-communities',5),
('creator-features','creator-hub-and-network',6),
('creator-features','creator-eligibility-and-support',7),
('gifts-coins','understanding-minglora-coins-and-wallet',1),
('gifts-coins','purchasing-coins-and-balances',2),
('gifts-coins','sending-and-receiving-gifts',3),
('gifts-coins','virtual-gift-values-and-history',4),
('gifts-coins','gift-transactions-and-problems',5),
('gifts-coins','refunds-and-coin-security',6),
('gifts-coins','rewards-and-badges',7),
('creator-earnings-payouts','understanding-creator-earnings',1),
('creator-earnings-payouts','eligible-revenue-and-revenue-sharing',2),
('creator-earnings-payouts','earnings-statements-and-history',3),
('creator-earnings-payouts','payout-eligibility',4),
('creator-earnings-payouts','payment-methods-and-details',5),
('creator-earnings-payouts','payout-requests-and-failed-payouts',6),
('creator-earnings-payouts','payment-verification-and-transactions',7),
('creator-earnings-payouts','tax-and-financial-information',8),
('meetwave','introduction-to-meetwave',1),
('meetwave','creating-and-joining-meetings',2),
('meetwave','invitations-and-meeting-links',3),
('meetwave','hosts-guests-and-permissions',4),
('meetwave','audio-and-video-controls',5),
('meetwave','fluid-panel-layout',6),
('meetwave','fluid-grid-layout',7),
('meetwave','fixed-grid-layout',8),
('meetwave','fixed-panel-layout',9),
('meetwave','side-by-side-layout',10),
('meetwave','spotlight-layout',11),
('meetwave','roundtable-one-and-two-layouts',12),
('meetwave','fullscreen-and-screen-layouts',13),
('meetwave','meeting-privacy-and-troubleshooting',14),
('notifications-activity','understanding-notifications',1),
('notifications-activity','managing-notifications-and-preferences',2),
('notifications-activity','push-notifications-and-history',3),
('notifications-activity','activity-centre',4),
('notifications-activity','activity-log-and-management',5),
('notifications-activity','notification-troubleshooting',6),
('privacy-permissions','privacy-settings-and-profile-visibility',1),
('privacy-permissions','post-audiences-and-friend-privacy',2),
('privacy-permissions','follower-and-connection-privacy',3),
('privacy-permissions','blocking-and-restricted-accounts',4),
('privacy-permissions','messaging-privacy',5),
('privacy-permissions','location-camera-and-microphone-permissions',6),
('privacy-permissions','data-privacy-and-personal-information',7),
('safety-reporting','community-standards-and-content-guidelines',1),
('safety-reporting','reporting-members-and-content',2),
('safety-reporting','harassment-and-bullying',3),
('safety-reporting','scams-and-suspicious-links',4),
('safety-reporting','impersonation-and-copyright',5),
('safety-reporting','account-restrictions-and-moderation',6),
('safety-reporting','appeals-and-safety-resources',7),
('settings-accessibility','general-settings',1),
('settings-accessibility','language-settings',2),
('settings-accessibility','display-light-dark-and-themes',3),
('settings-accessibility','accessibility-and-compact-mode',4),
('settings-accessibility','device-and-notification-preferences',5),
('settings-accessibility','content-preferences',6),
('settings-accessibility','managing-settings',7),
('troubleshooting','login-and-registration-problems',1),
('troubleshooting','password-email-and-phone-problems',2),
('troubleshooting','upload-image-and-video-failures',3),
('troubleshooting','messenger-and-calling-problems',4),
('troubleshooting','live-and-meetwave-problems',5),
('troubleshooting','notification-problems',6),
('troubleshooting','slow-performance-and-crashes',7),
('troubleshooting','connection-browser-and-device-compatibility',8),
('troubleshooting','error-messages',9),
('rules-policies-information','terms-of-service-and-privacy-policy',1),
('rules-policies-information','community-standards-and-platform-rules',2),
('rules-policies-information','copyright-and-content-guidelines',3),
('rules-policies-information','account-and-safety-policies',4),
('rules-policies-information','payment-and-creator-policies',5),
('rules-policies-information','legal-and-contact-information',6)
) v(category_slug,slug,sort_order)
join public.help_categories c on c.slug=v.category_slug
on conflict(category_id,slug) do nothing;

insert into public.help_subcategory_translations(subcategory_id,locale,title,translation_status)
select id,'en',initcap(replace(slug,'-',' ')),'published'
from public.help_subcategories
on conflict(subcategory_id,locale) do nothing;
