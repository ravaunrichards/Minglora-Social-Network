BEGIN;

-- Add the Admin-only Marketplace Manager role to the existing owner-controlled
-- RBAC catalogue. This does not re-enable the retired consumer-facing Marketplace.
-- The role remains non-assignable until every back-office Marketplace API action
-- is individually protected by marketplace:read / marketplace:manage checks.

ALTER TABLE public.minglora_platform_staff
  DROP CONSTRAINT IF EXISTS minglora_platform_staff_role_check;

ALTER TABLE public.minglora_platform_staff
  ADD CONSTRAINT minglora_platform_staff_role_check
  CHECK (role = ANY (ARRAY[
    'owner','admin','moderator','reviewer',
    'super_administrator','finance_administrator','technical_administrator',
    'security_administrator','content_administrator','creator_manager',
    'support_administrator','read_only_auditor',
    'brand_administrator','brand_asset_uploader','brand_asset_editor',
    'brand_approval_manager','brand_publisher','brand_read_only',
    'marketplace_manager'
  ]::text[]));

INSERT INTO public.minglora_admin_permission_catalog(
  permission_key,display_name,description,risk_level
) VALUES
  ('marketplace:read','Marketplace administration view',
   'Read permitted seller, listing, order, refund and dispute records in the private Admin Centre only. Does not expose or enable a consumer Marketplace.','high'),
  ('marketplace:manage','Marketplace administration actions',
   'Perform explicitly authorized back-office seller, order, refund and dispute operations after route-level permission checks. Does not grant payment execution or enable a consumer Marketplace.','critical')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.minglora_admin_role_definitions(
  role_key,display_name,description,assignable
) VALUES (
  'marketplace_manager',
  'Marketplace Manager',
  'Reserved Admin-only Marketplace role. Assignment remains disabled until every back-office Marketplace route and action enforces its dedicated permissions. Never enables the retired consumer-facing Marketplace.',
  false
)
ON CONFLICT (role_key) DO UPDATE
SET display_name=EXCLUDED.display_name,
    description=EXCLUDED.description,
    assignable=false;

INSERT INTO public.minglora_admin_role_permissions(role_key,permission_key)
VALUES
  ('marketplace_manager','marketplace:read'),
  ('marketplace_manager','marketplace:manage')
ON CONFLICT (role_key,permission_key) DO NOTHING;

COMMIT;
