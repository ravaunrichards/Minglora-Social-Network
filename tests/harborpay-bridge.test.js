import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  HARBORPAY_MINGLORA_CONSENT_VERSION,
  buildMingloraHarborPayLaunchRequest,
  getHarborPayBridgeStatus,
  harborPayBridgeConfigured
} from "../src/harborpay-bridge.js";

const user = {
  id: "30a27c3a-66bf-44ea-9c2f-184ee102af42",
  email: "person@example.com",
  name: "Minglora Member"
};
const secret = "a".repeat(48);

test("builds a timestamped, body-bound HMAC launch assertion", () => {
  const timestamp = 1793550000000;
  const requestId = "127a2a95-a2ad-4e41-bc7a-91aa3516a223";
  const result = buildMingloraHarborPayLaunchRequest({ user, secret, requestId, timestamp });
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.mingloraUserId, user.id);
  assert.equal(parsed.email, user.email);
  assert.equal(parsed.fullName, user.name);
  assert.equal(parsed.consentVersion, HARBORPAY_MINGLORA_CONSENT_VERSION);
  const bodyHash = createHash("sha256").update(result.body, "utf8").digest("hex");
  const canonical = [String(timestamp), "POST", "/api/integrations/minglora/launch", bodyHash].join("\n");
  const expected = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  assert.equal(result.headers["x-harborpay-signature"], expected);
});

test("rejects incomplete Minglora profile details and weak secrets", () => {
  assert.throws(() => buildMingloraHarborPayLaunchRequest({ user: { ...user, email: "" }, secret }), /valid email/i);
  assert.throws(() => buildMingloraHarborPayLaunchRequest({ user: { ...user, name: "A" }, secret }), /display name/i);
  assert.throws(() => buildMingloraHarborPayLaunchRequest({ user, secret: "short" }), /not configured/i);
  assert.throws(() => buildMingloraHarborPayLaunchRequest({ user: { ...user, id: "not-a-uuid" }, secret }), /signed-in Minglora account/i);
});

test("bridge readiness fails closed without both origins and a strong secret", () => {
  assert.equal(harborPayBridgeConfigured({ HARBORPAY_API_URL: "https://api.harborpay.example", HARBORPAY_WEB_URL: "https://harborpay.example", HARBORPAY_SSO_SECRET: secret, NODE_ENV: "production" }), true);
  assert.equal(harborPayBridgeConfigured({ HARBORPAY_API_URL: "", HARBORPAY_WEB_URL: "https://harborpay.example", HARBORPAY_SSO_SECRET: secret, NODE_ENV: "production" }), false);
  assert.equal(harborPayBridgeConfigured({ HARBORPAY_API_URL: "https://api.harborpay.example", HARBORPAY_WEB_URL: "https://harborpay.example", HARBORPAY_SSO_SECRET: "short", NODE_ENV: "production" }), false);
});


test("HarborPay readiness checks the remote API and identifies missing bridge configuration", async () => {
  const env = {
    NODE_ENV: "production",
    HARBORPAY_API_URL: "https://api.harborpay.example",
    HARBORPAY_WEB_URL: "https://harborpay.example",
    HARBORPAY_SSO_SECRET: secret
  };
  const unavailable = await getHarborPayBridgeStatus({
    env,
    fetchImpl: async () => {
      throw new Error("connection refused");
    }
  });
  assert.equal(unavailable.configured, false);
  assert.equal(unavailable.apiReachable, false);
  assert.match(unavailable.message, /not responding/i);

  const missingRemoteSecret = await getHarborPayBridgeStatus({
    env,
    fetchImpl: async () => new Response(JSON.stringify({
      service: "harborpay-api",
      configured: { supabase: true, mingloraIdentityBridge: false }
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  });
  assert.equal(missingRemoteSecret.apiReachable, true);
  assert.equal(missingRemoteSecret.configured, false);
  assert.match(missingRemoteSecret.message, /MINGLORA_SSO_SECRET/i);

  let healthcheckCalls = 0;
  let healthcheckRequest = null;
  const ready = await getHarborPayBridgeStatus({
    env,
    fetchImpl: async (url, options = {}) => {
      if (options.method === "POST") {
        healthcheckCalls += 1;
        healthcheckRequest = { url, options };
        return new Response(JSON.stringify({
          ready: true,
          service: "harborpay-api",
          databaseConfigured: true,
          identityBridge: true
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        service: "harborpay-api",
        configured: { supabase: true, mingloraIdentityBridge: true }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(ready.configured, true);
  assert.equal(ready.apiReachable, true);
  assert.equal(healthcheckCalls, 1);
  assert.ok(healthcheckRequest, "HarborPay health must issue a signed POST challenge");
  assert.match(String(healthcheckRequest.url), /\\/api\\/integrations\\/minglora\\/healthcheck$/);
  assert.equal(healthcheckRequest.options.body, "{}");
  const healthBodyHash = createHash("sha256").update(healthcheckRequest.options.body, "utf8").digest("hex");
  const healthCanonical = [
    healthcheckRequest.options.headers["x-harborpay-timestamp"],
    "POST",
    "/api/integrations/minglora/healthcheck",
    healthBodyHash
  ].join("\\n");
  const healthSignature = createHmac("sha256", secret).update(healthCanonical, "utf8").digest("hex");
  assert.equal(healthcheckRequest.options.headers["x-harborpay-signature"], healthSignature);
  assert.match(ready.message, /secret matches/i);
});

test("HarborPay readiness returns a useful error for a non-JSON deployment response", async () => {
  const status = await getHarborPayBridgeStatus({
    env: {
      NODE_ENV: "production",
      HARBORPAY_API_URL: "https://api.harborpay.example",
      HARBORPAY_WEB_URL: "https://harborpay.example",
      HARBORPAY_SSO_SECRET: secret
    },
    fetchImpl: async () => new Response("<html>service unavailable</html>", {
      status: 503,
      headers: { "Content-Type": "text/html" }
    })
  });
  assert.equal(status.configured, false);
  assert.equal(status.apiReachable, false);
  assert.match(status.message, /HTTP 503/i);
});
