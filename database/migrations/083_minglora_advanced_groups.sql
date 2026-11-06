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

-- Group data remains protected by RLS; writes to audit and moderation records are
-- intended to be performed by trusted server-side actions, never direct clients.
ALTER TABLE public.group_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minglora_group_rules_read ON public.group_rules;
CREATE POLICY minglora_group_rules_read ON public.group_rules
FOR SELECT TO anon, authenticated
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

COMMIT;
