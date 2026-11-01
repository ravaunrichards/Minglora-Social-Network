import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  HARBORPAY_MINGLORA_CONSENT_VERSION,
  buildMingloraHarborPayLaunchRequest,
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
