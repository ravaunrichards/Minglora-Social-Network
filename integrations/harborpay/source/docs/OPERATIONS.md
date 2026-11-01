# HarborPay operations and provider configuration

## 1. Create an isolated Supabase project

Create a new Supabase project named HarborPay for this repository. Do not reuse Zovara or another application's project.

In the HarborPay project, apply these migrations in order: `20261029000100_harborpay_core.sql`, `20261030000200_harborpay_merchant_operations.sql`, `20261101000300_harborpay_minglora_identity_bridge.sql`, and `20261101000400_harborpay_auth_profile_sync_and_index_cleanup.sql`. The dedicated Minglora HarborPay project has all four migrations applied. The fourth migration synchronizes email verification from Supabase Auth into the HarborPay profile, adds the three missing foreign-key indexes, and removes a duplicate webhook index. The merchant operations migration creates merchant/team permissions, customers, orders, payment links, refunds, disputes, payment-status history, API keys, outbound webhooks, audit events, and atomic inbound-webhook claims. Run `database/verify.sql`, `database/tests/verify_schema.sql`, and Supabase security/performance advisors after applying the migrations.

The web application needs the project URL and a publishable/anon key. The API needs the same project URL and the service-role key. The service-role key is secret and belongs only in the HarborPay API environment.

## 2. Configure HarborPay Auth and transactional email

Enable the Email provider in HarborPay Supabase Auth. Set the HarborPay web origin as the Site URL and allow exact HarborPay redirect URLs for signup confirmation and password recovery. For local development, allow only the local Vite origin used by the developer. Do not add wildcard production redirect domains.

Configure a custom SMTP sender on the HarborPay Supabase Auth settings using a verified sending domain and its real SMTP credentials. The hosted default email sender is rate-limited and is not suitable for a public financial-service onboarding flow. Use distinct, branded signup-confirmation and password-reset templates, and verify both links return to the HarborPay web app. HarborPay uses separate Supabase Auth; Minglora account login is not a substitute.

## 3. Create a PayPal REST app

Create a PayPal REST application for the HarborPay merchant account. Start with Sandbox mode. Copy the client ID and secret into the API service environment only.

The API uses Orders v2:
- Server creates an order.
- Customer approves the order on PayPal.
- Server captures the approved order.
- The server records completion only after a completed capture response is returned.

PayPal documentation:
- Orders API: https://developer.paypal.com/api/rest/integration/orders-api/
- Webhook integration: https://developer.paypal.com/api/rest/webhooks/rest/
- Payout country support: https://developer.paypal.com/payouts/supported-features/

## 4. Configure the PayPal webhook

Register this HTTPS listener URL in the PayPal REST app:

https://minglora-harborpay-api.onrender.com/api/paypal/webhook

Subscribe at minimum to:
- CHECKOUT.ORDER.APPROVED
- PAYMENT.CAPTURE.PENDING
- PAYMENT.CAPTURE.COMPLETED
- PAYMENT.CAPTURE.DENIED
- PAYMENT.CAPTURE.REFUNDED
- PAYMENT.PAYOUTS-ITEM.SUCCEEDED
- PAYMENT.PAYOUTS-ITEM.FAILED
- PAYMENT.PAYOUTS-ITEM.BLOCKED
- PAYMENT.PAYOUTS-ITEM.UNCLAIMED

Copy the webhook ID into PAYPAL_WEBHOOK_ID. HarborPay verifies every webhook through PayPal's verify-webhook-signature API before storing or processing the event. Do not disable verification.

## 5. Render environment variables

Set these on the HarborPay API service:

- HARBORPAY_WEB_URL=https://minglora-harborpay-web.onrender.com
- MINGLORA_SSO_SECRET=THE_SAME_DISTINCT_RANDOM_SECRET_AS_MINGLORA_HARBORPAY_SSO_SECRET

- PORT=4000
- SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
- PAYPAL_ENVIRONMENT=sandbox
- PAYPAL_CLIENT_ID=YOUR_SANDBOX_CLIENT_ID
- PAYPAL_CLIENT_SECRET=YOUR_SANDBOX_CLIENT_SECRET
- PAYPAL_WEBHOOK_ID=YOUR_SANDBOX_WEBHOOK_ID
- PAYPAL_CURRENCY=USD
- APP_URL=https://minglora-harborpay-web.onrender.com
- WEB_ORIGIN=https://minglora-harborpay-web.onrender.com
- PAYPAL_PAYOUTS_ENABLED=false
- HARBORPAY_ADMIN_USER_IDS=YOUR_AUTH_USER_UUID

Set these on the HarborPay static web service:

- VITE_API_URL=https://minglora-harborpay-api.onrender.com

- VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
- VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
- VITE_API_URL=https://minglora-harborpay-api.onrender.com

The API service and static site are separate Render services. Never set SUPABASE_SERVICE_ROLE_KEY, PAYPAL_CLIENT_SECRET, or PAYPAL_WEBHOOK_ID on the static site.

## 6. Merchant API and user workspace

The HarborPay React client exposes live authenticated Personal Profile, Business, Customers, Orders and Payment Links screens. Signup/sign-in, email confirmation, password recovery and password update use HarborPay Supabase Auth. Its API supports `GET/POST /api/profile`, merchant account creation/listing, owner/admin business-profile updates, merchant customer records, merchant order records, payment-link record creation/listing and owner/admin activation/disable controls. Merchant routes enforce owner/admin/finance/support/viewer roles server-side before using the privileged database client. The `harborpay_auth_profile_sync` trigger mirrors Auth email-confirmation state into the profile. Order creation returns `paymentStatus: not_started`; it does not collect funds. Payment links are not public checkout URLs yet. The public merchant checkout, merchant onboarding/KYC, settlement and refund workflows must be implemented and tested before these records can be used to represent customer payments.

## 7. Payout controls

PayPal lists Jamaica as a country with the "Send, receive, and withdraw" Payouts feature set. This does not automatically grant Payouts API access to a new merchant account. Confirm access with PayPal before using the endpoint.

Payouts are disabled by default. To enable them, first complete merchant onboarding and PayPal approval, verify the merchant funding source, set PAYPAL_PAYOUTS_ENABLED=true on the API service, and set HARBORPAY_ADMIN_USER_IDS to the exact Supabase Auth UUIDs authorized to initiate merchant disbursements.

The endpoint is POST /api/admin/payouts. It is not a customer wallet withdrawal endpoint and does not promise or calculate a customer's HarborPay balance. It sends money from the merchant's PayPal business account to an email recipient. Review the merchant's legal, contractual, tax, AML, fraud, and consumer-protection duties before enabling it.

## 8. Jamaica regulatory boundary

The Bank of Jamaica describes Payment Service Providers as entities authorized to provide electronic retail payment instruments and services. Its current public PSP page says it is working on amendments to establish a PSP licensing/supervision regime and identifies the FinTech Regulatory Sandbox as the interim controlled testing route. The Bank also publishes a separate remittance licensing framework.

References:
- https://boj.org.jm/core-functions/financial-system/payment-systems/authorised-payment-service-providers/
- https://boj.org.jm/core-functions/financial-system/payment-systems/
- https://boj.org.jm/core-functions/financial-system/cambios-remittance/supervision-of-remittance-services/

This repository does not establish HarborPay's legal authorization. Do not offer public stored-value accounts, custodial balances, money transmission, or remittance services until a qualified Jamaican regulatory/legal review confirms the operating model and required approvals or regulated partners.

## 9. Minglora identity-link bridge

The bridge uses two separate server-only values: Minglora's HARBORPAY_SSO_SECRET and HarborPay's MINGLORA_SSO_SECRET. They must match and must be a unique random secret of at least 32 bytes, unrelated to other app secrets. Minglora sends a signed, timestamped request to HarborPay only after the user accepts the data-sharing notice. HarborPay verifies the HMAC over the exact request body, rejects stale requests, stores a SHA-256 token hash, and returns a ten-minute single-use URL. HarborPay exchanges the code once, prefills only name/email, and links the accounts only after a verified HarborPay email matches the consented Minglora email. Never add identity credentials, tokens, passwords, payment methods or KYC documents to the payload.

Deploy the static HarborPay site with a Content-Security-Policy frame-ancestors allow-list containing only the real Minglora origin (the Blueprint includes the current Render Minglora origin). Do not set X-Frame-Options DENY or SAMEORIGIN, because this independently hosted HarborPay page must render in the Minglora iframe. Add any custom Minglora domain explicitly and remove unused origins. A new-tab fallback remains available for browsers that restrict embedded storage.

The Minglora integration does not make profile data KYC, does not automatically open an account, and does not grant transaction permissions. HarborPay's own Auth, email verification, KYC/KYB and transaction risk gates remain authoritative.

## 10. Sandbox verification checklist

1. Register a new HarborPay test user.
2. Confirm the user is created in the HarborPay Supabase Auth project and the profile trigger creates their profile.
3. Create a PayPal Sandbox order from the authenticated web session.
4. Approve the order using a PayPal Sandbox buyer account.
5. Confirm the API captures the order and the provider reports COMPLETED.
6. Confirm the payment row is visible only to its owner.
7. Deliver a signed PayPal webhook and confirm signature verification and event de-duplication.
8. Deliver the same webhook again and confirm it does not create duplicate financial records.
9. Test a denied/pending/refunded event and verify the matching status transition.
10. Confirm an ordinary customer receives 403 for the administrator payout endpoint.
11. Confirm an administrator receives a disabled response while PAYPAL_PAYOUTS_ENABLED=false.
12. Only after sandbox tests and merchant approval, configure Live credentials and a separate Live webhook ID.

No live-money test should be run with real customer funds during initial verification.
