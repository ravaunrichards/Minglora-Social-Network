import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getGiftGalleryPeriod } from "../backend/modules/gift-gallery/service.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dataDir = path.join(os.tmpdir(), "minglora-gift-gallery-api-" + randomUUID());
let port = 0;
let server = null;

async function reservePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const value = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return value;
}

async function startServer() {
  server = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      AUTH_PROVIDER: "legacy",
      PERSISTENCE_DRIVER: "json",
      DATA_DIR: dataDir,
      SESSION_SECRET: "minglora-gift-gallery-api-test-secret",
      TENOR_API_KEY: ""
    },
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/api/health");
      if (response.status === 200) return;
    } catch {}
    await delay(75);
  }
  throw new Error("Minglora test API did not become ready.");
}

async function stopServer() {
  if (!server) return;
  const child = server;
  server = null;
  if (child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2500);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

async function request(cookie, url, options = {}) {
  const response = await fetch("http://127.0.0.1:" + port + url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" ? { Origin: "http://127.0.0.1:" + port } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    }
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return {
    status: response.status,
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie
  };
}

async function register(name, username, email) {
  const result = await request("", "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, username, email, password: "GiftGalleryPass123!" })
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { id: result.body.user.id, cookie: result.cookie };
}

test("Gift Gallery API shows the weekly wall and enforces owner and gifter privacy controls", async t => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  port = await reservePort();
  await startServer();
  t.after(async () => {
    await stopServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const creator = await register("Gift Gallery Owner", "giftgalleryowner", "gift-gallery-owner@example.test");
  const sender = await register("Gift Gallery Supporter", "giftgallerysupporter", "gift-gallery-supporter@example.test");
  const now = new Date();
  const period = getGiftGalleryPeriod(now, "America/Jamaica");

  await stopServer();
  const dbPath = path.join(dataDir, "db.json");
  const persisted = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  persisted.giftGalleryEvents = [
    {
      id: randomUUID(), giftId: "galaxy-tx", creatorId: creator.id, senderId: sender.id,
      giftCode: "galaxy", giftName: "Minglora Galaxy", emoji: "🌌", coinAmount: 5000,
      broadcastId: "live-test", timeZone: "America/Jamaica", weekKey: period.weekKey, createdAt: now.toISOString()
    },
    {
      id: randomUUID(), giftId: "rose-tx", creatorId: creator.id, senderId: sender.id,
      giftCode: "rose", giftName: "Minglora Rose", emoji: "🌹", coinAmount: 1,
      broadcastId: "live-test", timeZone: "America/Jamaica", weekKey: period.weekKey, createdAt: now.toISOString()
    }
  ];
  persisted.giftGallerySettings = [{ userId: creator.id, enabled: true, targets: {} }];
  persisted.giftGalleryPreferences = [{ userId: sender.id, showInGalleries: true }];
  fs.writeFileSync(dbPath, JSON.stringify(persisted, null, 2));
  await startServer();

  const own = await request(creator.cookie, "/api/users/" + creator.id + "/gift-gallery");
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.enabled, true);
  assert.equal(own.body.totals.gifts, 2);
  assert.equal(own.body.ownerSettings.enabled, true);
  assert.ok(own.body.entries.some(item => item.giftCode === "galaxy" && item.lit));

  const publicView = await request(sender.cookie, "/api/users/" + creator.id + "/gift-gallery");
  assert.equal(publicView.status, 200, JSON.stringify(publicView.body));
  assert.equal(publicView.body.ownerSettings, undefined);
  assert.ok(publicView.body.entries[0].leadingGifter);

  const privacy = await request(sender.cookie, "/api/gift-gallery/settings", {
    method: "PATCH",
    body: JSON.stringify({ showInGalleries: false })
  });
  assert.equal(privacy.status, 200, JSON.stringify(privacy.body));
  const hidden = await request(creator.cookie, "/api/users/" + creator.id + "/gift-gallery");
  assert.equal(hidden.body.totals.gifts, 0);
  assert.equal(hidden.body.entries.length, 0);

  const restorePrivacy = await request(sender.cookie, "/api/gift-gallery/settings", {
    method: "PATCH",
    body: JSON.stringify({ showInGalleries: true })
  });
  assert.equal(restorePrivacy.status, 200, JSON.stringify(restorePrivacy.body));

  const target = await request(creator.cookie, "/api/gift-gallery/settings", {
    method: "PATCH",
    body: JSON.stringify({ giftCode: "galaxy", targetCount: 2 })
  });
  assert.equal(target.status, 200, JSON.stringify(target.body));
  const updatedGoal = await request(creator.cookie, "/api/users/" + creator.id + "/gift-gallery");
  assert.equal(updatedGoal.body.entries.find(item => item.giftCode === "galaxy").targetCount, 2);
  assert.equal(updatedGoal.body.entries.find(item => item.giftCode === "galaxy").lit, false);

  const disabled = await request(creator.cookie, "/api/gift-gallery/settings", {
    method: "PATCH",
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  const off = await request(sender.cookie, "/api/users/" + creator.id + "/gift-gallery");
  assert.equal(off.body.enabled, false);
  assert.equal(off.body.entries.length, 0);
});
