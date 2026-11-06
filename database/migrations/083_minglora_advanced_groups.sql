-- Minglora advanced Groups: additive schema only; no sample groups or members.
BEGIN;

ALTER TABLE public.social_groups
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cover_asset_id uuid,
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS join_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS post_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_member_invites boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rules_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.group_memberships
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Expand role values without removing or rewriting existing memberships.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.group_memberships'::regclass
      AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.group_memberships DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.group_memberships
  ADD CONSTRAINT group_memberships_role_check
  CHECK (role IN ('member','event_manager','content_manager','moderator','admin','owner'));

CREATE TABLE IF NOT EXISTS public.group_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_rules_order_idx ON public.group_rules(group_id, position, created_at);

CREATE TABLE IF NOT EXISTS public.group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked','expired')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (inviter_id <> invitee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_pending_pair_uq
  ON public.group_invitations(group_id, invitee_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS group_invitations_inbox_idx
  ON public.group_invitations(invitee_id, created_at DESC) WHERE status='pending';

CREATE TABLE IF NOT EXISTS public.group_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('member','post','comment','media')),
  target_id uuid,
  action text NOT NULL CHECK (action IN ('warn','restrict','mute','remove','ban','unban','hide_content','restore_content','approve_content','reject_content')),
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_moderation_history_idx
  ON public.group_moderation_actions(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS group_moderation_target_idx
  ON public.group_moderation_actions(target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.group_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_audit_history_idx
  ON public.group_audit_logs(group_id, created_at DESC);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.social_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS events_group_starts_idx
  ON public.events(group_id, starts_at) WHERE group_id IS NOT NULL;

-- Group events inherit group visibility and role-based event management.
CREATE OR REPLACE FUNCTION private.can_manage_minglora_group_events(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=target_group_id AND g.owner_id=(select auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=target_group_id
      AND gm.user_id=(select auth.uid())
      AND gm.status='active'
      AND gm.role IN ('owner','admin','moderator','event_manager')
  );
$;
REVOKE ALL ON FUNCTION private.can_manage_minglora_group_events(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_minglora_group_events(uuid)
  TO authenticated;

DROP POLICY IF EXISTS minglora_events_read ON public.events;
CREATE POLICY minglora_events_read ON public.events
FOR SELECT TO authenticated
USING (
  (group_id IS NULL AND visibility='public')
  OR creator_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=events.group_id AND g.status='active'
      AND (
        g.visibility='public'
        OR g.owner_id=(select auth.uid())
        OR private.is_minglora_group_member(g.id)
      )
  )
);

DROP POLICY IF EXISTS minglora_events_insert_self ON public.events;
CREATE POLICY minglora_events_insert_self ON public.events
FOR INSERT TO authenticated
WITH CHECK (
  creator_id=(select auth.uid())
  AND (group_id IS NULL OR private.can_manage_minglora_group_events(group_id))
);

DROP POLICY IF EXISTS minglora_events_update_self ON public.events;
CREATE POLICY minglora_events_update_self ON public.events
FOR UPDATE TO authenticated
USING (
  creator_id=(select auth.uid())
  OR (group_id IS NOT NULL AND private.can_manage_minglora_group_events(group_id))
)
WITH CHECK (
  creator_id=(select auth.uid())
  OR (group_id IS NOT NULL AND private.can_manage_minglora_group_events(group_id))
);

DROP POLICY IF EXISTS minglora_events_delete_self ON public.events;
CREATE POLICY minglora_events_delete_self ON public.events
FOR DELETE TO authenticated
USING (
  creator_id=(select auth.uid())
  OR (group_id IS NOT NULL AND private.can_manage_minglora_group_events(group_id))
);

DROP POLICY IF EXISTS minglora_event_rsvps_insert_self ON public.event_rsvps;
CREATE POLICY minglora_event_rsvps_insert_self ON public.event_rsvps
FOR INSERT TO authenticated
WITH CHECK (
  user_id=(select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id=event_id AND (
      e.creator_id=(select auth.uid())
      OR (e.group_id IS NULL AND e.visibility='public')
      OR EXISTS (
        SELECT 1 FROM public.social_groups g
        WHERE g.id=e.group_id AND g.status='active'
          AND (
            g.visibility='public'
            OR g.owner_id=(select auth.uid())
            OR private.is_minglora_group_member(g.id)
          )
      )
    )
  )
);

-- Group data remains protected by RLS; writes to audit and moderation records are
-- intended to be performed by trusted server-side actions, never direct clients.
ALTER TABLE public.group_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minglora_group_rules_read ON public.group_rules;
CREATE POLICY minglora_group_rules_read ON public.group_rules
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_rules.group_id AND (
      (g.visibility='public' AND g.status='active')
      OR g.owner_id=(select auth.uid())
      OR private.is_minglora_group_member(g.id)
    )
  )
);

DROP POLICY IF EXISTS minglora_group_invitations_read_self ON public.group_invitations;
CREATE POLICY minglora_group_invitations_read_self ON public.group_invitations
FOR SELECT TO authenticated
USING (invitee_id=(select auth.uid()) OR inviter_id=(select auth.uid()));

DROP POLICY IF EXISTS minglora_group_moderation_read_staff ON public.group_moderation_actions;
CREATE POLICY minglora_group_moderation_read_staff ON public.group_moderation_actions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_moderation_actions.group_id
      AND gm.user_id=(select auth.uid()) AND gm.status='active'
      AND gm.role IN ('owner','admin','moderator')
  )
  OR EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_moderation_actions.group_id AND g.owner_id=(select auth.uid())
  )
);

DROP POLICY IF EXISTS minglora_group_audit_read_staff ON public.group_audit_logs;
CREATE POLICY minglora_group_audit_read_staff ON public.group_audit_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_audit_logs.group_id
      AND gm.user_id=(select auth.uid()) AND gm.status='active'
      AND gm.role IN ('owner','admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_audit_logs.group_id AND g.owner_id=(select auth.uid())
  )
);

REVOKE ALL ON public.group_moderation_actions, public.group_audit_logs FROM anon, authenticated;
GRANT SELECT ON public.group_moderation_actions, public.group_audit_logs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.group_rules, public.group_invitations FROM anon, authenticated;



-- Membership requests and announcements are durable records, not fabricated counters.
CREATE TABLE IF NOT EXISTS public.group_membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  UNIQUE (group_id,user_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS group_membership_requests_pending_uq
  ON public.group_membership_requests(group_id,user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS group_membership_requests_review_idx
  ON public.group_membership_requests(group_id,created_at) WHERE status='pending';
ALTER TABLE public.group_membership_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS minglora_group_requests_read_requester_or_staff ON public.group_membership_requests;
CREATE POLICY minglora_group_requests_read_requester_or_staff ON public.group_membership_requests
FOR SELECT TO authenticated
USING (
  user_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_membership_requests.group_id AND g.owner_id=(select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_membership_requests.group_id AND gm.user_id=(select auth.uid())
      AND gm.status='active' AND gm.role IN ('admin','moderator')
  )
);
DROP POLICY IF EXISTS minglora_group_requests_create_self ON public.group_membership_requests;
CREATE POLICY minglora_group_requests_create_self ON public.group_membership_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id=(select auth.uid()) AND status='pending'
  AND EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=group_membership_requests.group_id AND g.status='active'
      AND g.visibility IN ('public','private')
  )
);
DROP POLICY IF EXISTS minglora_group_requests_cancel_self ON public.group_membership_requests;
CREATE POLICY minglora_group_requests_cancel_self ON public.group_membership_requests
FOR UPDATE TO authenticated
USING (user_id=(select auth.uid()))
WITH CHECK (user_id=(select auth.uid()) AND status IN ('pending','cancelled'));

CREATE TABLE IF NOT EXISTS public.group_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 140),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_announcements_feed_idx
  ON public.group_announcements(group_id,created_at DESC) WHERE status='published';
ALTER TABLE public.group_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS minglora_group_announcements_read ON public.group_announcements;
CREATE POLICY minglora_group_announcements_read ON public.group_announcements
FOR SELECT TO anon, authenticated
USING (
  status='published' AND EXISTS (
    SELECT 1 FROM public.social_groups g WHERE g.id=group_announcements.group_id AND (
      (g.visibility='public' AND g.status='active')
      OR g.owner_id=(select auth.uid())
      OR private.is_minglora_group_member(g.id)
    )
  )
);
GRANT SELECT ON public.group_announcements TO anon, authenticated;

-- Group post approval adds a pending state to the existing post workflow.
DO $
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.group_posts'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.group_posts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $;
ALTER TABLE public.group_posts
  ADD CONSTRAINT group_posts_status_check
  CHECK (status IN ('published','pending','hidden','deleted'));

-- Moderators may maintain community rules through the server's authorized API.
DROP POLICY IF EXISTS minglora_group_rules_insert_staff ON public.group_rules;
CREATE POLICY minglora_group_rules_insert_staff ON public.group_rules
FOR INSERT TO authenticated
WITH CHECK (
  created_by=(select auth.uid()) AND EXISTS (
    SELECT 1 FROM public.social_groups g WHERE g.id=group_rules.group_id AND (
      g.owner_id=(select auth.uid())
      OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id=g.id
        AND gm.user_id=(select auth.uid()) AND gm.status='active' AND gm.role IN ('admin','moderator'))
    )
  )
);
DROP POLICY IF EXISTS minglora_group_rules_update_staff ON public.group_rules;
CREATE POLICY minglora_group_rules_update_staff ON public.group_rules
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.social_groups g WHERE g.id=group_rules.group_id AND (
    g.owner_id=(select auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id=g.id
      AND gm.user_id=(select auth.uid()) AND gm.status='active' AND gm.role IN ('admin','moderator'))
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.social_groups g WHERE g.id=group_rules.group_id AND (
    g.owner_id=(select auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id=g.id
      AND gm.user_id=(select auth.uid()) AND gm.status='active' AND gm.role IN ('admin','moderator'))
  )
));
DROP POLICY IF EXISTS minglora_group_rules_delete_staff ON public.group_rules;
CREATE POLICY minglora_group_rules_delete_staff ON public.group_rules
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.social_groups g WHERE g.id=group_rules.group_id AND (
    g.owner_id=(select auth.uid())
    OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id=g.id
      AND gm.user_id=(select auth.uid()) AND gm.status='active' AND gm.role IN ('admin','moderator'))
  )
));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_rules TO authenticated;

-- Private, member-only group chat. There are no seeded messages.
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS group_messages_history_idx
  ON public.group_messages(group_id, created_at DESC, id DESC);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS minglora_group_messages_read_member ON public.group_messages;
CREATE POLICY minglora_group_messages_read_member ON public.group_messages
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    private.is_minglora_group_member(group_id)
    OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_messages.group_id AND g.owner_id=(select auth.uid()))
  )
);
DROP POLICY IF EXISTS minglora_group_messages_insert_member ON public.group_messages;
CREATE POLICY minglora_group_messages_insert_member ON public.group_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id=(select auth.uid()) AND (
    private.is_minglora_group_member(group_id)
    OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_messages.group_id AND g.owner_id=(select auth.uid()))
  )
);
DROP POLICY IF EXISTS minglora_group_messages_update_author_or_staff ON public.group_messages;
CREATE POLICY minglora_group_messages_update_author_or_staff ON public.group_messages
FOR UPDATE TO authenticated
USING (
  sender_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_groups g WHERE g.id=group_messages.group_id AND g.owner_id=(select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_messages.group_id AND gm.user_id=(select auth.uid())
      AND gm.status='active' AND gm.role IN ('admin','moderator')
  )
)
WITH CHECK (
  sender_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.social_groups g WHERE g.id=group_messages.group_id AND g.owner_id=(select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=group_messages.group_id AND gm.user_id=(select auth.uid())
      AND gm.status='active' AND gm.role IN ('admin','moderator')
  )
);
GRANT SELECT, INSERT, UPDATE ON public.group_messages TO authenticated;
ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
  END IF;
END $$;


-- Member-only threaded group comments and one active reaction per member/post.
CREATE TABLE IF NOT EXISTS public.group_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  parent_id uuid,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id,post_id),
  CONSTRAINT group_post_comments_parent_same_post_fk
    FOREIGN KEY (parent_id,post_id) REFERENCES public.group_post_comments(id,post_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS group_post_comments_thread_idx
  ON public.group_post_comments(post_id,created_at,id) WHERE status='visible';
CREATE INDEX IF NOT EXISTS group_post_comments_parent_idx
  ON public.group_post_comments(parent_id,created_at) WHERE parent_id IS NOT NULL AND status='visible';
ALTER TABLE public.group_post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS minglora_group_post_comments_read_member ON public.group_post_comments;
CREATE POLICY minglora_group_post_comments_read_member ON public.group_post_comments
FOR SELECT TO authenticated
USING (
  status='visible' AND (
    private.is_minglora_group_member(group_id)
    OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_comments.group_id AND g.owner_id=(select auth.uid()))
  )
);
DROP POLICY IF EXISTS minglora_group_post_comments_insert_member ON public.group_post_comments;
CREATE POLICY minglora_group_post_comments_insert_member ON public.group_post_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id=(select auth.uid()) AND status='visible' AND (
    private.is_minglora_group_member(group_id)
    OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_comments.group_id AND g.owner_id=(select auth.uid()))
  )
);
DROP POLICY IF EXISTS minglora_group_post_comments_update_author_or_staff ON public.group_post_comments;
CREATE POLICY minglora_group_post_comments_update_author_or_staff ON public.group_post_comments
FOR UPDATE TO authenticated
USING (
  user_id=(select auth.uid())
  OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_comments.group_id AND g.owner_id=(select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id=group_post_comments.group_id
    AND gm.user_id=(select auth.uid()) AND gm.status='active' AND gm.role IN ('admin','moderator'))
)
WITH CHECK (
  user_id=(select auth.uid())
  OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_comments.group_id AND g.owner_id=(select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id=group_post_comments.group_id
    AND gm.user_id=(select auth.uid()) AND gm.status='active' AND gm.role IN ('admin','moderator'))
);
GRANT SELECT, INSERT, UPDATE ON public.group_post_comments TO authenticated;

CREATE TABLE IF NOT EXISTS public.group_post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.social_groups(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like','love','care','haha','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id,user_id)
);
CREATE INDEX IF NOT EXISTS group_post_reactions_post_idx
  ON public.group_post_reactions(post_id,reaction_type);
ALTER TABLE public.group_post_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS minglora_group_post_reactions_read_member ON public.group_post_reactions;
CREATE POLICY minglora_group_post_reactions_read_member ON public.group_post_reactions
FOR SELECT TO authenticated
USING (
  private.is_minglora_group_member(group_id)
  OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_reactions.group_id AND g.owner_id=(select auth.uid()))
);
DROP POLICY IF EXISTS minglora_group_post_reactions_write_self ON public.group_post_reactions;
CREATE POLICY minglora_group_post_reactions_write_self ON public.group_post_reactions
FOR ALL TO authenticated
USING (
  user_id=(select auth.uid()) AND (
    private.is_minglora_group_member(group_id)
    OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_reactions.group_id AND g.owner_id=(select auth.uid()))
  )
)
WITH CHECK (
  user_id=(select auth.uid()) AND (
    private.is_minglora_group_member(group_id)
    OR EXISTS (SELECT 1 FROM public.social_groups g WHERE g.id=group_post_reactions.group_id AND g.owner_id=(select auth.uid()))
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_post_reactions TO authenticated;

COMMIT;
