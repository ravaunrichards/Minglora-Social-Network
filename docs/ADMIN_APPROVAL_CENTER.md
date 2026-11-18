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
- The notification surface is in-app and refreshes while the Admin Centre is open. It does not claim OS push, email, SMS or background delivery.
- No production approval or test record is inserted by the UI or this implementation.

## Scope boundary

This first release connects the approval sources that already have real, callable request and review workflows. Other departments (for example company finance, role delegation, HR lifecycle, subscriptions or profile verification) must be connected only when their backend exposes a genuine pending-request record and a protected approve/reject endpoint. A department without that workflow must not display a fake approval item.

## Operational verification

Automated source tests validate the protected page entry, source endpoints, decision endpoints, no-demo-data rule, refresh behavior and responsive notification style. Production acceptance still requires a signed-in designated-owner session with current MFA and an end-to-end browser review of an actual request. The current production database was read-only checked during implementation and contained zero pending AI action approvals and zero pending AI task approvals, so no real decision was made.
