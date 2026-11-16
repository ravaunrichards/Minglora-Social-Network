import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const brandUrl = "/assets/profile-defaults/enigma.png?v=20261116-enigma-brand-1";

test("Enigma replaces the old M artwork across all active Minglora brand surfaces", () => {
  const index = read("public/index.html");
  const help = read("public/help-center.html");
  const manifest = read("public/manifest.webmanifest");
  const serviceWorker = read("public/sw.js");
  const brandCss = read("public/minglora-branding.css");
  const helpCss = read("public/help-center.css");
  const adminHtml = read("public/admin-centre.html");
  const adminCss = read("public/admin-centre.css");

  assert.equal(index.split(brandUrl).length - 1, 3, "favicon, auth logo and app header use Enigma");
  assert.equal(help.split(brandUrl).length - 1, 2, "Help Centre favicon and header use Enigma");
  assert.ok(manifest.includes(brandUrl), "installed app icon uses Enigma");
  assert.ok(serviceWorker.includes(brandUrl), "offline shell and notification artwork use Enigma");
  assert.ok(brandCss.includes(brandUrl), "Creator Studio uses the same Enigma source");
  assert.ok(adminHtml.includes(brandUrl), "Admin Centre header uses Enigma");

  const activeBrandFiles = [index, help, manifest, serviceWorker, brandCss, helpCss, adminHtml, adminCss];
  for (const source of activeBrandFiles) {
    assert.equal(source.includes("/assets/Logo/Logo.jpg"), false, "old M logo is not referenced by active branding");
  }

  assert.ok(index.includes("minglora-branding.css?v=20261116-enigma-logo-1"));
  assert.ok(help.includes("help-center.css?v=20261116-enigma-logo-1"));
  assert.ok(adminHtml.includes("admin-centre.css?v=20261116-enigma-logo-1"));
  assert.ok(brandCss.includes("object-fit:cover!important;object-position:center 12%!important"));
  assert.ok(helpCss.includes(".hc-brand img{border-radius:13px;object-fit:cover;object-position:center 12%}"));
  assert.ok(adminHtml.includes('<img class="admin-centre-brand-mark"'));
  assert.ok(adminCss.includes("object-fit:cover;"));
  assert.ok(adminCss.includes("object-position:center 12%;"));
  assert.ok(manifest.includes('"type": "image/png"'));
  assert.ok(serviceWorker.includes("CACHE_NAME='minglora-shell-v347-self-updating-1'"));
  assert.ok(serviceWorker.includes("icon:'" + brandUrl + "'"));
  assert.ok(serviceWorker.includes("badge:'" + brandUrl + "'"));
});

test("Enigma brand reuses the canonical artwork and does not change member avatar handling", () => {
  const sourceNotes = read("assets/Crop References/README.md");
  const app = read("public/app.js");
  const server = read("src/server.js");
  assert.ok(sourceNotes.includes("Profile Picture/ENIGMA.png"));
  assert.ok(server.includes("'Crop References','Profile Picture','ENIGMA.png'"));
  assert.ok(app.includes("DEFAULT_PROFILE_AVATAR='/assets/profile-defaults/enigma.png"));
  assert.equal(app.includes("DEFAULT_PROFILE_AVATAR='/assets/Logo/Logo.jpg"), false);
});
