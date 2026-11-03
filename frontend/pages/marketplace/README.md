# Marketplace pages

The production browser experience is currently owned by `public/app.js`. It includes:

- Public listing discovery pages and listing detail views for products and services.
- Seller application, seller-centre status, seller-owned listing creation and listing management.
- Saved listings, seller enquiries, marketplace reporting and service appointment requests.
- Buyer checkout quotes, order creation, order detail and order cancellation/stock-release controls.
- Hosted PayPal checkout handoff and return/capture handling. Standard PayPal Checkout can show PayPal-supported basic debit/credit card options where the buyer, seller and transaction are eligible. Minglora does not collect or store raw card numbers.
- Seller payout status and payout-release requests after the delivery/completion gate.
- Buyer refund requests and moderator refund review.
- Moderator seller/job review, internal financial integrity checks and provider-record reconciliation.

## Important production gate

These pages are implemented, but the live Minglora database currently has PayPal Marketplace approval pending and checkout, seller payouts, tax/customs calculation, delayed disbursement and advanced card fields disabled. The checkout quote remains informational until the verified payment, seller, tax and currency requirements are satisfied. A quote or order record is not proof of payment.

JMD is not a supported PayPal Orders REST transaction currency in the current integration. Do not charge a JMD listing through PayPal without a verified FX quote and a clear buyer-facing conversion.

## Payment boundaries

- Basic card methods, when available, are presented by PayPal Standard Checkout; the buyer completes payment on PayPal's hosted experience.
- Branded Advanced Credit and Debit Card fields are a separate PayPal underwriting and country-eligibility path. They are not assumed available in Jamaica.
- Seller earnings remain payable until a successful PayPal delayed-disbursement/referenced-payout result is confirmed. Captures, browser redirects and payout requests do not mark a payout paid.
- Internal ledger reconciliation and PayPal transaction-level reconciliation are separate checks. The current provider check is not a downloadable PayPal balance or bank settlement statement.
