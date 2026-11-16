
-- Minglora database hardening: cover remaining FK lookups and protect the
-- Supabase-provided DDL event-trigger function from direct API invocation.
BEGIN;

ALTER TABLE public.memory_exclusions
  ADD COLUMN IF NOT EXISTS id uuid;
UPDATE public.memory_exclusions SET id=gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.memory_exclusions
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.memory_exclusions'::regclass
      AND contype='p'
  ) THEN
    ALTER TABLE public.memory_exclusions
      ADD CONSTRAINT memory_exclusions_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS album_photos_asset_id_idx ON public.album_photos(asset_id);
CREATE INDEX IF NOT EXISTS calls_created_by_idx ON public.calls(created_by);
CREATE INDEX IF NOT EXISTS checkins_post_id_idx ON public.checkins(post_id);
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments(author_id);
CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations(created_by);
CREATE INDEX IF NOT EXISTS event_rsvps_user_id_idx ON public.event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS events_creator_id_idx ON public.events(creator_id);
CREATE INDEX IF NOT EXISTS friendships_requester_id_idx ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS fundraiser_donations_donor_user_id_idx ON public.fundraiser_donations(donor_user_id);
CREATE INDEX IF NOT EXISTS fundraisers_beneficiary_user_id_idx ON public.fundraisers(beneficiary_user_id);
CREATE INDEX IF NOT EXISTS fundraisers_organizer_id_idx ON public.fundraisers(organizer_id);
CREATE INDEX IF NOT EXISTS listing_media_asset_id_idx ON public.listing_media(asset_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_id_idx ON public.marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS memory_exclusions_excluded_user_id_idx ON public.memory_exclusions(excluded_user_id);
CREATE INDEX IF NOT EXISTS messages_attachment_asset_id_idx ON public.messages(attachment_asset_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS notifications_actor_id_idx ON public.notifications(actor_id);
CREATE INDEX IF NOT EXISTS page_roles_user_id_idx ON public.page_roles(user_id);
CREATE INDEX IF NOT EXISTS pages_created_by_idx ON public.pages(created_by);
CREATE INDEX IF NOT EXISTS photo_albums_cover_asset_id_idx ON public.photo_albums(cover_asset_id);
CREATE INDEX IF NOT EXISTS photo_tags_tagged_by_idx ON public.photo_tags(tagged_by);
CREATE INDEX IF NOT EXISTS post_media_asset_id_idx ON public.post_media(asset_id);
CREATE INDEX IF NOT EXISTS profiles_avatar_asset_id_idx ON public.profiles(avatar_asset_id);
CREATE INDEX IF NOT EXISTS profiles_cover_asset_id_idx ON public.profiles(cover_asset_id);
CREATE INDEX IF NOT EXISTS reports_reporter_id_idx ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS reports_reviewed_by_idx ON public.reports(reviewed_by);
CREATE INDEX IF NOT EXISTS saved_posts_post_id_idx ON public.saved_posts(post_id);
CREATE INDEX IF NOT EXISTS short_videos_asset_id_idx ON public.short_videos(asset_id);
CREATE INDEX IF NOT EXISTS short_videos_sound_asset_id_idx ON public.short_videos(sound_asset_id);
CREATE INDEX IF NOT EXISTS social_groups_owner_id_idx ON public.social_groups(owner_id);
CREATE INDEX IF NOT EXISTS stories_asset_id_idx ON public.stories(asset_id);
CREATE INDEX IF NOT EXISTS stories_author_id_idx ON public.stories(author_id);
CREATE INDEX IF NOT EXISTS story_views_viewer_id_idx ON public.story_views(viewer_id);
CREATE INDEX IF NOT EXISTS video_watch_history_video_id_idx ON public.video_watch_history(video_id);

-- This function is installed by the Supabase platform. Keep its event-trigger
-- behavior but prevent direct anon/authenticated execution through PostgREST.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

COMMIT;
