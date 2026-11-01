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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload.error || "HarborPay could not create a secure account activation link.");
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
