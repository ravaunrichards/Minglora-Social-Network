import { createHash, createHmac, randomUUID } from "node:crypto";

export const HARBORPAY_MINGLORA_CONSENT_VERSION = "2026-11-01";
const LAUNCH_PATH = "/api/integrations/minglora/launch";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOrigin(value, label, production) {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); }
  catch { throw Object.assign(new Error(label + " is not configured with a valid origin."), { status: 503 }); }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(localHttp && !production)) {
    throw Object.assign(new Error(label + " must use HTTPS."), { status: 503 });
  }
  if (parsed.username || parsed.password || !["", "/"].includes(parsed.pathname) || parsed.search || parsed.hash) {
    throw Object.assign(new Error(label + " must be an origin without a path, credentials, query string, or fragment."), { status: 503 });
  }
  return parsed.origin;
}

export function buildMingloraHarborPayLaunchRequest({ user, secret, requestId = randomUUID(), timestamp = Date.now() }) {
  if (!UUID_PATTERN.test(String(user?.id || ""))) {
    throw Object.assign(new Error("A valid signed-in Minglora account is required."), { status: 401 });
  }
  const email = String(user.email || "").trim().toLowerCase();
  const fullName = String(user.name || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw Object.assign(new Error("Your Minglora account needs a valid email address before HarborPay can be opened."), { status: 409 });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    throw Object.assign(new Error("Your Minglora display name is not valid for account prefill."), { status: 409 });
  }
  if (!UUID_PATTERN.test(String(requestId || ""))) {
    throw Object.assign(new Error("The HarborPay launch request identifier is invalid."), { status: 500 });
  }
  if (Buffer.byteLength(String(secret || "")) < 32) {
    throw Object.assign(new Error("HarborPay identity linking is not configured on the Minglora server."), { status: 503 });
  }
  const stamp = Number(timestamp);
  if (!Number.isSafeInteger(stamp) || String(stamp).length !== 13) {
    throw Object.assign(new Error("The HarborPay launch timestamp is invalid."), { status: 500 });
  }
  const body = JSON.stringify({
    mingloraUserId: String(user.id),
    email,
    fullName,
    requestId,
    consentVersion: HARBORPAY_MINGLORA_CONSENT_VERSION
  });
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = [String(stamp), "POST", LAUNCH_PATH, bodyHash].join("\n");
  const signature = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  return {
    body,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-harborpay-timestamp": String(stamp),
      "x-harborpay-signature": signature
    }
  };
}

export function harborPayBridgeConfigured(env = process.env) {
  try {
    const production = env.NODE_ENV === "production";
    const apiOrigin = parseOrigin(env.HARBORPAY_API_URL, "HarborPay API URL", production);
    const webOrigin = parseOrigin(env.HARBORPAY_WEB_URL, "HarborPay web URL", production);
    return apiOrigin !== webOrigin && Buffer.byteLength(String(env.HARBORPAY_SSO_SECRET || "")) >= 32;
  } catch {
    return false;
  }
}

export async function getHarborPayBridgeStatus({ fetchImpl = fetch, env = process.env } = {}) {
  if (!harborPayBridgeConfigured(env)) {
    return {
      configured: false,
      apiReachable: false,
      identityBridge: false,
      databaseConfigured: false,
      message: "HarborPay connection is not configured on the Minglora server. The API URL, web URL and matching server-only signing secret must be set before account activation can start."
    };
  }

  let apiOrigin;
  try {
    apiOrigin = parseOrigin(env.HARBORPAY_API_URL, "HarborPay API URL", env.NODE_ENV === "production");
  } catch (error) {
    return { configured: false, apiReachable: false, identityBridge: false, databaseConfigured: false, message: error.message };
  }

  let response;
  try {
    response = await fetchImpl(apiOrigin + "/api/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7000)
    });
  } catch {
    return {
      configured: false,
      apiReachable: false,
      identityBridge: false,
      databaseConfigured: false,
      message: "The HarborPay API is not responding. Its separate service must be deployed and healthy before Minglora can open it."
    };
  }

  const raw = await response.text().catch(() => "");
  let health = {};
  try { health = JSON.parse(raw); } catch {}
  if (!response.ok || health?.service !== "harborpay-api") {
    return {
      configured: false,
      apiReachable: false,
      identityBridge: false,
      databaseConfigured: false,
      message: "The configured HarborPay API address did not return a valid HarborPay health response (HTTP " + response.status + "). Check the HarborPay API deployment and its health route."
    };
  }

  const identityBridgeConfigured = health.configured?.mingloraIdentityBridge === true;
  const databaseConfigured = health.configured?.supabase === true;
  if (!identityBridgeConfigured) {
    return {
      configured: false,
      apiReachable: true,
      identityBridge: false,
      databaseConfigured,
      message: "HarborPay is online, but its MINGLORA_SSO_SECRET is missing or too short. Set it to the same private value as Minglora's HARBORPAY_SSO_SECRET."
    };
  }

  const healthPath = "/api/integrations/minglora/healthcheck";
  const body = "{}";
  const timestamp = String(Date.now());
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = [timestamp, "POST", healthPath, bodyHash].join("\n");
  const signature = createHmac("sha256", String(env.HARBORPAY_SSO_SECRET))
    .update(canonical, "utf8")
    .digest("hex");

  let bridgeResponse;
  try {
    bridgeResponse = await fetchImpl(apiOrigin + healthPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-harborpay-timestamp": timestamp,
        "x-harborpay-signature": signature
      },
      body,
      signal: AbortSignal.timeout(7000)
    });
  } catch {
    return {
      configured: false,
      apiReachable: true,
      identityBridge: false,
      databaseConfigured,
      message: "HarborPay is online, but its signed account-link readiness check could not be completed."
    };
  }

  const bridgeRaw = await bridgeResponse.text().catch(() => "");
  let bridge = {};
  try { bridge = JSON.parse(bridgeRaw); } catch {}
  if (bridgeResponse.status === 401) {
    return {
      configured: false,
      apiReachable: true,
      identityBridge: false,
      databaseConfigured,
      message: "The HarborPay and Minglora SSO secrets do not match. Set the exact same private secret on both server services."
    };
  }
  if (!bridgeResponse.ok || bridge.ready !== true) {
    return {
      configured: false,
      apiReachable: true,
      identityBridge: false,
      databaseConfigured: bridge.databaseConfigured === true,
      message: bridge.error || "HarborPay's signed account-link readiness check failed (HTTP " + bridgeResponse.status + ")."
    };
  }

  return {
    configured: true,
    apiReachable: true,
    identityBridge: true,
    databaseConfigured: bridge.databaseConfigured === true,
    message: "HarborPay is online, the dedicated database is responding and the Minglora signing secret matches."
  };
}

export async function createHarborPayLaunch({ user, fetchImpl = fetch, env = process.env }) {
  const production = env.NODE_ENV === "production";
  const apiOrigin = parseOrigin(env.HARBORPAY_API_URL, "HarborPay API URL", production);
  const webOrigin = parseOrigin(env.HARBORPAY_WEB_URL, "HarborPay web URL", production);
  const secret = String(env.HARBORPAY_SSO_SECRET || "");
  if (apiOrigin === webOrigin) {
    throw Object.assign(new Error("HarborPay API and web services must use their separate configured origins."), { status: 503 });
  }
  const signed = buildMingloraHarborPayLaunchRequest({ user, secret });
  let response;
  try {
    response = await fetchImpl(apiOrigin + LAUNCH_PATH, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw Object.assign(new Error("HarborPay could not be reached. No account activation or payment was started."), { status: 503 });
  }
  const rawResponse = await response.text().catch(() => "");
  let payload = {};
  try { payload = JSON.parse(rawResponse); } catch {}
  if (!response.ok) {
    const message = String(
      payload.error ||
      "HarborPay API returned HTTP " + response.status + " without a JSON error. Check that the HarborPay API service is deployed and its routes are running."
    );
    throw Object.assign(new Error(message), { status: response.status >= 500 ? 503 : response.status });
  }
  let launch;
  try { launch = new URL(payload.launchUrl); }
  catch { throw Object.assign(new Error("HarborPay returned an invalid account activation URL."), { status: 502 }); }
  const code = launch.searchParams.get("minglora_handoff") || "";
  if (launch.origin !== webOrigin || (launch.protocol !== "https:" && production) ||
      launch.searchParams.size !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
    throw Object.assign(new Error("HarborPay returned an activation URL outside its configured origin or with an invalid single-use code."), { status: 502 });
  }
  const expiresAt = Date.parse(String(payload.expiresAt || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 11 * 60 * 1000) {
    throw Object.assign(new Error("HarborPay returned an invalid or expired activation-link lifetime."), { status: 502 });
  }
  return { launchUrl: launch.toString(), expiresAt: new Date(expiresAt).toISOString() };
}
