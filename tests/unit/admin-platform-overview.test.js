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


test("Admin Centre opens as its own page from the authorized administrator profile", () => {
  assert.match(admin, /document\\.querySelector\\('#edit-profile'\\)/);
  assert.match(admin, /profile\\?\\.querySelector\\('\\.profile-admin-tools'\\)/);
  assert.match(admin, /link\\.href = '\\/admin-centre\\.html'/);
  assert.match(admin, /adminGrid\\.append\\(link\\)/);
  assert.doesNotMatch(admin, /insertAdjacentElement\\('afterend', root\\)/);
  assert.match(admin, /authenticator-verified session/i);
  assert.match(html, /id="admin-centre-root"/);
  assert.match(html, /20261108-admin-workspace-2/);
  assert.match(css, /admin-control-centre-page/);
  assert.match(css, /grid-template-columns:minmax\\(220px,260px\\) minmax\\(0,1fr\\)/);
  assert.match(css, /@media\\(max-width:900px\\)/);
});

test("administrator profile keeps name and username grouped with three distinctive identity marks", () => {
  assert.match(index, /admin-profile-layout\\.css\\?v=20261108-admin-profile-workspace-1/);
  assert.match(index, /app\\.js\\?v=20261108-admin-profile-workspace-1/);
  assert.match(app, /profile-admin-identity-mark--owner/);
  assert.match(app, /profile-admin-identity-mark--security/);
  assert.match(app, /profile-admin-identity-mark--control/);
  assert.match(app, /data-profile-admin-action="edit-profile"/);
  assert.match(app, /data-profile-admin-action="privacy"/);
});


test("app shell and service worker load the current standalone Admin Centre assets", () => {
  assert.match(index, /admin-centre\.css\?v=20261108-admin-workspace-2/);
  assert.match(index, /admin-centre\.js\?v=20261108-admin-workspace-2/);
  const cacheName = serviceWorker.match(/const CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.match(cacheName, /^minglora-shell-v\d+-/);
  assert.notEqual(cacheName, 'minglora-shell-v236-admin-workspace-1');
  assert.match(serviceWorker, /admin-centre\.css\?v=20261108-admin-workspace-2/);
  assert.match(serviceWorker, /admin-centre\.js\?v=20261108-admin-workspace-2/);
});
