-- Co-host roster reads are limited to participants and authorized LIVE viewers.
BEGIN;
ALTER TABLE public.live_cohost_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_cohost_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_cohost_sessions FROM anon,authenticated;
REVOKE ALL ON TABLE public.live_cohost_participants FROM anon,authenticated;
GRANT SELECT ON TABLE public.live_cohost_sessions TO authenticated;
GRANT SELECT ON TABLE public.live_cohost_participants TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.live_cohost_sessions TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.live_cohost_participants TO service_role;
DROP POLICY IF EXISTS minglora_live_cohost_sessions_read_authorized_member ON public.live_cohost_sessions;
CREATE POLICY minglora_live_cohost_sessions_read_authorized_member
  ON public.live_cohost_sessions FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.live_cohost_participants participant
      WHERE participant.cohost_session_id = live_cohost_sessions.id
        AND participant.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.live_participants viewer
      JOIN public.live_broadcasts broadcast ON broadcast.id = viewer.broadcast_id
      WHERE viewer.broadcast_id = live_cohost_sessions.broadcast_id
        AND viewer.user_id = (SELECT auth.uid())
        AND viewer.status = 'connected' AND broadcast.status = 'live'
    )
  );
DROP POLICY IF EXISTS minglora_live_cohost_participants_read_authorized_member
  ON public.live_cohost_participants;
CREATE POLICY minglora_live_cohost_participants_read_authorized_member
  ON public.live_cohost_participants FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.live_participants viewer
      JOIN public.live_broadcasts broadcast ON broadcast.id = viewer.broadcast_id
      WHERE viewer.broadcast_id = live_cohost_participants.broadcast_id
        AND viewer.user_id = (SELECT auth.uid())
        AND viewer.status = 'connected' AND broadcast.status = 'live'
    )
  );
COMMIT;
