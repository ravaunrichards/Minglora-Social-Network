import assert from 'node:assert/strict';
import fs from 'node:fs';
import testRunner from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261117110000_minglora_owner_admin_rbac.sql');
const marketplaceRoleMigration = read('../../supabase/migrations/20261119043000_minglora_admin_marketplace_manager_role.sql');
const edge = read('../../supabase/functions/minglora-runtime-state/index.ts');
const server = read('../../src/server.js');
const ui = read('../../public/admin-centre-rbac.js');
const admin = read('../../public/admin-centre.js');
const html = read('../../public/admin-centre.html');
const docs = read('../../docs/ADMIN_RBAC_FOUNDATION.md');

testRunner('RBAC migration preserves all existing staff assignments at installation', () => {
  assert.match(migration, /does not update, insert, deactivate, or promote any[\s\S]*existing minglora_platform_staff row/i);
  const installationSql = migration.split('CREATE OR REPLACE FUNCTION')[0];
  assert.doesNotMatch(installationSql, /UPDATE\s+public\.minglora_platform_staff/i);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS minglora_platform_staff_role_check/);
  assert.match(migration, /ADD CONSTRAINT minglora_platform_staff_role_check/);
});

testRunner('only the verified Creator Hub owner with MFA can invoke RBAC management', () => {
  assert.match(migration, /v_owner_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1'/);
  assert.match(migration, /p_mfa_verified IS DISTINCT FROM true/);
  assert.match(migration, /lower\(owner_auth\.email\)='creatorhubcreatornetwork@gmail\.com'/);
  assert.match(edge, /action === "admin_rbac_command"/);
  assert.match(edge, /actorUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" \|\| !mfaVerified/);
  assert.match(server, /p==='\/api\/admin\/rbac'/);
  assert.match(server, /!isDesignatedCreatorHubAdmin\(user\)\|\|!isModerator\(user,req\)\|\|!hasActiveReviewerSession\(user\)/);
});

testRunner('delegated grants require an existing email-confirmed profile and cannot create another owner', () => {
  assert.match(migration, /email_confirmed_at IS NOT NULL/);
  assert.match(migration, /FROM public\.profiles WHERE id=v_target_id/);
  assert.match(migration, /v_role='super_administrator'/);
  assert.match(migration, /Creator Hub is the protected sole platform owner/);
  assert.match(migration, /staff\.revoked/);
});

testRunner('RBAC audit is protected and records previous and new states', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.minglora_admin_rbac_audit/);
  assert.match(migration, /ALTER TABLE public\.minglora_admin_rbac_audit ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.minglora_admin_rbac_command/);
  assert.match(migration, /previous_state,new_state,reason/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.minglora_admin_rbac_audit/);
  assert.match(migration, /Administrator permission audit records are append-only/);
});

testRunner('Admin Centre loads the owner-only delegated roles workspace', () => {
  assert.match(html, /admin-centre-rbac\.js/);
  assert.match(html, /admin-centre-rbac\.css/);
  assert.match(admin, /key:'permissions'.*selector:'#admin-rbac-management'/);
  assert.match(admin, /MingloraAdminRbac\?\.mount\(panel, adminCentreApi\)/);
  assert.match(ui, /Protected sole owner/);
  assert.match(ui, /email-confirmed Minglora account/);
  assert.match(ui, /rbacAction:'revoke'/);
});


testRunner('RBAC append-only trigger function uses valid dollar-quoted SQL delimiters', () => {
  const triggerFunction = migration.split('CREATE OR REPLACE FUNCTION public.prevent_minglora_admin_rbac_audit_mutation()')[1] || '';
  assert.ok(triggerFunction.includes("SET search_path TO ''\nAS $$"));
  assert.ok(triggerFunction.includes("END;\n$$;"));
  assert.doesNotMatch(triggerFunction, /AS \$(?:\r?\n)/);
});

testRunner('delegated grants cannot demote any existing owner staff assignment', () => {
  const grantBranch = migration.split("IF v_action='grant' THEN")[1]?.split("ELSIF v_action='revoke' THEN")[0] || '';
  assert.match(grantBranch, /v_staff\.user_id IS NOT NULL AND v_staff\.role='owner'/);
  assert.match(grantBranch, /Existing owner staff assignments are protected from delegated-role changes/);
});

testRunner('Marketplace Manager is admin-only, audited by RBAC and reserved until route permissions are enforced', () => {
  // Keep the original migration immutable; the new role is an additive migration.
  assert.doesNotMatch(migration, /marketplace/i);
  assert.match(marketplaceRoleMigration, /marketplace_manager/);
  assert.match(marketplaceRoleMigration, /'Marketplace Manager'[\\s\\S]*?false/);
  assert.match(marketplaceRoleMigration, /marketplace:read/);
  assert.match(marketplaceRoleMigration, /marketplace:manage/);
  assert.match(marketplaceRoleMigration, /assignable=false/);
  assert.match(marketplaceRoleMigration, /does not re-enable the retired consumer-facing Marketplace/i);
  assert.match(marketplaceRoleMigration, /'brand_administrator'[\\s\\S]*?'brand_read_only'[\\s\\S]*?'marketplace_manager'/);
  assert.doesNotMatch(marketplaceRoleMigration, /INSERT INTO public\\.minglora_platform_staff/i);
  assert.doesNotMatch(marketplaceRoleMigration, /UPDATE\\s+public\\.minglora_platform_staff/i);
  assert.match(ui, /role\\.assignable===true/);
  assert.match(ui, /Reserved · not assignable/);
  assert.match(docs, /Marketplace Manager/);
  assert.match(docs, /does not restore, publish or enable the retired consumer-facing Marketplace/i);
});
