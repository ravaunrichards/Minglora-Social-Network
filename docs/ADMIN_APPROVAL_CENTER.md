# Minglora Admin Approval Center

## Purpose

Provide one owner-protected place to see real administrator decisions that are waiting for review. The Admin Centre displays a persistent pending-count banner and a short-lived in-app notification when new pending items are detected. The Approval Center page lists the actual requests and presents explicit Approve and Reject actions.

## First connected approval sources

1. **AI high-impact action reviews** — reads pending records from the existing owner/MFA-protected `GET /api/ai-network` command-center response and records a decision through `PATCH /api/ai-network/approvals/:id`.
2. **AI durable task approvals** — reads the existing relational task queue through `GET /api/ai-network/tasks` and records a reasoned decision through `PATCH /api/ai-network/tasks/:taskId/approval`.

The UI does not fabricate request cards, seed sample approvals, read the task payload, or mark a request approved before the server confirms the change. Both APIs retain the existing designated-owner, moderator and active-MFA checks.

## Execution and security boundaries

- An AI high-impact approval record is a human decision only. The existing service explicitly records `executionStatus: not_executed`; it does not execute the underlying action.
- Approving an AI task does not bypass the independent runtime, worker, provider, budget or permission gates.
- No worker was activated by this feature. The production worker controls are independently maintained in the paused/disabled state.
- The Admin Centre has its own pending-count banner and approval toast. The main Minglora app also runs a site-wide in-app notifier, polling the same owner/MFA-protected AI approval and task APIs every 30 seconds. New requests display a pop-up alert and a persistent pending-count pill linking directly to the Approval Center. It does not claim OS push, email, SMS or background delivery.
- No production approval or test record is inserted by the UI or this implementation.

## Scope boundary

This first release connects the approval sources that already have real, callable request and review workflows. Other departments (for example company finance, role delegation, HR lifecycle, subscriptions or profile verification) must be connected only when their backend exposes a genuine pending-request record and a protected approve/reject endpoint. A department without that workflow must not display a fake approval item.

## Operational verification

Automated source tests validate the protected page entry, source endpoints, decision endpoints, no-demo-data rule, refresh behavior, responsive notification style, global app entry point and service-worker precache. Production acceptance still requires a signed-in designated-owner session with current MFA and an end-to-end browser review of an actual request. The current production database was read-only checked during implementation and contained zero pending AI action approvals and zero pending AI task approvals, so no real decision was made.

## Mainline integration

The Approval Center consumes the existing owner-protected AI Network snapshot and task-approval endpoints. It does not add or alter AI identity tables, profile-visibility rules, provider credentials, worker controls or production request records, and it requires no database migration. The current mainline identity-registry and private-profile improvements remain independent and must be preserved when integrating this UI.
