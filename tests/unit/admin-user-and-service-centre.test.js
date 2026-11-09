import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, server, admin, css, html, store, authProviders, authProviderCss] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/server.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/store.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/auth-providers-admin.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/auth-providers-admin.css", import.meta.url), "utf8")
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

test("ban and unban routes enforce owner MFA, same-origin writes and owner protection", () => {
  const routeStart = server.indexOf("const adminAccountActionMatch=");
  const routeEnd = server.indexOf("if(method==='GET'&&p==='/api/admin/audit-log')", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.ok(route.includes("isSameOriginApiWrite(req)"));
  assert.ok(route.includes("isDesignatedCreatorHubAdmin(user)"));
  assert.ok(route.includes("isModerator(user,req)"));
  assert.ok(route.includes("hasActiveReviewerSession(user)"));
  assert.ok(route.includes("targetId===CREATOR_HUB_ADMIN_USER_ID"));
  assert.ok(route.includes("new Set(['1h','24h','7d','30d','90d','876000h'])"));
  assert.ok(route.includes("requestSupabaseState('admin_user_set_ban'"));
  assert.ok(route.includes("await saveStore()"));
  const actionStart = runtime.indexOf('if (action === "admin_user_set_ban")');
  const actionEnd = runtime.indexOf('if (action === "admin_audit_log")', actionStart);
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  const action = runtime.slice(actionStart, actionEnd);
  assert.ok(action.includes('actorUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1"'));
  assert.ok(action.includes('userId === actorUserId'));
  assert.ok(action.includes('admin.auth.admin.updateUserById(userId, attributes'));
  assert.ok(action.includes('action: auditAction'));
  assert.ok(action.includes("auditRecorded: !auditError"));
});

test("deletion errors disclose whether the failed-attempt audit was recorded", () => {
  assert.ok(admin.includes("error?.payload?.auditRecorded === false"));
  assert.ok(admin.includes("the failed deletion audit entry could not be confirmed"));
  assert.ok(admin.includes("The failed deletion attempt was recorded in the administrator audit log"));
});

test("failed provider session revocation is audited and the UI discloses audit status", () => {
  const start = runtime.indexOf('if (action === "admin_user_revoke_sessions")');
  const end = runtime.indexOf('if (action === "admin_user_set_ban")', start);
  assert.ok(start >= 0 && end > start);
  const revoke = runtime.slice(start, end);
  const signOut = revoke.indexOf('admin.auth.admin.signOut(targetJwt, "global")');
  const failedAudit = revoke.indexOf('recordAdminUserAction(actorUserId, userId, "account.sessions_revoke_failed"');
  assert.ok(signOut >= 0 && failedAudit > signOut);
  assert.match(revoke, /scope: "global"/);
  assert.match(revoke, /outcome: "rejected"/);
  assert.match(revoke, /auditRecorded/);
  assert.ok(admin.includes("error?.payload?.auditRecorded === false"));
  assert.ok(admin.includes("the failed session-revocation audit entry could not be confirmed"));
  assert.ok(admin.includes("The failed session-revocation attempt was recorded in the administrator audit log"));
});

test("the account-delete API returns failure status when Supabase Auth rejects deletion", () => {
  const start = server.indexOf("if(method==='DELETE'&&adminUserIdMatch){");
  const end = server.indexOf("const adminRevokeSessionMatch", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /if\(result\.deleted\)\{/);
  assert.match(route, /return json\(res,result\.deleted\?200:409,result\)/);
  assert.ok(route.indexOf("await saveStore()") < route.indexOf("return json(res,result.deleted?200:409,result)"));
  assert.ok(admin.includes("Supabase Auth account deleted."));
  assert.ok(admin.includes("const sessionWarning = error?.payload?.warning"));
});

test("failed account deletion discloses both session and audit outcomes", () => {
  const start = runtime.indexOf('if (action === "admin_user_delete")');
  const end = runtime.indexOf('if (action === "admin_user_revoke_sessions")', start);
  assert.ok(start >= 0 && end > start);
  const deletion = runtime.slice(start, end);
  const failedResponse = deletion.slice(deletion.indexOf("if (deleteError)"), deletion.indexOf("const auditRecorded = await recordAdminUserAction(actorUserId, userId, \"account.delete\""));
  assert.match(failedResponse, /sessionRevoked: providerRefreshTokensRevoked/);
  assert.match(failedResponse, /warning/);
  assert.match(failedResponse, /No current Supabase access token was available/);
  assert.match(failedResponse, /Supabase refresh-token sessions were globally revoked/);
  assert.ok(admin.includes("error?.payload?.warning"));
});

test("account deletion is audited as failed or successful only after the delete result", () => {
  const start = runtime.indexOf('if (action === "admin_user_delete")');
  const end = runtime.indexOf('if (action === "admin_user_revoke_sessions")', start);
  assert.ok(start >= 0 && end > start);
  const deletion = runtime.slice(start, end);
  const revokeCall = deletion.indexOf('admin.auth.admin.signOut(targetJwt, "global")');
  const deleteCall = deletion.indexOf("admin.auth.admin.deleteUser(userId)");
  const failedAudit = deletion.indexOf('recordAdminUserAction(actorUserId, userId, "account.delete_failed"');
  const successAudit = deletion.indexOf('recordAdminUserAction(actorUserId, userId, "account.delete"');
  assert.ok(revokeCall >= 0 && deleteCall > revokeCall && failedAudit > deleteCall && successAudit > failedAudit);
  assert.match(deletion, /outcome: "rejected"/);
  assert.match(deletion, /outcome: "deleted"/);
  assert.match(deletion, /providerRefreshTokensRevoked/);
  assert.match(server, /targetJwt=targetAuth\.access_token/);
  assert.match(server, /reason:input\.reason,targetJwt/);
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

test("Admin Centre content stays visible and reflows without clipping, sticky overlays or nested scroll panels", () => {
  assert.match(css, /\.admin-control-centre-page\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.admin-control-centre-page\s*>\s*section\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.admin-control-centre-page\s*>\s*\.admin-control-centre-grid\s*\{[^}]*grid-column:\s*2/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?\.admin-control-centre-page\s*>\s*\.admin-control-centre-grid\s*\{grid-column:1\}/);
  const desktopShortcutRule = css.lastIndexOf(".admin-control-centre-page > .admin-control-centre-grid{\n  grid-column:2;");
  const mobileShortcutRule = css.lastIndexOf(".admin-control-centre-page > .admin-control-centre-grid{grid-column:1}");
  assert.ok(desktopShortcutRule >= 0 && mobileShortcutRule > desktopShortcutRule,
    "the narrow-screen shortcut-grid placement must override the later desktop rule");
  assert.doesNotMatch(css, /\.admin-centre-navigation\s*\{[^}]*position:\s*sticky/);
  assert.doesNotMatch(css, /\.admin-centre-navigation\s*\{[^}]*overflow:\s*auto/);
  assert.doesNotMatch(css, /\.admin-centre-navigation\s*\{[^}]*max-height:\s*calc/);
  assert.match(css, /\.admin-centre-navigation\s*\{[^}]*position:\s*static/);
  assert.match(css, /\.admin-internal-activity-feed\s*\{[^}]*max-height:\s*none;overflow:\s*visible/);
  assert.match(css, /#admin-promotional-gift-fund-history\s*\{[^}]*min-width:\s*0/);
  assert.doesNotMatch(css, /#admin-promotional-gift-fund-history\s*\{[^}]*max-height:\s*\d+px|#admin-promotional-gift-fund-history\s*\{[^}]*overflow:\s*auto/);
  assert.match(css, /\.admin-internal-activity-list-wrap\s*\{[^}]*min-width:\s*0/);
  const resultCopy = css.match(/\.admin-user-result-copy strong,\s*\.admin-user-result-copy small\s*\{([^}]*)\}/);
  assert.ok(resultCopy, "member identity text rules exist");
  assert.doesNotMatch(resultCopy[1], /overflow:\s*hidden|text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.match(resultCopy[1], /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.admin-control-centre-status\{[^}]*white-space:normal;overflow-wrap:anywhere\}/);
  assert.match(css, /\.admin-user-status,[\s\S]*?white-space:normal/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?\.admin-centre-navigation\s*\{[^}]*display:\s*grid/);
  assert.match(css, /@media\(max-width:560px\)\s*\{\s*\.admin-centre-navigation\s*\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(authProviderCss, /@media\(max-width:620px\)\s*\{\.admin-auth-provider-grid\s*\{grid-template-columns:1fr/);
  assert.match(css, /\.admin-control-centre-page button,[\s\S]*?max-width:\s*100%;/);
  assert.doesNotMatch(css, /position:\s*(?:fixed|sticky)\b/, "Admin Centre styles must not create fixed or sticky overlays");
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis\b/, "Admin Centre content must not be ellipsized");
  const clippedBlocks = [...css.matchAll(/([^{}]+)\{([^{}]*\boverflow:\s*hidden\b[^{}]*)\}/g)];
  assert.equal(clippedBlocks.length, 1, "only the circular member avatar may crop overflow");
  assert.match(clippedBlocks[0][1], /\.admin-user-result-avatar/);
  assert.match(css, /\.admin-internal-activity-row time,\s*#admin-withdrawal-tracker-updated,\s*\.admin-platform-module-card-heading>strong,\s*\.admin-member-promotion-amount\s*\{[^}]*overflow-wrap:\s*anywhere;\s*white-space:\s*normal;/);
});

test("service connections show Minglora providers without returning secrets", () => {
  assert.match(server, /\/api\/admin\/integrations/);
  for (const provider of ["Supabase", "Supabase Management API", "Render", "GitHub", "LiveKit", "PayPal", "Tenor", "SIX Group", "Frankfurter"]) {
    assert.ok(server.includes("name:'" + provider + "'"), "missing service card: " + provider);
  }
  assert.match(server, /const supabaseManagementToken=String\(process\.env\.SUPABASE_ACCESS_TOKEN/);
  assert.match(server, /Authorization:'Bearer '\+supabaseManagementToken/);
  assert.match(server, /api\.supabase\.com\/v1\/projects\/gzycobgbasnqqhnympkr\/config\/auth/);
  assert.match(server, /Auth Config Read-write plus Project Settings Read-write/);
  assert.match(server, /token value remains server-only/);
  const managementStart = server.indexOf("const supabaseManagementCheck=");
  const managementEnd = server.indexOf("const [githubResponse", managementStart);
  assert.ok(managementStart >= 0 && managementEnd > managementStart);
  const managementProbe = server.slice(managementStart, managementEnd);
  assert.match(managementProbe, /AbortSignal\.timeout\(4500\)/);
  assert.doesNotMatch(managementProbe, /response\.(json|text)\(/);
  assert.match(server, /status:supabaseManagement\?\.ok\?'connected':supabaseManagementToken\?'attention':'not-configured'/);
  assert.ok(server.includes("supabaseManagement.status===401"));
  assert.ok(server.includes("supabaseManagement.status===403"));
  assert.ok(server.includes("supabaseManagement.status===0"));
  assert.match(server, /WEB_PUSH_PRIVATE_KEY/);
  assert.match(server, /paypalToken\(\)/);
  assert.match(server, /verifyLiveKitConnection/);
  assert.match(admin, /initializeAdminServiceConnections/);
  assert.match(admin, /Open provider dashboard/);
  assert.match(html, /admin-user-service-centre-1/);
  assert.match(css, /admin-service-connections-grid/);
});

test("administrator audit history filters and displays member CRUD and session operations safely", () => {
  const actions = [
    "account.create", "account.update", "account.delete", "account.delete_failed",
    "account.sessions_revoke", "account.sessions_revoke_failed", "account.ban", "account.unban"
  ];
  for (const action of actions) {
    assert.ok(server.includes("'" + action + "'"), "server allows audit filter " + action);
    assert.ok(runtime.includes('"' + action + '"'), "runtime allows audit filter " + action);
    assert.ok(admin.includes("'" + action + "'") || admin.includes('"' + action + '"'), "Admin Centre exposes audit filter " + action);
  }
  for (const field of ["changedFields", "profileFields", "emailProvided", "phoneProvided", "deletionMode", "outcome", "scope", "providerRefreshTokensRevoked"]) {
    assert.ok(runtime.includes(field + ":"), "runtime returns allowlisted audit metadata " + field);
  }
  for (const label of ["Member account created", "Member account updated", "Member account deleted", "Member sessions revoked", "Member session revocation failed"]) {
    assert.ok(admin.includes(label), "Admin Centre labels audit event " + label);
  }
  assert.ok(admin.includes("Profile fields: "));
  assert.ok(admin.includes("Changed: "));
  assert.ok(admin.includes("password reset"));
  const projectionStart = runtime.indexOf("const records = rows.map");
  const projectionEnd = runtime.indexOf("return json(200,{records,count:records.length,limit});", projectionStart);
  assert.ok(projectionStart >= 0 && projectionEnd > projectionStart, "audit response uses an explicit metadata projection");
  const projection = runtime.slice(projectionStart, projectionEnd);
  assert.doesNotMatch(projection, /\.\.\.metadata/, "raw audit metadata must never be spread into the browser response");
  for (const secret of ["password", "access_token", "refresh_token", "sessionRevokeError", "providerSecret"]) {
    assert.doesNotMatch(projection, new RegExp(secret, "i"), "audit response must not expose " + secret);
  }
  assert.match(runtime, /metadata\.changedFields/);
  assert.match(runtime, /metadata\.profileFields/);
});
