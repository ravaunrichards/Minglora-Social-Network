# Minglora Admin Centre — Page Architecture

## Purpose

The Admin Centre is a private administration workspace. Every available administrative destination is presented as an independent, directly addressable page. The page router relocates existing feature containers without cloning their markup, changing their element IDs, replacing their API calls, or bypassing existing authorization checks.

## Navigation departments

1. **Dashboard** — Overview, Platform Operations, Platform Inventory.
2. **Profile & Community** — Profile Verification & Gifter Badges.
3. **User Management** — Member Accounts, Administrator Audit Log.
4. **Creator Finance** — Gift Revenue & Creator Earnings, Campaign Gift Wallet, Member Promotional Coins, Creator Marketing Budget, Platform Share Payouts, Creator & Member Withdrawals, Promotional Wallet Tracking.
5. **Live Pro Access** — LIVE Pro Access.
6. **Trust & Support** — Moderation Reports, Member Support Inbox.
7. **Administration** — Administrator Security & Devices, including the authenticator and session settings already present in the workspace.

Only routes backed by existing page content are shown. No placeholder management modules or fabricated operational data are introduced.

## Navigation behavior

- Each page uses a stable `?page=<key>` address and can be bookmarked or opened directly.
- The current location is shown in breadcrumbs and the document title.
- Back and Forward controls work with browser history.
- The desktop sidebar supports page search, recent-page shortcuts and collapse/expand.
- Smaller screens use a grouped page selector instead of an overcrowded horizontal navigation bar.
- The dashboard provides direct links to every page available in the current administrator session.

## Preservation and security

- The existing `/api/admin/access` check remains the entry gate.
- Unlocked administrative pages remain hidden until the existing privileged session is authorized.
- When additional authenticator setup is required, only the overview and existing security setup page are available.
- Existing DOM nodes are moved, not duplicated, so event listeners and IDs remain attached.
- Existing Auth provider CSS and JavaScript assets remain loaded.
- No database schema, records, balances, credentials, service configuration or production deployment is changed by this page-layout work.

## Verification

The unit test `tests/unit/admin-centre-navigation.test.js` checks the seven navigation groups, route coverage, container resolution for sections without their own IDs, history/search/mobile controls, access-gate preservation and script initialization order.
