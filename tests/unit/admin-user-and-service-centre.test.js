import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, server, admin, css, html] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/server.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8")
]);

test("Minglora Admin Centre exposes the full Supabase-style member manager", () => {
  for (const id of ["admin-user-create-form", "admin-user-search", "admin-user-page-next", "admin-user-edit-form", "admin-user-revoke-sessions", "admin-user-delete-submit"]) {
    assert.ok(admin.includes('id="' + id + '"'), "missing account control: " + id);
  }
  for (const name of ["admin_user_get", "admin_user_create", "admin_user_update", "admin_user_delete", "admin_user_revoke_sessions"]) assert.ok(runtime.includes(name));
  assert.match(css, /admin-user-edit-grid/);
  assert.match(css, /admin-user-pagination/);
});

test("member CRUD and session routes require owner identity, MFA and same-origin writes", () => {
  for (const name of ["admin_user_get", "admin_user_create", "admin_user_update", "admin_user_delete", "admin_user_revoke_sessions"]) assert.ok(runtime.includes('"' + name + '"'));
  assert.match(server, /isSameOriginApiWrite\(req\)/);
  assert.match(server, /hasActiveReviewerSession\(user\)/);
  assert.match(server, /isDesignatedCreatorHubAdmin\(user\)/);
  assert.match(runtime, /adminActorAllowed/);
  assert.match(runtime, /userId === actorUserId/);
  assert.match(runtime, /The platform owner is protected/);
});

test("member updates use server-side Auth admin operations and audit changed fields", () => {
  assert.match(runtime, /admin\.auth\.admin\.updateUserById/);
  assert.match(runtime, /admin\.auth\.admin\.createUser/);
  assert.match(runtime, /admin\.auth\.admin\.deleteUser/);
  assert.match(runtime, /changedFields/);
  assert.doesNotMatch(runtime, /app_metadata:\s*patch/);
  assert.match(runtime, /recordAdminUserAction/);
});

test("service connections show Minglora providers without returning secrets", () => {
  assert.match(server, /\/api\/admin\/integrations/);
  for (const provider of ["Supabase", "Render", "GitHub", "LiveKit", "PayPal", "Tenor", "SIX Group", "Frankfurter"]) {
    assert.ok(server.includes("name:'" + provider + "'"), "missing service card: " + provider);
  }
  assert.match(server, /WEB_PUSH_PRIVATE_KEY/);
  assert.match(server, /paypalToken\(\)/);
  assert.match(server, /verifyLiveKitConnection/);
  assert.match(admin, /initializeAdminServiceConnections/);
  assert.match(admin, /Open provider dashboard/);
  assert.match(html, /admin-user-service-centre-1/);
  assert.match(css, /admin-service-connections-grid/);
});
