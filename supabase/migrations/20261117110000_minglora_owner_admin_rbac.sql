BEGIN;

-- Owner-managed delegated administration foundation.
-- This migration deliberately does not update, insert, deactivate, or promote any
-- existing minglora_platform_staff row. Creator Hub remains the sole owner.

ALTER TABLE public.minglora_platform_staff
  DROP CONSTRAINT IF EXISTS minglora_platform_staff_role_check;
ALTER TABLE public.minglora_platform_staff
  ADD CONSTRAINT minglora_platform_staff_role_check
  CHECK (role IN (
    'owner','admin','moderator','reviewer',
    'super_administrator','finance_administrator','technical_administrator',
    'security_administrator','content_administrator','creator_manager',
    'support_administrator','read_only_auditor'
  ));

CREATE TABLE IF NOT EXISTS public.minglora_admin_role_definitions (
  role_key text PRIMARY KEY CHECK (role_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  display_name text NOT NULL,
  description text NOT NULL,
  assignable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_permission_catalog (
  permission_key text PRIMARY KEY CHECK (permission_key ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$'),
  display_name text NOT NULL,
  description text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_role_permissions (
  role_key text NOT NULL REFERENCES public.minglora_admin_role_definitions(role_key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.minglora_admin_permission_catalog(permission_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_rbac_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('staff.granted','staff.revoked')),
  previous_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(previous_state)='object'),
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(new_state)='object'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS minglora_admin_rbac_audit_target_idx
  ON public.minglora_admin_rbac_audit(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_admin_rbac_audit_actor_idx
  ON public.minglora_admin_rbac_audit(actor_user_id, created_at DESC);

INSERT INTO public.minglora_admin_role_definitions(role_key,display_name,description,assignable) VALUES
 ('super_administrator','Super Administrator','Reserved system-wide role. Not assignable while Creator Hub is the sole owner.',false),
 ('finance_administrator','Finance Administrator','Company finance records and finance reporting.',true),
 ('technical_administrator','Technical Administrator','Technical operations, deployments and infrastructure diagnostics.',true),
 ('security_administrator','Security Administrator','Security posture, access reviews and incident visibility.',true),
 ('content_administrator','Content Administrator','Content operations and moderation workflows.',true),
 ('creator_manager','Creator Manager','Creator support, verification and creator operations.',true),
 ('support_administrator','Support Administrator','Member support and limited member lookup.',true),
 ('read_only_auditor','Read-only Auditor','Read-only access to approved audit and operational reports.',true)
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.minglora_admin_permission_catalog(permission_key,display_name,description,risk_level) VALUES
 ('platform:read','Platform overview','View approved platform status and inventory.','low'),
 ('members:read','Member lookup','View member account summaries.','medium'),
 ('members:manage','Member administration','Perform explicitly permitted member account actions.','high'),
 ('moderation:read','Moderation queue','View moderation cases.','medium'),
 ('moderation:manage','Moderation actions','Apply approved moderation actions.','high'),
 ('verification:review','Verification review','Review profile verification submissions.','high'),
 ('support:read','Support inbox','View support requests.','medium'),
 ('support:manage','Support responses','Respond to member support requests.','medium'),
 ('settings:read','Settings view','View non-secret platform settings.','medium'),
 ('settings:manage','Settings management','Change approved platform settings.','critical'),
 ('finance:read','Finance reporting','View company finance records and reports.','high'),
 ('finance:manage','Finance management','Create and update company finance records.','critical'),
 ('technical:read','Technical diagnostics','View technical health and deployment status.','medium'),
 ('technical:manage','Technical operations','Manage approved technical operations.','critical'),
 ('security:read','Security review','View security status and access history.','high'),
 ('security:manage','Security management','Manage approved security controls.','critical'),
 ('content:read','Content operations view','View content operations.','low'),
 ('content:manage','Content management','Manage approved content workflows.','high'),
 ('creators:read','Creator operations view','View creator operational records.','medium'),
 ('creators:manage','Creator management','Manage approved creator workflows.','high'),
 ('audit:read','Audit history','Read administrator audit history.','high')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.minglora_admin_role_permissions(role_key,permission_key)
SELECT mapping.role_key, mapping.permission_key
FROM (VALUES
 ('super_administrator','platform:read'),('super_administrator','members:read'),('super_administrator','members:manage'),
 ('super_administrator','moderation:read'),('super_administrator','moderation:manage'),('super_administrator','verification:review'),
 ('super_administrator','support:read'),('super_administrator','support:manage'),('super_administrator','settings:read'),
 ('super_administrator','settings:manage'),('super_administrator','finance:read'),('super_administrator','finance:manage'),
 ('super_administrator','technical:read'),('super_administrator','technical:manage'),('super_administrator','security:read'),
 ('super_administrator','security:manage'),('super_administrator','content:read'),('super_administrator','content:manage'),
 ('super_administrator','creators:read'),('super_administrator','creators:manage'),('super_administrator','audit:read'),
 ('finance_administrator','finance:read'),('finance_administrator','finance:manage'),('finance_administrator','audit:read'),
 ('technical_administrator','technical:read'),('technical_administrator','technical:manage'),('technical_administrator','audit:read'),
 ('security_administrator','security:read'),('security_administrator','security:manage'),('security_administrator','audit:read'),
 ('content_administrator','content:read'),('content_administrator','content:manage'),('content_administrator','moderation:read'),('content_administrator','moderation:manage'),
 ('creator_manager','creators:read'),('creator_manager','creators:manage'),('creator_manager','verification:review'),('creator_manager','support:read'),
 ('support_administrator','support:read'),('support_administrator','support:manage'),('support_administrator','members:read'),
 ('read_only_auditor','platform:read'),('read_only_auditor','finance:read'),('read_only_auditor','security:read'),('read_only_auditor','technical:read'),('read_only_auditor','audit:read')
) AS mapping(role_key,permission_key)
ON CONFLICT DO NOTHING;

ALTER TABLE public.minglora_admin_role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_rbac_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.minglora_admin_role_definitions, public.minglora_admin_permission_catalog,
  public.minglora_admin_role_permissions, public.minglora_admin_rbac_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.minglora_admin_role_definitions, public.minglora_admin_permission_catalog,
  public.minglora_admin_role_permissions, public.minglora_admin_rbac_audit TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_admin_rbac_command(
  p_actor_user_id uuid,
  p_mfa_verified boolean,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_owner_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1';
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_email text;
  v_target_id uuid;
  v_role text;
  v_reason text;
  v_permissions text[];
  v_previous jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_staff public.minglora_platform_staff%ROWTYPE;
  v_user auth.users%ROWTYPE;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM v_owner_id OR p_mfa_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only the MFA-verified designated platform owner can manage administrator access.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.minglora_platform_staff owner_staff
    JOIN auth.users owner_auth ON owner_auth.id=owner_staff.user_id
    WHERE owner_staff.user_id=v_owner_id AND owner_staff.role='owner'
      AND owner_staff.active=true AND owner_staff.mfa_required=true
      AND 'platform:admin'=ANY(owner_staff.permissions)
      AND lower(owner_auth.email)='creatorhubcreatornetwork@gmail.com'
      AND owner_auth.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The designated Creator Hub owner record is not valid.' USING ERRCODE='42501';
  END IF;

  IF v_action='list' THEN
    RETURN jsonb_build_object(
      'staff',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'userId',s.user_id,'email',u.email,'username',p.username,
          'displayName',p.display_name,'role',s.role,'active',s.active,
          'mfaRequired',s.mfa_required,'permissions',to_jsonb(s.permissions),
          'updatedAt',s.updated_at
        ) ORDER BY (s.role='owner') DESC, s.created_at ASC)
        FROM public.minglora_platform_staff s
        JOIN auth.users u ON u.id=s.user_id
        LEFT JOIN public.profiles p ON p.id=s.user_id
      ),'[]'::jsonb),
      'roles',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'key',r.role_key,'name',r.display_name,'description',r.description,
          'assignable',r.assignable,'permissions',coalesce((
            SELECT jsonb_agg(rp.permission_key ORDER BY rp.permission_key)
            FROM public.minglora_admin_role_permissions rp WHERE rp.role_key=r.role_key
          ),'[]'::jsonb)
        ) ORDER BY r.display_name)
        FROM public.minglora_admin_role_definitions r
      ),'[]'::jsonb),
      'audit',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',a.id,'actorUserId',a.actor_user_id,'targetUserId',a.target_user_id,
          'action',a.action,'previousState',a.previous_state,'newState',a.new_state,
          'reason',a.reason,'createdAt',a.created_at
        ) ORDER BY a.created_at DESC)
        FROM (SELECT * FROM public.minglora_admin_rbac_audit ORDER BY created_at DESC LIMIT 50) a
      ),'[]'::jsonb)
    );
  END IF;

  v_email := lower(btrim(coalesce(p_payload->>'email','')));
  v_reason := btrim(coalesce(p_payload->>'reason',''));
  IF char_length(v_reason)<5 OR char_length(v_reason)>1000 THEN
    RAISE EXCEPTION 'Enter an administrative reason between 5 and 1000 characters.' USING ERRCODE='22023';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid account email address.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_user FROM auth.users
  WHERE lower(email)=v_email AND email_confirmed_at IS NOT NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No email-confirmed Minglora account was found for that address.' USING ERRCODE='P0002';
  END IF;
  v_target_id := v_user.id;
  IF v_target_id=v_owner_id THEN
    RAISE EXCEPTION 'Creator Hub is the protected sole platform owner.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_target_id) THEN
    RAISE EXCEPTION 'The verified account does not have a Minglora profile.' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_staff FROM public.minglora_platform_staff WHERE user_id=v_target_id;

  IF v_action='grant' THEN
    IF v_staff.user_id IS NOT NULL AND v_staff.role='owner' THEN
      RAISE EXCEPTION 'Existing owner staff assignments are protected from delegated-role changes.' USING ERRCODE='42501';
    END IF;
    v_role := lower(btrim(coalesce(p_payload->>'role','')));
    IF v_role='super_administrator' THEN
      RAISE EXCEPTION 'Super Administrator is reserved and cannot be assigned while Creator Hub is the sole owner.' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.minglora_admin_role_definitions WHERE role_key=v_role AND assignable=true) THEN
      RAISE EXCEPTION 'Choose an assignable administrator role.' USING ERRCODE='22023';
    END IF;
    SELECT coalesce(array_agg(permission_key ORDER BY permission_key),ARRAY[]::text[])
      INTO v_permissions FROM public.minglora_admin_role_permissions WHERE role_key=v_role;
    v_previous := CASE WHEN v_staff.user_id IS NULL THEN '{}'::jsonb ELSE
      jsonb_build_object('role',v_staff.role,'active',v_staff.active,'permissions',to_jsonb(v_staff.permissions)) END;
    INSERT INTO public.minglora_platform_staff(user_id,role,active,mfa_required,permissions,granted_reason,created_at,updated_at)
    VALUES(v_target_id,v_role,true,true,v_permissions,v_reason,now(),now())
    ON CONFLICT(user_id) DO UPDATE SET
      role=EXCLUDED.role,active=true,mfa_required=true,permissions=EXCLUDED.permissions,
      granted_reason=EXCLUDED.granted_reason,updated_at=now();
    v_new := jsonb_build_object('role',v_role,'active',true,'mfaRequired',true,'permissions',to_jsonb(v_permissions));
    INSERT INTO public.minglora_admin_rbac_audit(actor_user_id,target_user_id,action,previous_state,new_state,reason)
    VALUES(p_actor_user_id,v_target_id,'staff.granted',v_previous,v_new,v_reason);
    RETURN jsonb_build_object('ok',true,'action','staff.granted','targetUserId',v_target_id,'role',v_role,'permissions',to_jsonb(v_permissions));
  ELSIF v_action='revoke' THEN
    IF v_staff.user_id IS NULL THEN
      RAISE EXCEPTION 'That account does not have an administrator assignment.' USING ERRCODE='P0002';
    END IF;
    IF v_staff.role='owner' OR v_staff.user_id=v_owner_id THEN
      RAISE EXCEPTION 'The sole platform owner cannot be revoked.' USING ERRCODE='42501';
    END IF;
    v_previous := jsonb_build_object('role',v_staff.role,'active',v_staff.active,'permissions',to_jsonb(v_staff.permissions));
    UPDATE public.minglora_platform_staff SET active=false,permissions=ARRAY[]::text[],updated_at=now()
    WHERE user_id=v_target_id;
    v_new := jsonb_build_object('role',v_staff.role,'active',false,'permissions','[]'::jsonb);
    INSERT INTO public.minglora_admin_rbac_audit(actor_user_id,target_user_id,action,previous_state,new_state,reason)
    VALUES(p_actor_user_id,v_target_id,'staff.revoked',v_previous,v_new,v_reason);
    RETURN jsonb_build_object('ok',true,'action','staff.revoked','targetUserId',v_target_id);
  ELSE
    RAISE EXCEPTION 'Unsupported administrator permission action.' USING ERRCODE='22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.minglora_admin_rbac_command(uuid,boolean,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_rbac_command(uuid,boolean,text,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.prevent_minglora_admin_rbac_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $
BEGIN
  RAISE EXCEPTION 'Administrator permission audit records are append-only.' USING ERRCODE='42501';
END;
$;
REVOKE ALL ON FUNCTION public.prevent_minglora_admin_rbac_audit_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS minglora_admin_rbac_audit_append_only ON public.minglora_admin_rbac_audit;
CREATE TRIGGER minglora_admin_rbac_audit_append_only
BEFORE UPDATE OR DELETE ON public.minglora_admin_rbac_audit
FOR EACH ROW EXECUTE FUNCTION public.prevent_minglora_admin_rbac_audit_mutation();

COMMIT;
