
-- Tighten client write columns and resource ownership checks.
BEGIN;

-- Conversations: only the conversation creator can add members.
-- Participants cannot add themselves to a private conversation by guessing its UUID.
DROP POLICY IF EXISTS minglora_conversation_members_add ON public.conversation_members;
CREATE POLICY minglora_conversation_members_add ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id=conversation_members.conversation_id
      AND c.created_by=(select auth.uid())
  )
);
REVOKE INSERT, UPDATE ON public.conversation_members FROM authenticated;
GRANT INSERT (conversation_id,user_id,role) ON public.conversation_members TO authenticated;
GRANT UPDATE (last_read_at,muted_until) ON public.conversation_members TO authenticated;

-- Group membership role and status are controlled by group owners.
DROP POLICY IF EXISTS minglora_group_members_read_self ON public.group_memberships;
CREATE POLICY minglora_group_members_read_self ON public.group_memberships
FOR SELECT TO authenticated
USING (
  user_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_memberships.group_id
      AND g.owner_id=(select auth.uid())
  )
);

DROP POLICY IF EXISTS minglora_group_members_join ON public.group_memberships;
CREATE POLICY minglora_group_members_join ON public.group_memberships
FOR INSERT TO authenticated
WITH CHECK (
  user_id=(select auth.uid())
  AND role='member'
  AND (
    (
      status='active'
      AND EXISTS (
        SELECT 1 FROM public.social_groups g
        WHERE g.id=group_memberships.group_id
          AND g.visibility='public' AND g.status='active'
      )
    )
    OR
    (
      status='requested'
      AND EXISTS (
        SELECT 1 FROM public.social_groups g
        WHERE g.id=group_memberships.group_id
          AND g.visibility IN ('public','private') AND g.status='active'
      )
    )
  )
);

DROP POLICY IF EXISTS minglora_group_members_leave ON public.group_memberships;
CREATE POLICY minglora_group_members_leave ON public.group_memberships
FOR UPDATE TO authenticated
USING (
  user_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_memberships.group_id
      AND g.owner_id=(select auth.uid())
  )
)
WITH CHECK (
  (
    user_id=(select auth.uid())
    AND status='left'
    AND role='member'
  )
  OR
  (
    EXISTS (
      SELECT 1 FROM public.social_groups g
      WHERE g.id=group_memberships.group_id
        AND g.owner_id=(select auth.uid())
    )
    AND status IN ('requested','active','banned','left')
    AND role IN ('member','moderator','admin','owner')
  )
);
REVOKE INSERT, UPDATE ON public.group_memberships FROM authenticated;
GRANT INSERT (group_id,user_id,status) ON public.group_memberships TO authenticated;
GRANT UPDATE (status,role) ON public.group_memberships TO authenticated;

-- Members may not add themselves to calls; the call creator sends invitations.
DROP POLICY IF EXISTS minglora_call_participants_insert ON public.call_participants;
CREATE POLICY minglora_call_participants_insert ON public.call_participants
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id=call_participants.call_id
      AND c.created_by=(select auth.uid())
  )
);
REVOKE INSERT, UPDATE ON public.call_participants FROM authenticated;
GRANT INSERT (call_id,user_id) ON public.call_participants TO authenticated;
GRANT UPDATE (invitation_status) ON public.call_participants TO authenticated;

-- Live guest/viewer status cannot be forged by the participant requesting entry.
DROP POLICY IF EXISTS minglora_live_participants_insert ON public.live_participants;
CREATE POLICY minglora_live_participants_insert ON public.live_participants
FOR INSERT TO authenticated
WITH CHECK (
  (
    user_id=(select auth.uid())
    AND role='viewer'
    AND status='requested'
  )
  OR
  (
    status='invited'
    AND role IN ('cohost','moderator','guest')
    AND EXISTS (
      SELECT 1 FROM public.live_broadcasts b
      WHERE b.id=live_participants.broadcast_id
        AND b.host_id=(select auth.uid())
    )
  )
);
REVOKE INSERT ON public.live_participants FROM authenticated;
GRANT INSERT (broadcast_id,user_id,role,status) ON public.live_participants TO authenticated;

-- Restrict mutable columns so clients cannot rewrite authorship, ownership,
-- timestamps or trusted moderation/processing state.
REVOKE INSERT, UPDATE ON public.posts FROM authenticated;
GRANT INSERT (author_id,body,audience) ON public.posts TO authenticated;
GRANT UPDATE (body,audience,status) ON public.posts TO authenticated;

REVOKE INSERT, UPDATE ON public.comments FROM authenticated;
GRANT INSERT (post_id,author_id,parent_id,body) ON public.comments TO authenticated;
GRANT UPDATE (body,status) ON public.comments TO authenticated;

REVOKE UPDATE ON public.post_reactions FROM authenticated;
GRANT UPDATE (reaction_type) ON public.post_reactions TO authenticated;

REVOKE INSERT, UPDATE ON public.social_groups FROM authenticated;
GRANT INSERT (owner_id,name,description,visibility) ON public.social_groups TO authenticated;
GRANT UPDATE (name,description,visibility,status) ON public.social_groups TO authenticated;

REVOKE INSERT, UPDATE ON public.group_posts FROM authenticated;
GRANT INSERT (group_id,author_id,body) ON public.group_posts TO authenticated;
GRANT UPDATE (body,status) ON public.group_posts TO authenticated;

REVOKE INSERT, UPDATE ON public.page_posts FROM authenticated;
GRANT INSERT (page_id,published_by,body,image_url) ON public.page_posts TO authenticated;
GRANT UPDATE (body,image_url,status) ON public.page_posts TO authenticated;

-- Media processing status is trusted-server state; client uploads start pending.
REVOKE INSERT, UPDATE ON public.media_assets FROM authenticated;
GRANT INSERT (owner_id,storage_key,media_type,mime_type,byte_size,width,height,duration_ms)
  ON public.media_assets TO authenticated;

-- Uploaded media must belong to the actor attaching it to a post.
DROP POLICY IF EXISTS minglora_post_media_insert ON public.post_media;
CREATE POLICY minglora_post_media_insert ON public.post_media
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id=post_media.post_id AND p.author_id=(select auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.media_assets a
    WHERE a.id=post_media.asset_id AND a.owner_id=(select auth.uid())
  )
);

-- Albums can include only assets owned by their creator.
DROP POLICY IF EXISTS minglora_album_photos_insert ON public.album_photos;
CREATE POLICY minglora_album_photos_insert ON public.album_photos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.photo_albums a
    WHERE a.id=album_photos.album_id AND a.owner_id=(select auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.media_assets m
    WHERE m.id=album_photos.asset_id AND m.owner_id=(select auth.uid())
  )
);

-- Listings can attach only the seller's own media.
DROP POLICY IF EXISTS minglora_listing_media_insert ON public.listing_media;
CREATE POLICY minglora_listing_media_insert ON public.listing_media
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.marketplace_listings l
    WHERE l.id=listing_media.listing_id AND l.seller_id=(select auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.media_assets m
    WHERE m.id=listing_media.asset_id AND m.owner_id=(select auth.uid())
  )
);

-- Video submissions are untrusted until the processing worker marks them ready.
REVOKE INSERT, UPDATE ON public.short_videos FROM authenticated;
GRANT INSERT (creator_id,asset_id,sound_asset_id,caption,audience,duration_ms)
  ON public.short_videos TO authenticated;
GRANT UPDATE (caption,audience) ON public.short_videos TO authenticated;
DROP POLICY IF EXISTS minglora_short_videos_insert_self ON public.short_videos;
CREATE POLICY minglora_short_videos_insert_self ON public.short_videos
FOR INSERT TO authenticated
WITH CHECK (
  creator_id=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.media_assets m
    WHERE m.id=short_videos.asset_id AND m.owner_id=(select auth.uid())
  )
  AND (
    sound_asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.media_assets sound
      WHERE sound.id=short_videos.sound_asset_id
        AND sound.owner_id=(select auth.uid())
        AND sound.media_type='audio'
    )
  )
);

-- A video play event must point to a video the viewer is permitted to see.
DROP POLICY IF EXISTS minglora_video_plays_insert_self ON public.short_video_play_events;
CREATE POLICY minglora_video_plays_insert_self ON public.short_video_play_events
FOR INSERT TO authenticated
WITH CHECK (
  viewer_id=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.short_videos v
    WHERE v.id=short_video_play_events.video_id
  )
);

-- Reports are submitted open; users cannot self-dismiss or self-action reports.
REVOKE INSERT, UPDATE, DELETE ON public.reports FROM authenticated;
GRANT INSERT (reporter_id,target_type,target_id,category,details)
  ON public.reports TO authenticated;

-- Client-created Stories cannot set their creation timestamp.
REVOKE INSERT ON public.stories FROM authenticated;
GRANT INSERT (author_id,asset_id,text,image_url,audience,expires_at)
  ON public.stories TO authenticated;

-- Client-created Pages get the default active status, not a forged workflow state.
REVOKE INSERT ON public.pages FROM authenticated;
GRANT INSERT (handle,title,description,category,created_by)
  ON public.pages TO authenticated;

-- Profile asset references must point to assets the member actually owns.
DROP POLICY IF EXISTS minglora_profiles_update_self ON public.profiles;
CREATE POLICY minglora_profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (id=(select auth.uid()))
WITH CHECK (
  id=(select auth.uid())
  AND (
    avatar_asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.media_assets a
      WHERE a.id=profiles.avatar_asset_id AND a.owner_id=(select auth.uid())
    )
  )
  AND (
    cover_asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.media_assets a
      WHERE a.id=profiles.cover_asset_id AND a.owner_id=(select auth.uid())
    )
  )
);

COMMIT;
