# HarborPay — Minglora financial service integration

**Status:** Source snapshot imported; independent-service integration is in progress. This repository copy is not a production wallet and is not a statement that any bank, payment provider, regulator, or live-money capability has been approved.

## Product decision

HarborPay is a distinct financial service presented inside Minglora's website and apps. It is not Minglora Coins, creator earnings, Marketplace checkout, or MailHarbor email. Its financial records, API, provider credentials, ledger, identity-verification state, reconciliation, audit trail, and operational controls must remain independently governed.

The original HarborPay application is preserved under `source/`. Its existing standalone React/Vite web client and Express API are retained as the starting point; they are not blindly merged into Minglora's existing browser bundle or root API.

## Non-negotiable service boundaries

1. **Independent financial data plane.** Use a dedicated HarborPay Supabase project/Postgres database, separate from Minglora's social-network database and MailHarbor's email data. Never point HarborPay migrations or its service-role key at Minglora's project.
2. **Linked, not shared, identity.** Minglora's authenticated member ID may be linked to a HarborPay customer only after the member actively chooses to activate HarborPay and accepts a clear data-use notice. A trusted server-to-server identity assertion must be short-lived, audience-bound, nonce/replay-protected, and signed with a HarborPay-specific secret or a properly configured identity-federation protocol. Never accept a client-supplied Minglora user ID as proof of identity.
3. **Separate financial verification.** Minglora profile details are user-editable social data, not verified KYC. HarborPay must collect and validate only the information required by the relevant country, product, risk tier, and partner. Business and enterprise accounts require entity verification, beneficial-owner/controller checks, authority-to-act checks, and role-based access.
4. **Real provider-confirmed state.** A redirect, browser message, local database write, or user click is never proof that money moved. Payment, capture, refund, payout, transfer, and settlement states must be reconciled against authenticated provider events and statements, with idempotency and immutable audit evidence.
5. **No pretend wallet.** The source release implements PayPal checkout/capture, payment history, webhook verification, merchant records, and a restricted administrator PayPal disbursement path. It does not implement customer-held balances, peer-to-peer stored-value transfers, public merchant checkout, bank linking, card issuing, or a regulated e-money wallet. Do not display sample balances or mark those functions available until their real services and release gates exist.
6. **Ledger before balances.** Any future customer balance must be derived from an immutable, append-only, double-entry ledger with currency-specific minor units, atomic postings, idempotency, holds/reservations, pending/available distinction, reversal entries, reconciliation, and audited adjustments. Never make a balance a client-editable field or update it directly.
7. **Secrets and payment data.** Service credentials stay in server-only secret storage. Never expose Supabase service-role keys, PayPal client secrets, webhook secrets, signing keys, bank credentials, or card numbers/CVV to browsers or mobile clients. Use provider tokenization/hosted fields for card data; HarborPay must not store raw PAN or CVV.
8. **Feature flags fail closed.** Without complete environment configuration, verified service health, partner approval, and country/product eligibility, the feature must explain that the relevant service is not enabled. It must not create demo users, fake transaction histories, fake balances, simulated settlements, or test-mode success messages that look like production.

## Account model

HarborPay is planned to support:
- Personal accounts.
- Sole proprietor and registered business accounts.
- Merchant accounts with products, orders, payment links, checkout, refunds, reporting, staff roles, and settlement.
- Enterprise accounts with multiple legal entities, subsidiaries, locations, teams, approval policies, API credentials, webhooks, reconciliation exports, and audit reporting.

A person may be associated with more than one business or enterprise. Each entity is a separately verified account with an explicit owner/controller, authorized users, permissions, limits, and lifecycle state. Account type must not be inferred from a Minglora profile badge.

## Planned service capabilities

- Account activation, identity/KYC and business KYB onboarding.
- Payment methods: partner-hosted bank linking and card tokenization.
- Send, request, receive, and refund money, enabled by supported real payment rails and legal authorization.
- Merchant checkout, invoices, payment links, subscriptions, saved customers, tax/fee disclosures, disputes, and chargeback operations.
- Withdrawals and disbursements through approved bank/payment partners.
- Multi-currency accounts and provider-backed FX quotes, with explicit rate, fees, expiry, and settlement disclosures.
- International transfers/remittances only on explicitly approved country corridors and through appropriately licensed partners.
- Risk scoring, transaction monitoring, sanctions/PEP screening where required, fraud controls, velocity/amount limits, account holds, case management, and support escalation.
- Reconciliation, statements, tax/export reports, compliance audit trails, and financial operations tooling.
- Personal, business, merchant, and enterprise dashboards with least-privilege roles and step-up verification for sensitive actions.

This is the product scope, not a claim that these rails or permissions are already available.

## Jamaica-first and international rollout

Design the service for international expansion, but launch by country and payment corridor rather than treating "international" as one universal approval. Jamaica is the initial operating market. Before holding customer funds, issuing stored value, executing domestic or cross-border transfers, or offering remittance/FX products, obtain jurisdiction-specific legal advice and use the appropriate Bank of Jamaica route and/or an authorized banking, payment, or remittance partner. The source operations guide records the relevant Bank of Jamaica PSP, sandbox, and remittance references; re-check current regulatory materials before each release.

The first production scope should be selected around partner-confirmed capabilities (for example, merchant checkout and provider-settled payouts) rather than exposing a customer wallet that lacks a lawful custody and settlement model. Add countries only after their licensing/partner coverage, supported currencies, disclosures, KYC/KYB, data residency/privacy, tax, refunds, disputes, and reconciliation requirements are documented and tested.

## Integration with Minglora

The Minglora UI will expose HarborPay as a dedicated financial destination after sign-in. Minglora remains responsible for its social-network session and navigation. A narrow server-side integration boundary will exchange only the minimum user-approved identity attributes and HarborPay service state. HarborPay remains responsible for financial authentication/step-up, verification, permissions, payments, ledger, compliance, and customer financial records.

Do not reuse:
- Minglora creator Z Coin balances or creator payout records.
- Minglora Marketplace PayPal multiparty seller checkout or its approval flags.
- The standalone MailHarbor email service or its database/runtime.
- Minglora social profile metadata as proof of identity, residency, business ownership, or source of funds.

A later integration may use a trusted SSO/identity exchange and a same-origin reverse proxy or embedded client. It must not expose HarborPay's privileged API, service credentials, or user data to the browser. Do not automatically create a financial account when a Minglora account is registered.

## Source snapshot

The `source/` directory is a text-source snapshot of `ravaunrichards/harborpay-platform` from its `main` branch, tree `cedfa318b159b92f3dcfa291895787d4e3510e8e`. The original standalone repository remains the canonical upstream for that source. Keep this snapshot traceable and update it only through deliberate reviewed syncs.

## Implementation sequence

1. Preserve and audit the HarborPay source and existing Minglora financial flows.
2. Finalize the identity-linking and consent protocol, independent environment, data ownership, and provider/ledger interfaces.
3. Design and verify the financial ledger, accounts, multi-currency model, transfer state machine, risk controls, KYC/KYB, reconciliation, and audit model.
4. Complete partner and regulatory route selection for Jamaica and each additional country/corridor.
5. Implement and test real payment-rail adapters, webhook verification, idempotency, refunds, payouts, and settlements.
6. Integrate HarborPay navigation and UI into Minglora through a private server-to-server boundary; verify browser, Android, and responsive behavior.
7. Keep production money movement disabled until legal, provider, security, operational, and end-to-end release gates all pass.

## Release acceptance

A release is not complete because files or endpoints exist. Verify:
- isolated HarborPay database and migrations, ownership policies, grants, backups, recovery and audit retention;
- ledger invariants, concurrency, duplicate-request, replay, reversal, currency precision, rounding and reconciliation tests;
- KYC/KYB and risk-provider outcomes, country eligibility, disclosures, and limits;
- real provider sandbox end-to-end flows with independently verified webhook delivery, refunds and payouts;
- merchant/enterprise permission tests, privileged-access reviews, support/dispute operations and monitoring;
- accessibility, responsive/mobile UX, dependency/security scans, incident-response runbooks and a tested rollback;
- explicit written approval for production credentials, provider access, and regulated service operation.

**No live-money launch, account custody, or international transfer claim is made by this source import.**
