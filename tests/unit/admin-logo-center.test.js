import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = file => fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261118080000_minglora_admin_logo_center.sql");
const edge = read("supabase/functions/minglora-runtime-state/brand-center.ts");
const edgeEntry = read("supabase/functions/minglora-runtime-state/index.ts");
const api = read("src/admin-logo-center-api.js");
const server = read("src/server.js");
const adminPage = read("public/admin-centre.js");
const adminHtml = read("public/admin-centre.html");
const ui = read("public/admin-logo-center.js");
const css = read("public/admin-logo-center.css");
const manifest = read("public/brand-manifest.js");
const indexHtml = read("public/index.html");
const helpHtml = read("public/help-center.html");

test("Logo Center uses a dedicated private bucket and isolated relational tables", () => {
  assert.match(migration, /'minglora-brand-assets'\s*,\s*'minglora-brand-assets'\s*,\s*false/);
  for (const table of [
    "minglora_brand_logo_categories",
    "minglora_brand_logo_collections",
    "minglora_brand_logo_assets",
    "minglora_brand_logo_versions",
    "minglora_brand_logo_favorites",
    "minglora_brand_logo_assignments",
    "minglora_brand_logo_schedules",
    "minglora_brand_logo_upload_sessions",
    "minglora_brand_identity_settings",
    "minglora_brand_logo_approval_records",
    "minglora_brand_deployment_history",
    "minglora_brand_logo_activity_logs"
  ]) assert.match(migration, new RegExp("CREATE TABLE IF NOT EXISTS public\\." + table));
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.minglora_brand_logo_categories/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /prevent_minglora_brand_audit_mutation/);
});

test("all requested standard logo categories and the empty Enigma collection are seeded", () => {
  const categories = [
    "primary-logos","secondary-logos","alternative-logos","symbol-logos","wordmarks",
    "lettermarks","emblem-logos","minimalist-logos","abstract-logos","geometric-logos",
    "3d-logos","metallic-logos","gold-logos","silver-logos","chrome-logos","gradient-logos",
    "animated-logos","monochrome-logos","black-logos","white-logos","transparent-logos",
    "flat-logos","outline-logos","vintage-logos","premium-logos","special-edition-logos",
    "seasonal-logos","anniversary-logos","promotional-logos","experimental-logos",
    "favicon-logos","application-icons","social-media-logos","watermark-logos"
  ];
  for (const slug of categories) assert.ok(migration.includes("('" + slug + "'"), "missing category " + slug);
  assert.match(migration, /'enigma-branding','Enigma Branding'/);
  assert.doesNotMatch(migration, /INSERT INTO public\.minglora_brand_logo_assets/);
});

test("original files use immutable version paths and pending uploads are owner-bound", () => {
  assert.match(migration, /owner\/'||v_actor::text\|\|'\/'\|\|v_asset_id::text\|\|'\/'\|\|v_version_id::text/);
  assert.match(migration, /UNIQUE\(asset_id, version_number\)/);
  assert.match(migration, /actor_user_id uuid NOT NULL REFERENCES auth\.users\(id\)/);
  assert.match(migration, /status='pending' AND s\.expires_at>now\(\)/);
  assert.match(migration, /approved_version_id uuid/);
  assert.match(migration, /approved_version_id=v_version_id/);
  assert.match(migration, /approved_version_id=v_row\.version_id/);
  assert.match(migration, /status=CASE WHEN status IN \('approved','active'\) THEN status ELSE 'draft' END/);
});

test("the SQL command requires the designated MFA-verified owner and service role", () => {
  assert.match(migration, /coalesce\(auth\.role\(\),''\) <> 'service_role'/);
  assert.match(migration, /5b998c21-86b5-4621-ab37-e0808a2657b1/);
  assert.match(migration, /p_mfa_verified IS DISTINCT FROM true/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.minglora_admin_brand_command/);
  assert.match(api, /isDesignatedCreatorHubAdmin\(user\)/);
  assert.match(api, /hasActiveReviewerSession\(user\)/);
  assert.match(api, /isSameOriginApiWrite\(req\)/);
  assert.ok(api.startsWith('import crypto from "node:crypto";'));
});

test("Logo Center routing is handled before generic authentication and the public manifest is read-only", () => {
  const routeHook = server.indexOf("if (await handleAdminLogoCenterApi({");
  const authBoundary = server.indexOf("requireAuth(user);", server.indexOf("p==='/api/auth/me'"));
  assert.ok(routeHook > 0 && routeHook < authBoundary);
  assert.match(server, /handleAdminLogoCenterApi/);
  assert.match(edgeEntry, /handleBrandRuntimeAction/);
  assert.match(edgeEntry, /"admin_brand_command"/);
  assert.match(edgeEntry, /"brand_public_manifest"/);
  assert.match(edge, /action==="brand_public_manifest"/);
  assert.match(edge, /createSignedUrl/);
});

test("signed uploads are restricted to approved MIME types and validated against file contents", () => {
  for (const mime of [
    "image/svg+xml","image/png","image/apng","image/jpeg","image/webp","image/gif",
    "image/vnd.microsoft.icon","image/x-icon","application/json","video/mp4","video/webm"
  ]) {
    assert.ok(edge.includes('"' + mime + '"'), "missing MIME type " + mime);
  }
  assert.match(edge, /createSignedUploadUrl/);
  assert.match(edge, /isBrandSignatureValid/);
  assert.match(edge, /image\/png"\|\|mimeType==="image\/apng/);
  assert.match(edge, /The uploaded logo's size or content type does not match/);
  assert.match(edge, /owner\/"\+actorUserId/);
});

test("Admin Centre links the Logo Center only after the existing owner access gate", () => {
  assert.match(adminPage, /key:'logo-center',title:'Logo Center & Brand Identity'/);
  assert.match(adminPage, /group:'Brand Identity'/);
  assert.match(adminPage, /MingloraAdminLogoCenter\?\.mount\(panel, adminCentreApi\)/);
  assert.match(adminHtml, /admin-logo-center\.css/);
  assert.match(adminHtml, /admin-logo-center\.js/);
  assert.match(adminHtml, /brand-manifest\.js/);
});

test("the working Logo Center UI supports library, uploads, classification, approval, placement and identity", () => {
  for (const value of [
    "Overview","Logo Library","Upload","Collections & Categories","Placements",
    "Brand Identity","Scheduling","Activity & History",
    "upload/prepare","upload/complete","asset_approve","assignment_set",
    "assignment_publish","assignment_rollback","identity_update","schedule_create","schedule_cancel"
  ]) assert.ok(ui.includes(value), "missing UI workflow " + value);
  assert.match(ui, /state\.data\?\.assets/);
  assert.match(ui, /No demo assets|No uploaded logos yet/);
  assert.match(ui, /New version/);
  assert.match(ui, /approved_version_id===x\.current_version_id/);
});

test("brand manifest only applies published secure image URLs and leaves existing branding intact on errors", () => {
  assert.match(manifest, /fetch\("\/api\/brand\/manifest"/);
  assert.match(manifest, /\.brand-logo-img/);
  assert.match(manifest, /https:\\\/\\\//);
  assert.match(manifest, /if \(!response\.ok\) return/);
  assert.match(manifest, /existing, verified source branding unchanged/);
  assert.match(indexHtml, /brand-manifest\.js/);
  assert.match(helpHtml, /brand-manifest\.js/);
});

test("Logo Center layout adapts to tablet and phone widths", () => {
  assert.match(css, /@media\(max-width:1000px\)/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /overflow-x:auto/);
});
