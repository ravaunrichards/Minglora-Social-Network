
-- Break the remaining Group <-> GroupMembership RLS dependency cycle.
BEGIN;

CREATE OR REPLACE FUNCTION private.is_minglora_group_member(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id=target_group_id
      AND gm.user_id=(select auth.uid())
      AND gm.status='active'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_minglora_group_requestable(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.social_groups g
    WHERE g.id=target_group_id
      AND g.visibility IN ('public','private')
      AND g.status='active'
  );
$$;

REVOKE ALL ON FUNCTION private.is_minglora_group_member(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_minglora_group_requestable(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_minglora_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_minglora_group_requestable(uuid) TO authenticated;

DROP POLICY IF EXISTS minglora_groups_read ON public.social_groups;
CREATE POLICY minglora_groups_read ON public.social_groups
FOR SELECT TO anon, authenticated
USING (
  (visibility='public' AND status='active')
  OR owner_id=(select auth.uid())
  OR private.is_minglora_group_member(id)
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
      AND private.is_minglora_group_requestable(group_id)
    )
  )
);

COMMIT;
