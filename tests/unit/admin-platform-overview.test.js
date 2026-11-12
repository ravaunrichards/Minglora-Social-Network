import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, admin, css, html, store, index, serviceWorker, app, sidebar, server, profileCss] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/store.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/sidebar-features.js", import.meta.url), "utf8"),
  readFile(new URL("../../src/server.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-profile-layout.css", import.meta.url), "utf8")
]);

test("runtime gateway accepts the audit action called by the owner dashboard", () => {
  assert.match(runtime, /"admin_users_list",\s*"admin_user_set_ban",\s*"admin_audit_log"/);
  assert.match(runtime, /if \(action === "admin_audit_log"\)/);
});

test("owner platform overview inventories every active runtime collection exactly once", () => {
  const collectionBlock = store.match(/const COLLECTIONS = \[([\s\S]*?)\n\];/);
  assert.ok(collectionBlock, "active runtime collection list exists");
  const active = [...collectionBlock[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
  const mapped = [...runtime.matchAll(/"key":\s*"([^"]+)"/g)].map(match => match[1]);
  assert.ok(active.length > 0);
  assert.equal(mapped.length, active.length);
  assert.equal(new Set(mapped).size, mapped.length);
  assert.deepEqual(mapped.sort(), active);
  assert.match(runtime, /trackedCollections/);
  assert.match(runtime, /totalStoredRecords/);
  assert.match(runtime, /\"id\": \"ai-bots\"/);
  for (const key of [
    'personalAiBotCategories','personalAiBots','personalAiBotTasks','personalAiBotAudit',
    'personalAiBotSettings','personalAiBotFollows','personalAiBotTeams','personalAiBotTeamMembers',
    'personalAiBotTeamHandoffs','personalAiBotSchedules','personalAiBotPersonaVersions',
    'personalAiBotLanguageSettings','personalAiBotLanguageEvaluationSets','personalAiCreatorDrafts'
  ]) assert.ok(mapped.includes(key), key+' is inventoried');
});

test("Admin Centre preserves the existing full platform workspace", () => {
  assert.match(admin, /id="admin-platform-overview"/);
  assert.match(admin, /href="#admin-platform-overview"/);
  assert.match(admin, /id="admin-platform-module-grid"/);
  assert.match(admin, /module\.collections/);
  assert.match(admin, /Active sessions/);
  assert.match(admin, /private message contents/i);
  assert.match(css, /admin-platform-module-grid/);
  assert.match(css, /admin-platform-collection-row/);
  assert.match(html, /Minglora — Admin Centre/);
  const stylesheet=html.match(/href="(\/admin-centre\.css\?v=[^"]+)"/)?.[1];
  const controller=html.match(/src="(\/admin-centre\.js\?v=[^"]+)"/)?.[1];
  assert.ok(stylesheet,'Admin Centre stylesheet is versioned');
  assert.ok(controller,'Admin Centre controller is versioned');
  assert.ok(stylesheet.includes('v=')&&controller.includes('v='));
});

test("Admin Centre is a standalone left-rail feature immediately below Profile", () => {
  const profileIndex = index.indexOf('id="rail-profile"');
  const adminIndex = index.indexOf('id="admin-centre-sidebar-link"');
  const metaAiIndex = index.indexOf('href="https://www.meta.ai/"');
  assert.ok(profileIndex >= 0 && adminIndex > profileIndex && metaAiIndex > adminIndex);
  assert.match(index, /id="admin-centre-sidebar-link"[^>]*href="\/admin-centre\.html"/);
  assert.match(index, /rail-link-admin-centre hidden/);
  assert.match(index, /#privacy/);
  assert.match(sidebar, /fetch\('\/api\/admin\/access'/);
  assert.match(sidebar, /access\.canAccess === true \|\| access\.setupRequired === true/);
  assert.match(sidebar, /minglora:session-ready/);
  assert.match(sidebar, /minglora:session-ended/);
  assert.match(app, /minglora:session-ended/);
  assert.doesNotMatch(app, /\[\['admin-centre','Admin Centre'\]\]/);
  assert.doesNotMatch(app, /tab==='admin-centre'/);
  assert.doesNotMatch(app, /profile-admin-centre-tab/);
  assert.doesNotMatch(app, /admin-centre-profile-root/);
  assert.doesNotMatch(app, /MingloraAdminCentre\?\.initialize/);
  assert.doesNotMatch(profileCss, /profile-admin-centre-tab/);
});

test("Only the designated Creator Hub admin identity can receive the Admin Centre entry", () => {
  assert.match(server, /const CREATOR_HUB_ADMIN_EMAIL='creatorhubcreatornetwork@gmail\.com'/);
  assert.match(server, /const CREATOR_HUB_ADMIN_USER_ID='5b998c21-86b5-4621-ab37-e0808a2657b1'/);
  assert.match(server, /function isDesignatedCreatorHubAdmin\(user\)/);
  assert.match(server, /const canAccess = designatedCreatorHubAdmin && isModerator\(user,req\) && hasActiveReviewerSession\(user\)/);
  assert.match(server, /setupRequired: designatedCreatorHubAdmin && !canAccess/);
  assert.match(admin, /access\.canAccess === true/);
  assert.match(admin, /access\.setupRequired/);
  assert.match(admin, /authenticator-verified session/);
});

test("App shell and service worker load the current Admin Centre navigation assets", () => {
  const currentAssets = [
    index.match(/href="(\/admin-centre\.css\?v=[^"]+)"/)?.[1],
    index.match(/src="(\/admin-centre\.js\?v=[^"]+)"/)?.[1],
    index.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1],
    index.match(/src="(\/sidebar-features\.js\?v=[^"]+)"/)?.[1]
  ];
  for (const asset of currentAssets) {
    assert.ok(asset, 'index.html references a versioned Admin Centre shell asset');
    assert.ok(serviceWorker.includes("'" + asset + "'"), 'service worker caches ' + asset);
  }
  const cacheName = serviceWorker.match(/const CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.match(cacheName,/^minglora-shell-v[0-9]+-[a-z0-9-]+$/);
});
