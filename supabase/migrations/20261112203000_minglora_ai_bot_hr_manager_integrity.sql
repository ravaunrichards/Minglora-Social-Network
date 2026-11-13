-- Enforce that an appointment's manager appointment and manager identity
-- always identify the same owned organizational AI appointment.
-- Additive integrity hardening: no status, permission, identity or HR data changes.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ai_appointments_owner_appointment_identity_uq
  ON public.ai_appointments (owner_admin_id, appointment_id, identity_id);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'ai_appointments_reporting_manager_identity_match_fk'
      AND conrelid = 'public.ai_appointments'::regclass
  ) THEN
    ALTER TABLE public.ai_appointments
      ADD CONSTRAINT ai_appointments_reporting_manager_identity_match_fk
      FOREIGN KEY (
        owner_admin_id,
        reporting_manager_appointment_id,
        reporting_manager_identity_id
      )
      REFERENCES public.ai_appointments (
        owner_admin_id,
        appointment_id,
        identity_id
      )
      MATCH FULL
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'ai_appointments_no_self_manager_check'
      AND conrelid = 'public.ai_appointments'::regclass
  ) THEN
    ALTER TABLE public.ai_appointments
      ADD CONSTRAINT ai_appointments_no_self_manager_check
      CHECK (
        reporting_manager_appointment_id IS NULL
        OR reporting_manager_appointment_id <> appointment_id
      );
  END IF;
END
$migration$;

COMMIT;
