
-- Correct relationship-scoped authorization and reserve provider-confirmed
-- Live/call lifecycle transitions for trusted server-side operations.
BEGIN;

-- Group discussion writes must be scoped to membership in the exact group.
DROP POLICY IF EXISTS minglora_group_posts_insert ON public.group_posts;
CREATE POLICY minglora_group_posts_insert ON public.group_posts
FOR INSERT TO authenticated
WITH CHECK (
  author_id=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_posts.group_id
      AND gm.user_id=(select auth.uid())
      AND gm.status='active'
  )
);

DROP POLICY IF EXISTS minglora_group_posts_update_self ON public.group_posts;
CREATE POLICY minglora_group_posts_update_self ON public.group_posts
FOR UPDATE TO authenticated
USING (
  author_id=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_posts.group_id
      AND gm.user_id=(select auth.uid())
      AND gm.status='active'
  )
)
WITH CHECK (
  author_id=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_posts.group_id
      AND gm.user_id=(select auth.uid())
      AND gm.status='active'
  )
);

-- Page post permissions must be scoped to the same specific Page.
DROP POLICY IF EXISTS minglora_page_posts_insert_manager ON public.page_posts;
CREATE POLICY minglora_page_posts_insert_manager ON public.page_posts
FOR INSERT TO authenticated
WITH CHECK (
  published_by=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.page_roles pr
    WHERE pr.page_id=page_posts.page_id
      AND pr.user_id=(select auth.uid())
      AND pr.role IN ('owner','admin','editor')
  )
);

DROP POLICY IF EXISTS minglora_page_posts_update_manager ON public.page_posts;
CREATE POLICY minglora_page_posts_update_manager ON public.page_posts
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.page_roles pr
    WHERE pr.page_id=page_posts.page_id
      AND pr.user_id=(select auth.uid())
      AND pr.role IN ('owner','admin','editor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.page_roles pr
    WHERE pr.page_id=page_posts.page_id
      AND pr.user_id=(select auth.uid())
      AND pr.role IN ('owner','admin','editor')
  )
);

DROP POLICY IF EXISTS minglora_page_posts_delete_manager ON public.page_posts;
CREATE POLICY minglora_page_posts_delete_manager ON public.page_posts
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.page_roles pr
    WHERE pr.page_id=page_posts.page_id
      AND pr.user_id=(select auth.uid())
      AND pr.role IN ('owner','admin','editor')
  )
);
REVOKE UPDATE ON public.page_posts FROM authenticated;
GRANT UPDATE(body,image_url,status) ON public.page_posts TO authenticated;

-- A host may create a broadcast, but only the trusted LiveKit/server path may
-- mark it live, assign the room reference, or set actual start/end timestamps.
DROP POLICY IF EXISTS minglora_live_create_host ON public.live_broadcasts;
CREATE POLICY minglora_live_create_host ON public.live_broadcasts
FOR INSERT TO authenticated
WITH CHECK (
  host_id=(select auth.uid())
  AND status='created'
  AND room_ref IS NULL
  AND started_at IS NULL
  AND ended_at IS NULL
);
REVOKE UPDATE ON public.live_broadcasts FROM authenticated;
GRANT UPDATE(title,description,audience) ON public.live_broadcasts TO authenticated;

-- Connected viewer counts are derived only from server-confirmed 'connected'
-- participant rows. A participant cannot mark themselves accepted/connected.
DROP POLICY IF EXISTS minglora_live_participants_update_self ON public.live_participants;
CREATE POLICY minglora_live_participants_update_self ON public.live_participants
FOR UPDATE TO authenticated
USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()) AND status='left');

DROP POLICY IF EXISTS minglora_live_participants_host_manage ON public.live_participants;
CREATE POLICY minglora_live_participants_host_manage ON public.live_participants
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_broadcasts b
    WHERE b.id=live_participants.broadcast_id
      AND b.host_id=(select auth.uid())
  )
)
WITH CHECK (
  status IN ('accepted','rejected','removed')
  AND EXISTS (
    SELECT 1 FROM public.live_broadcasts b
    WHERE b.id=live_participants.broadcast_id
      AND b.host_id=(select auth.uid())
  )
);

DROP POLICY IF EXISTS minglora_live_participants_host_invite ON public.live_participants;
CREATE POLICY minglora_live_participants_host_invite ON public.live_participants
FOR INSERT TO authenticated
WITH CHECK (
  status='invited'
  AND role IN ('cohost','moderator','guest')
  AND EXISTS (
    SELECT 1 FROM public.live_broadcasts b
    WHERE b.id=live_participants.broadcast_id
      AND b.host_id=(select auth.uid())
  )
);

-- A call row may be created, but trusted application signaling controls state
-- transitions and provider room references.
DROP POLICY IF EXISTS minglora_calls_create_self ON public.calls;
CREATE POLICY minglora_calls_create_self ON public.calls
FOR INSERT TO authenticated
WITH CHECK (
  created_by=(select auth.uid())
  AND status='created'
  AND room_ref IS NULL
  AND started_at IS NULL
  AND ended_at IS NULL
);
REVOKE UPDATE ON public.calls FROM authenticated;

-- User-created fundraisers remain drafts until the trusted review workflow
-- changes status; organizer edits cannot approve or reject their own fundraiser.
REVOKE UPDATE ON public.fundraisers FROM authenticated;
GRANT UPDATE(title,description,currency,goal_minor,starts_at,ends_at)
  ON public.fundraisers TO authenticated;

-- Public buckets still need an owner SELECT policy so Storage upsert checks
-- can read the member's existing object without exposing object listings.
DROP POLICY IF EXISTS minglora_avatars_read_owner ON storage.objects;
CREATE POLICY minglora_avatars_read_owner ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='minglora-avatars'
  AND (storage.foldername(name))[1]=(select auth.uid())::text
);
DROP POLICY IF EXISTS minglora_covers_read_owner ON storage.objects;
CREATE POLICY minglora_covers_read_owner ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='minglora-covers'
  AND (storage.foldername(name))[1]=(select auth.uid())::text
);

COMMIT;
