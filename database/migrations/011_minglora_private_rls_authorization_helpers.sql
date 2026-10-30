
-- Private SECURITY DEFINER helpers break cross-table RLS recursion.
-- They expose only boolean ownership checks and are not part of the Data API.
BEGIN;

CREATE OR REPLACE FUNCTION private.is_minglora_group_owner(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.social_groups g
    WHERE g.id=target_group_id
      AND g.owner_id=(select auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_minglora_conversation_creator(target_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id=target_conversation_id
      AND c.created_by=(select auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_minglora_call_creator(target_call_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE c.id=target_call_id
      AND c.created_by=(select auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.is_minglora_group_owner(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_minglora_conversation_creator(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_minglora_call_creator(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_minglora_group_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_minglora_conversation_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_minglora_call_creator(uuid) TO authenticated;

-- Group membership queries no longer recurse through social_groups RLS.
DROP POLICY IF EXISTS minglora_group_members_read_self ON public.group_memberships;
CREATE POLICY minglora_group_members_read_self ON public.group_memberships
FOR SELECT TO authenticated
USING (
  user_id=(select auth.uid())
  OR private.is_minglora_group_owner(group_id)
);

DROP POLICY IF EXISTS minglora_group_members_leave ON public.group_memberships;
CREATE POLICY minglora_group_members_leave ON public.group_memberships
FOR UPDATE TO authenticated
USING (
  user_id=(select auth.uid())
  OR private.is_minglora_group_owner(group_id)
)
WITH CHECK (
  (
    user_id=(select auth.uid())
    AND status='left'
    AND role='member'
  )
  OR
  (
    private.is_minglora_group_owner(group_id)
    AND status IN ('requested','active','banned','left')
    AND role IN ('member','moderator','admin','owner')
  )
);

-- Conversation membership and call invitations use private creator checks to
-- avoid a circular conversation/call -> participant -> parent-table RLS chain.
DROP POLICY IF EXISTS minglora_conversation_members_add ON public.conversation_members;
CREATE POLICY minglora_conversation_members_add ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (private.is_minglora_conversation_creator(conversation_id));

DROP POLICY IF EXISTS minglora_call_participants_read ON public.call_participants;
CREATE POLICY minglora_call_participants_read ON public.call_participants
FOR SELECT TO authenticated
USING (
  user_id=(select auth.uid())
  OR private.is_minglora_call_creator(call_id)
);

DROP POLICY IF EXISTS minglora_call_participants_insert ON public.call_participants;
CREATE POLICY minglora_call_participants_insert ON public.call_participants
FOR INSERT TO authenticated
WITH CHECK (private.is_minglora_call_creator(call_id));

COMMIT;
