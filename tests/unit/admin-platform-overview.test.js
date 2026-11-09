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
  assert.equal(active.length, 77);
  assert.equal(mapped.length, active.length);
  assert.equal(new Set(mapped).size, mapped.length);
  assert.deepEqual(mapped.sort(), active);
  assert.match(runtime, /trackedCollections/);
  assert.match(runtime, /totalStoredRecords/);
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
  assert.match(html, /20261109-admin-user-service-centre-1/);
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

test("App shell and service worker load the restored Admin Centre navigation assets", () => {
  const version = "20261109-admin-user-service-centre-1";
  assert.ok(index.includes("/admin-centre.css?v=" + version));
  assert.ok(index.includes("/admin-centre.js?v=" + version));
  assert.ok(index.includes("/app.js?v=20261109-admin-centre-left-sidebar-1"));
  assert.ok(index.includes("/sidebar-features.js?v=20261109-admin-centre-left-sidebar-1"));
  const cacheName = serviceWorker.match(/const CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.equal(cacheName, 'minglora-shell-v256-admin-user-service-centre-1');
  assert.ok(serviceWorker.includes("/admin-centre.css?v=" + version));
  assert.ok(serviceWorker.includes("/admin-centre.js?v=" + version));
  assert.ok(serviceWorker.includes("/app.js?v=20261109-admin-centre-left-sidebar-1"));
  assert.ok(serviceWorker.includes("/sidebar-features.js?v=20261109-admin-centre-left-sidebar-1"));
});
