
-- Consolidate Live participant insert/update policies without changing
-- authorization semantics, avoiding multiple permissive policies per action.
BEGIN;

DROP POLICY IF EXISTS minglora_live_participants_request ON public.live_participants;
DROP POLICY IF EXISTS minglora_live_participants_host_invite ON public.live_participants;
CREATE POLICY minglora_live_participants_insert ON public.live_participants
FOR INSERT TO authenticated
WITH CHECK (
  (
    user_id=(select auth.uid())
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

DROP POLICY IF EXISTS minglora_live_participants_update_self ON public.live_participants;
DROP POLICY IF EXISTS minglora_live_participants_host_manage ON public.live_participants;
CREATE POLICY minglora_live_participants_update ON public.live_participants
FOR UPDATE TO authenticated
USING (
  user_id=(select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.live_broadcasts b
    WHERE b.id=live_participants.broadcast_id
      AND b.host_id=(select auth.uid())
  )
)
WITH CHECK (
  (
    user_id=(select auth.uid())
    AND status='left'
  )
  OR
  (
    status IN ('accepted','rejected','removed')
    AND EXISTS (
      SELECT 1 FROM public.live_broadcasts b
      WHERE b.id=live_participants.broadcast_id
        AND b.host_id=(select auth.uid())
    )
  )
);

COMMIT;
