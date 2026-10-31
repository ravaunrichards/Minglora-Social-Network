# Minglora Marketplace

**Implemented first vertical slice:** signed-in members can publish real product and service listings, upload listing photos through Minglora's signed media flow, browse and filter active listings, open listing details, save listings, manage their own listing status, submit seller enquiries to the existing inbox, and report listings for moderation.

**Listing safety:** listings are seller-owned; prices are validated and stored as integer minor units; currencies are restricted to the supported list; product condition, quantity and fulfilment choices are validated; service pricing can be fixed, from, hourly or quote-based; photos must belong to the seller and be uploaded for the Marketplace slot. External image URLs are rejected. No products or sales are seeded.

**Not yet implemented:** checkout and order settlement, seller payouts for marketplace transactions, refunds, buyer-protection/escrow, shipping-carrier integrations and tracking, tax/duty calculation, appointment booking and service milestones, business verification, automated fraud scoring, seller analytics and production-scale relational repositories. Do not advertise these capabilities as live.

**Architecture note:** this first release uses Minglora's existing durable application-state adapter. Before scaling Marketplace independently or processing real orders, migrate listings, inventory, saved items, enquiries and orders to normalized relational repositories with transactional inventory/checkout flows, audited RLS, idempotency and concurrency controls.
