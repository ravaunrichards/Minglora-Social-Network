import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, admin, css, html, store, index, serviceWorker, app] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/store.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/app.js", import.meta.url), "utf8")
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

test("admin centre renders module and per-collection totals from the live snapshot", () => {
  assert.match(admin, /id="admin-platform-overview"/);
  assert.match(admin, /href="#admin-platform-overview"/);
  assert.match(admin, /id="admin-platform-module-grid"/);
  assert.match(admin, /module\.collections/);
  assert.match(admin, /Active sessions/);
  assert.match(admin, /private message contents/i);
  assert.match(css, /admin-platform-module-grid/);
  assert.match(css, /admin-platform-collection-row/);
  assert.match(html, /20261108-admin-workspace-2/);
});


test("Admin Centre is embedded as a protected feature within the administrator profile", () => {
  assert.ok(app.includes("[['admin-centre','Admin Centre']]"));
  assert.ok(app.includes("tab==='admin-centre'"));
  assert.ok(app.includes("admin-centre-profile-root"));
  assert.ok(app.includes("window.MingloraAdminCentre?.initialize"));
  assert.ok(admin.includes("window.MingloraAdminCentre = Object.freeze"));
  assert.ok(admin.includes("access.canAccess === true"));
  assert.ok(admin.includes("access.setupRequired"));
  assert.ok(!admin.includes("profile-admin-centre-entry"));
  assert.ok(!admin.includes("link.href = '/admin-centre.html'"));
  assert.ok(admin.includes("authenticator-verified session"));
  assert.ok(css.includes("admin-control-centre-page"));
  assert.ok(css.includes("grid-template-columns:minmax(220px,260px) minmax(0,1fr)"));
  assert.ok(css.includes(".admin-centre-nav-group"));
  assert.ok(admin.includes("People &amp; community"));
  assert.ok(admin.includes("Creators &amp; finance"));
  assert.ok(admin.includes("Trust &amp; support"));
});

test("administrator profile shows Admin Centre as a feature tab without a header shortcut", () => {
  assert.ok(index.includes("admin-profile-layout.css?v=20261108-admin-profile-feature-tab-1"));
  assert.ok(!app.includes("profile-admin-tools"));
  assert.ok(!app.includes("data-profile-admin-action"));
  assert.ok(!app.includes("Profile management"));
  assert.ok(app.includes("profile-admin-centre-tab"));
  assert.ok(!admin.includes("profile-admin-centre-entry"));
  assert.ok(!admin.includes("addProfileEntry"));
  assert.ok(!css.includes(".profile-admin-centre-entry{"));
  assert.ok(!css.includes("profile-admin-tools"));
  assert.ok(!css.includes("profile-admin-tool"));
  assert.ok(app.includes("profile-admin-identity-mark--owner"));
  assert.ok(app.includes("profile-admin-identity-mark--security"));
  assert.ok(app.includes("profile-admin-identity-mark--control"));
});

test("app shell and service worker load the profile feature Admin Centre assets", () => {
  assert.match(index, /admin-centre\\.css\\?v=20261108-admin-workspace-2/);
  assert.match(index, /admin-centre\\.js\\?v=20261108-admin-profile-feature-tab-1/);
  assert.match(index, /app\\.js\\?v=20261108-admin-centre-profile-feature-tab-1/);
  const cacheName = serviceWorker.match(/const CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.match(cacheName, /^minglora-shell-v\\d+-/);
  assert.equal(cacheName, 'minglora-shell-v254-admin-profile-admin-centre-feature-1');
  assert.match(serviceWorker, /admin-centre\\.css\\?v=20261108-admin-workspace-2/);
  assert.match(serviceWorker, /admin-centre\\.js\\?v=20261108-admin-profile-feature-tab-1/);
  assert.match(serviceWorker, /admin-profile-layout\\.css\\?v=20261108-admin-profile-feature-tab-1/);
  assert.match(serviceWorker, /app\\.js\\?v=20261108-admin-centre-profile-feature-tab-1/);
});
