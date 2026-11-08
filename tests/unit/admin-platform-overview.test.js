import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, admin, css, html, store] = await Promise.all([
  readFile(new URL("../../supabase/functions/minglora-runtime-state/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.js", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.css", import.meta.url), "utf8"),
  readFile(new URL("../../public/admin-centre.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/store.js", import.meta.url), "utf8")
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
  assert.match(html, /20261108-admin-overview-1/);
});


test("existing Admin Centre opens inside the authorized Admin Account using the current profile controls", () => {
  assert.match(admin, /document\.querySelector\('#edit-profile'\)/);
  assert.doesNotMatch(admin, /document\.querySelector\('#profile-edit-avatar'\)/);
  assert.match(admin, /profile\.querySelector\('\.profile-admin-tools'\)/);
  assert.match(admin, /profileHeader\.insertAdjacentElement\('afterend', root\)/);
  assert.match(admin, /initializeAdminCentre\(root\)/);
  assert.match(admin, /authenticator-verified session/i);
  assert.match(css, /admin-centre-profile-root\[hidden\]/);
  assert.match(html, /20261108-admin-account-inline-1/);
});
