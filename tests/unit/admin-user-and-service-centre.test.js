import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, server, admin, css, html, store, authProviders] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/server.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/store.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/auth-providers-admin.js", import.meta.url), "utf8")
]);

test("Minglora Admin Centre exposes the full Supabase-style member manager", () => {
  for (const id of ["admin-user-create-form", "admin-user-search", "admin-user-page-next", "admin-user-edit-form", "admin-user-revoke-sessions", "admin-user-delete-submit"]) {
    assert.ok(admin.includes('id="' + id + '"'), "missing account control: " + id);
  }
  for (const name of ["admin_user_get", "admin_user_create", "admin_user_update", "admin_user_delete", "admin_user_revoke_sessions"]) assert.ok(runtime.includes(name));
  assert.match(css, /admin-user-edit-grid/);
  assert.match(css, /admin-user-pagination/);
});

test("new account creation requires profile fields that the live schema marks NOT NULL", () => {
  assert.ok(admin.includes('id="admin-user-create-name" name="displayName" maxlength="80" minlength="2" autocomplete="name" required'));
  assert.ok(admin.includes('id="admin-user-create-username" name="username" maxlength="30" required'));
  assert.ok(runtime.includes('if (displayName.length < 2) return json(400'));
  assert.ok(runtime.includes('if (!username) return json(400'));
  assert.ok(runtime.includes('if (usernameOwner) return json(409, { error: "That username is already in use." })'));
  assert.ok(runtime.includes('.eq("username", username)'), "create lookup is case-insensitive");
  const usernameLookup = runtime.indexOf('const { data: usernameOwner');
  const authCreate = runtime.indexOf('admin.auth.admin.createUser');
  assert.ok(usernameLookup >= 0 && usernameLookup < authCreate, "username availability is checked before creating an Auth identity");
});

test("member create, session-revocation and delete UI disclose missing audit confirmation", () => {
  assert.ok(admin.includes("the account was created, but the administrator audit entry could not be confirmed"));
  assert.ok(admin.includes("result.auditRecorded === false ? ' Warning: the administrator audit entry could not be confirmed."));
  assert.ok(admin.includes("result.auditRecorded === false ? ' Warning: the administrator audit entry could not be confirmed.' : '') + (result.warning"));
});

test("member edits enforce required display name and unique case-insensitive username", () => {
  assert.ok(admin.includes('id="admin-user-edit-name" name="displayName" maxlength="80" minlength="2" required'));
  assert.ok(admin.includes('id="admin-user-edit-username" name="username" maxlength="30" required pattern="[a-z0-9_]{3,30}"'));
  assert.ok(runtime.includes('if (value.length < 2) return json(400, { error: "Display name must contain at least 2 characters." })'));
  assert.ok(runtime.includes('if (!/^[a-z0-9_]{3,30}$/.test(value)) return json(400'));
  assert.ok(runtime.includes('.eq("username", value).neq("id", userId).maybeSingle()'));
  assert.ok(runtime.includes('if (usernameOwner) return json(409, { error: "That username is already in use." })'));
});

test("partial member edits preserve and disclose the server's partial-update result", () => {
  assert.match(store, /if \(payload\.partial === true\) error\.partial = true/);
  assert.match(server, /if \(e\.partial === true\) failure\.partial = true/);
  assert.ok(admin.includes("error.payload = payload"));
  assert.ok(admin.includes("if (error?.payload?.partial)"));
  assert.ok(admin.includes("Partial update: Minglora profile changes were saved, but Supabase Auth changes failed."));
  assert.ok(admin.includes("await loadAdminUserDetails(panel, member.id)"));
  assert.ok(admin.includes("await loadAdminManagedUsers(panel)"));
});

test("member contact and location fields respect live profile constraints", () => {
  assert.ok(admin.includes('id="admin-user-edit-country" name="country" maxlength="100"'));
  assert.ok(admin.includes('id="admin-user-edit-parish" name="parish" maxlength="100"'));
  assert.ok(runtime.includes('if (contactPhone && !/^\\+[1-9]\\d{7,14}$/.test(contactPhone))'));
  assert.ok(runtime.includes('if (value && !/^\\+[1-9]\\d{7,14}$/.test(value))'));
  assert.ok(runtime.includes('["country", "county", "parish", "city"].includes(field) ? 100'));
  assert.ok(runtime.includes('["gender", "relationshipStatus"].includes(field) ? 80'));
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

test("deletion errors disclose whether the failed-attempt audit was recorded", () => {
  assert.ok(admin.includes("error?.payload?.auditRecorded === false"));
  assert.ok(admin.includes("the failed deletion audit entry could not be confirmed"));
  assert.ok(admin.includes("The failed deletion attempt was recorded in the administrator audit log"));
});

test("account deletion is audited as failed or successful only after the delete result", () => {
  const start = runtime.indexOf('if (action === "admin_user_delete")');
  const end = runtime.indexOf('if (action === "admin_user_revoke_sessions")', start);
  assert.ok(start >= 0 && end > start);
  const deletion = runtime.slice(start, end);
  const deleteCall = deletion.indexOf("admin.auth.admin.deleteUser(userId)");
  const failedAudit = deletion.indexOf('recordAdminUserAction(actorUserId, userId, "account.delete_failed"');
  const successAudit = deletion.indexOf('recordAdminUserAction(actorUserId, userId, "account.delete"');
  assert.ok(deleteCall >= 0 && failedAudit > deleteCall && successAudit > failedAudit);
  assert.match(deletion, /outcome: "rejected"/);
  assert.match(deletion, /outcome: "deleted"/);
});

test("local-only session revocation is audited when no Supabase token is available", () => {
  const start = runtime.indexOf('if (action === "admin_user_revoke_sessions")');
  const end = runtime.indexOf('if (action === "admin_user_set_ban")', start);
  assert.ok(start >= 0 && end > start);
  const revoke = runtime.slice(start, end);
  assert.match(revoke, /targetJwt\.length < 20/);
  assert.match(revoke, /recordAdminUserAction\(actorUserId, userId, "account\.sessions_revoke"/);
  assert.match(revoke, /scope: "application_only"/);
  assert.match(revoke, /providerRefreshTokensRevoked: false/);
  assert.match(revoke, /sessionRevoked: false/);
});

test("member updates use server-side Auth admin operations and audit changed fields", () => {
  assert.match(runtime, /admin\.auth\.admin\.updateUserById/);
  assert.match(runtime, /admin\.auth\.admin\.createUser/);
  assert.match(runtime, /admin\.auth\.admin\.deleteUser/);
  assert.match(runtime, /changedFields/);
  assert.doesNotMatch(runtime, /app_metadata:\s*patch/);
  assert.match(runtime, /recordAdminUserAction/);
});

test("Auth provider settings require owner MFA and same-origin provider writes", () => {
  const start = server.indexOf("if((method==='GET'||method==='PATCH')&&p==='/api/admin/auth-providers')");
  const end = server.indexOf("if(method==='GET'&&p==='/api/admin/users')", start);
  assert.ok(start >= 0 && end > start, "Auth provider route is present");
  const route = server.slice(start, end);
  assert.match(route, /method==='PATCH'&&!isSameOriginApiWrite\(req\)/);
  assert.match(route, /isDesignatedCreatorHubAdmin\(user\)/);
  assert.match(route, /isModerator\(user,req\)/);
  assert.match(route, /hasActiveReviewerSession\(user\)/);
  assert.match(route, /SUPABASE_ACCESS_TOKEN/);
  assert.match(route, /Authorization:'Bearer '\+managementToken/);
  assert.doesNotMatch(route, /return json\(res,200,\{[^}]*managementToken/);
  assert.ok(html.includes('/auth-providers-admin.js?v=20261109-auth-providers-1'));
  assert.ok(authProviders.includes("api('PATCH',{provider,enabled:toggle.checked})"));
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
