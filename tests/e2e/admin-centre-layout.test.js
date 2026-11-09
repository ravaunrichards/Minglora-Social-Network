import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(here, "../../public");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp"
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname === "/" ? "/admin-centre.html" : url.pathname);
      const target = path.resolve(publicRoot, "." + pathname);
      if (!target.startsWith(publicRoot + path.sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, origin: "http://127.0.0.1:" + address.port });
    });
  });
}

function mockAdminPayload(pathname) {
  if (pathname === "/api/admin/access") return { canAccess: true, setupRequired: false };
  if (pathname === "/api/admin/users") {
    const longDomain = Array.from({ length: 18 }, (_, index) => "segment" + String(index).padStart(2, "0")).join(".");
    return {
      users: [{
        id: "viewport-test-member",
        displayName: "M".repeat(80),
        username: "member_" + "x".repeat(22),
        email: "member." + "x".repeat(28) + "@" + longDomain + ".example",
        emailConfirmedAt: null,
        phone: null,
        status: "active",
        avatarUrl: null,
        isOwner: false
      }],
      hasMore: false,
      totalCount: 1
    };
  }
  if (pathname === "/api/admin/integrations") {
    return {
      checkedAt: "2026-11-09T00:00:00.000Z",
      runtime: { authProvider: "supabase", persistenceReady: true, liveKitConfigured: false },
      services: [
        { name: "Supabase", category: "Database", status: "connected", detail: "Read-only browser fixture for layout verification." },
        { name: "Provider connection status with a deliberately long label for wrapping verification", category: "Integration", status: "attention", detail: "Diagnostic details ".repeat(24) }
      ]
    };
  }
  if (pathname === "/api/admin/internal-activity") {
    return {
      events: [],
      cursor: 0,
      snapshot: {
        registeredMembers: 1, activeSessions: 0, activeCalls: 0, activeLiveSessions: 0,
        activeDatabaseBroadcasts: 0, activeMeetings: 0, trackedCollections: 77,
        totalStoredRecords: 1, revision: 1, syncedAt: "2026-11-09T00:00:00.000Z",
        modules: []
      }
    };
  }
  if (pathname === "/api/admin/badge-controls/members") return { members: [] };
  if (pathname === "/api/admin/audit-log") return { records: [] };
  if (pathname === "/api/admin/creator-earnings") {
    return { totals: {}, platformFinance: {}, platformPayoutAccount: {}, platformPayouts: [], creators: [], creatorPayouts: [] };
  }
  if (pathname === "/api/security/mfa") return { enabled: true, factors: [] };
  if (pathname === "/api/security/sessions") return { sessions: [] };
  if (pathname === "/api/moderation/reports") return { reports: [] };
  return {};
}

test("Admin Centre renders without viewport overflow, clipped content, fixed overlays or sibling collisions", async () => {
  const { server, origin } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const writeRequests = [];
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== "GET") {
        writeRequests.push({ method: request.method(), pathname });
        await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "Writes are disabled in the viewport fixture." }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAdminPayload(pathname)) });
    });

    await page.goto(origin + "/admin-centre.html", { waitUntil: "domcontentloaded" });
    await page.locator("#admin-control-centre").waitFor({ state: "visible" });
    await page.locator("#admin-user-management-results .admin-user-result").first().waitFor({ state: "visible" });
    await page.locator(".admin-service-connection-card").first().waitFor({ state: "visible" });

    const viewports = [
      { width: 320, height: 780, label: "small phone" },
      { width: 360, height: 800, label: "phone" },
      { width: 390, height: 844, label: "large phone" },
      { width: 768, height: 1024, label: "tablet portrait" },
      { width: 1024, height: 768, label: "tablet landscape / small desktop" },
      { width: 1440, height: 900, label: "desktop" }
    ];
    const measurements = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);
      const measurement = await page.evaluate(() => {
        const panel = document.querySelector("#admin-control-centre");
        const panelRect = panel.getBoundingClientRect();
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
        };
        const children = [...panel.children].filter(visible).map(element => {
          const rect = element.getBoundingClientRect();
          return { name: element.id || element.className || element.tagName, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const overlaps = [];
        for (let i = 0; i < children.length; i += 1) {
          for (let j = i + 1; j < children.length; j += 1) {
            const a = children[i], b = children[j];
            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapX > 2 && overlapY > 2) overlaps.push([a.name, b.name, overlapX, overlapY]);
          }
        }
        const outOfBoundsControls = [...panel.querySelectorAll("button,input,select,textarea,a")].filter(visible).filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1;
        }).map(element => element.id || element.textContent.trim().slice(0, 60));
        const fixedOrSticky = [...panel.querySelectorAll("*")].filter(visible).filter(element => {
          const position = getComputedStyle(element).position;
          return position === "fixed" || position === "sticky";
        }).map(element => element.id || element.className || element.tagName);
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          panelWidth: panelRect.width,
          panelLeft: panelRect.left,
          panelRight: panelRect.right,
          overlaps,
          outOfBoundsControls,
          fixedOrSticky
        };
      });
      measurements.push({ ...measurement, label: viewport.label });
      assert.ok(measurement.documentWidth <= viewport.width + 1,
        viewport.label + ": document has horizontal overflow (" + measurement.documentWidth + "px > " + viewport.width + "px)");
      assert.ok(measurement.panelLeft >= -1 && measurement.panelRight <= viewport.width + 1,
        viewport.label + ": Admin Centre panel exceeds viewport bounds");
      assert.deepEqual(measurement.overlaps, [], viewport.label + ": direct Admin Centre panels overlap");
      assert.deepEqual(measurement.outOfBoundsControls, [], viewport.label + ": a control extends outside the Admin Centre panel");
      assert.deepEqual(measurement.fixedOrSticky, [], viewport.label + ": a fixed/sticky element can cover Admin Centre content");
    }

    const createDetails = page.locator("details").filter({ has: page.locator("#admin-user-create-form") });
    const deleteDetails = page.locator("details").filter({ has: page.locator("#admin-user-delete-submit") });
    assert.equal(await createDetails.count(), 1, "create-member form remains within its explicit disclosure");
    assert.equal(await deleteDetails.count(), 1, "permanent-delete form remains within its explicit disclosure");
    await createDetails.locator("summary").click();
    assert.equal(await page.locator("#admin-user-create-form").isVisible(), true, "create-member form can be expanded and read");
    await deleteDetails.locator("summary").click();
    assert.equal(await page.locator("#admin-user-delete-submit").isVisible(), true, "permanent-delete control can be expanded and read");

    assert.deepEqual(writeRequests, [], "the visual test must not issue account mutations or other writes");
    assert.deepEqual(pageErrors, [], "Admin Centre must not throw browser runtime errors");
    console.log("Admin Centre viewport checks:", JSON.stringify(measurements));
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
