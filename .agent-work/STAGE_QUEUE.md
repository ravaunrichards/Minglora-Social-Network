# Minglora Master Stage Queue

**Queue basis:** repository documentation at `docs/ROADMAP.md`, `docs/FEATURES.md`, `docs/FEATURE_CATALOG.md`, `docs/FACEBOOK_PARITY_AUDIT.md`, `docs/PLATFORM_COVERAGE.md` and `docs/REPOSITORY_MAP.md`. This queue groups the documented gaps into verifiable implementation stages. Each stage must be decomposed into file/API/data/UI/security subtasks before implementation. A README, folder, migration or mock screen is not proof of completion.

Statuses: NOT STARTED · READY · IN PROGRESS · VERIFYING · COMPLETED · BLOCKED · FAILED.

## Identity and execution stages

### MS-IDENTITY-00 — Verify repository identity
- **Objective:** Lock work to the selected Minglora repository.
- **Requirements:** Verify repository URL/name, default branch, active working branch, package manifest and root tree.
- **Dependencies:** None.
- **Tasks:** Inspect GitHub metadata and tree; capture commit and manifest fingerprints.
- **Acceptance:** Repository identity and branch are recorded; no other repository is accessed for code changes.
- **Status:** COMPLETED.

### MS-QUEUE-00 — Establish recovery and master backlog
- **Objective:** Create repository-local progress, decision, blocker and stage-queue records.
- **Requirements:** Preserve existing progress if present; avoid invented completion figures.
- **Dependencies:** MS-IDENTITY-00.
- **Tasks:** Inspect documented roadmap/status sources; group the remaining work into sequential stages; save five `.agent-work/` records.
- **Acceptance:** Five records exist on the active branch and state the latest verified checkpoint.
- **Status:** IN PROGRESS (records being committed with PR #224).

## Profile badge workstream

### MS-PROFILE-01 — Unique original Gifter badge on member identity surfaces
- **Objective:** Show each member's earned Level's own original badge at the correct profile/identity location.
- **Requirements:** Match Level 01–50 to the same-numbered original PNG; no generic/fallback generated emblem when the source PNG exists; show beside username on profile identity surfaces; use correct badge in profile Badges panel, Friends cards, posts/comments and relevant LIVE identity; retain all other recognition markers.
- **Dependencies:** Existing canonical individual badge image collection and the safe numbered image route from the previous merged gifter-level work.
- **Tasks:** Shared numbered image renderer; profile header and preview placement; compact list placements; recognition panel image; responsive styling; cache versioning; focused tests.
- **Acceptance:** Each Level maps to `level_XX.png`; image path is derived from the member's earned Level; correct placement; no stretching/cropping; responsive sizing; prior verification/LIVE Pro/admin/league markers remain; CI green; merge and post-merge verification.
- **Status:** VERIFYING (implementation and full CI pass; merge/post-merge check pending).

### MS-PROFILE-02 — Profile identity and badge edge-case verification
- **Objective:** Verify absent badge, Level 1, Level 50, malformed/legacy level values, admin-awarded status, live-entry marker, NEW GIFTER, Creator League and verified/LIVE Pro coexistence.
- **Requirements:** No false badge for accounts without earned Gifter Level; clamp/sanitize invalid values; do not display misleading status; no overlapping profile controls.
- **Dependencies:** MS-PROFILE-01.
- **Tasks:** Add focused edge-case tests; inspect public/owner preview parity; verify compact layouts and keyboard/alt text.
- **Acceptance:** All edge-case tests pass and the browser renders expected output at desktop/tablet/mobile sizes.
- **Status:** NOT STARTED.

## Gifts artwork workstream

### MS-GIFTS-ART-01 — Extract and automatically validate reference artwork
- **Objective:** Preserve the 131 captured gift-gallery screenshots and extract one traceable transparent PNG candidate per deduplicated gift appearance.
- **Requirements:** Read-only source captures; unique stable filenames; source screenshot/row/column; OCR confidence; SHA-256; dimensions; transparent crop; duplicate appearance traceability; reproducible extraction.
- **Dependencies:** The 131 original `assets/Gifts/capture-*.png` reference captures.
- **Implementation:** `scripts/extract-gift-artwork.py`, `.github/workflows/gift-artwork-extraction.yml`, `assets/Artwork/`.
- **Acceptance:** All 131 screenshots processed; every manifest file exists; image dimensions and hashes pass; no exact duplicate image hashes; report generated; source files remain unchanged.
- **Status:** COMPLETED for extraction and automated integrity checks only. This does not mean the complete collection has passed human review or rights clearance.
- **Verified result:** 131/131 captures, 2,065 labelled cells, 1,509 extracted PNG records, 556 repeated appearances merged; 1,509/1,509 assets inspected; 0 integrity errors, 0 exact duplicate file-hash groups, 0 automated image-quality flags.
- **Latest successful artwork workflow:** https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/43090823543

### MS-GIFTS-ART-02 — Human visual review, OCR correction and variant reconciliation
- **Objective:** Review every extracted artwork and label before any gift catalog integration.
- **Requirements:** Inspect crop boundaries, transparent edges, subject scale, OCR names, truncation, low-confidence labels, category accuracy, same-name variants, repeated appearances and near-duplicate candidates.
- **Dependencies:** MS-GIFTS-ART-01.
- **Tasks:** Build 24 review contact sheets; screen all thumbnails; review flagged groups at full size; reconcile same-title/different-artwork candidates; correct truncated/low-confidence labels against the source captures; document every approved, rejected, duplicate or unresolved asset.
- **Acceptance:** Every record has a human review state and reason; no unresolved crop/name/duplicate issue is silently accepted; approved artwork maps to one deliberate catalog identity; all variants and repeated screenshot appearances remain traceable.
- **Status:** IN PROGRESS. Contact-sheet screening covers 24/24 pages and 1,509/1,509 thumbnails. Forty-three same-title pair comparisons have been completed at full size: twenty-six pairs are distinct artwork variants and seventeen pairs appear to be repeated artwork. The Compact base asset was compared with two variants. All source and extracted files remain preserved. Direct source screenshot cells were checked for the first six and latest twenty-five comparisons (31/43); source-cell confirmation remains pending for the twelve middle comparisons (#7–#18). The remaining 1,424 manifest records have not yet received individual full-size comparison.
- **Review notes:** `reports/gift-artwork-visual-review-notes.md`; contact-sheet screening: `reports/gift-artwork-contact-sheet-screening.md`; machine audit: `reports/gift-artwork-audit.md`.

### MS-GIFTS-ART-03 — Rights, provenance and originality clearance
- **Objective:** Confirm lawful rights for each image before publication or commercial use.
- **Requirements:** Identify the source and rights holder; retain permission/licence evidence and allowed uses; replace any unlicensed or unclear third-party crop with newly authored Minglora artwork; keep provenance linked to each asset.
- **Dependencies:** MS-GIFTS-ART-02.
- **Acceptance:** Every production-bound image has documented rights/provenance or is an original Minglora replacement with recorded authorship; no unknown-rights screenshot crop is activated.
- **Status:** BLOCKED / NOT STARTED. Screenshot extraction does not establish ownership or reuse rights. The entire extracted collection remains review-only.

### MS-GIFTS-ART-04 — Integrate approved assets into the gift catalogue and clients
- **Objective:** Publish only reviewed, rights-cleared, distinct gift artwork to the existing Minglora gift surfaces.
- **Requirements:** Stable catalog identity and file references; correct thumbnail/model association; no price, balance, wallet, transaction or creator-earnings changes; responsive previews; web/mobile parity; cache/version correctness; fallback and load-error handling.
- **Dependencies:** MS-GIFTS-ART-02 and MS-GIFTS-ART-03.
- **Acceptance:** Each activated record points to a verified approved asset; all relevant gift-picker and preview tests pass; no unreviewed or unlicensed asset is displayed as production-ready.
- **Status:** NOT STARTED. No extracted PNG was added to the live gift catalog by this artwork-extraction PR.

## Core product roadmap stages

### MS-CORE-01 — Reliable core, auth and persistence
- **Objective:** Harden auth/session/authorization boundaries and move toward transactional persistence.
- **Requirements:** Auth/session edge-case coverage; modular route boundaries; abuse-resistant throttling; relational adapter; safe migrations, backup and restore.
- **Dependencies:** None beyond verified environment/configuration.
- **Acceptance:** Route-level authorization tests, transactional persistence integration, verified backup/restore and documented operations.
- **Status:** NOT STARTED.

### MS-PRIVACY-02 — Relationships and privacy enforcement
- **Objective:** Complete friends/follows/blocks and enforce profile/content visibility consistently.
- **Requirements:** Full friend lifecycle; follow/unfollow; block/mute/restrict; audience visibility on every sensitive read; comment edits/deletes and profile privacy.
- **Dependencies:** MS-CORE-01.
- **Acceptance:** Cross-route privacy tests for owner, friend, follower, blocked and public viewers; no unauthorized data leakage.
- **Status:** NOT STARTED.

### MS-CONTENT-03 — Content, media and communities
- **Objective:** Complete creation, media processing and community workflows.
- **Requirements:** Secure media upload/scanning/transcoding; post/comment lifecycle; Groups/Pages roles and moderation; Stories; albums/photo tagging; Events/check-ins.
- **Dependencies:** MS-CORE-01 and MS-PRIVACY-02.
- **Acceptance:** End-to-end authorization, durable media records, upload failure/retry handling, moderation and responsive UI tests.
- **Status:** NOT STARTED.

### MS-MESSAGING-04 — Messaging, realtime and discovery
- **Objective:** Harden messaging and search/recommendations for real multi-user use.
- **Requirements:** Membership authorization; reliable realtime/fan-out; attachments/read state; indexed privacy-filtered search; notification preferences; retryable jobs.
- **Dependencies:** MS-CORE-01 and MS-PRIVACY-02.
- **Acceptance:** Multi-user authorization, reconnect/retry, deduplication, delivery and search privacy tests.
- **Status:** NOT STARTED.

### MS-SAFETY-05 — Safety, scale and operations
- **Objective:** Production hardening and user/data protection.
- **Requirements:** Report/moderation workflows; audit trail; export/deletion; accessibility/performance budgets; backups; restore drills; monitoring/alerting; multi-instance readiness.
- **Dependencies:** Core, privacy, content and messaging stages.
- **Acceptance:** Security/privacy review, successful restore exercise, performance/accessibility checks and operational runbooks.
- **Status:** NOT STARTED.

### MS-ADVANCED-06 — Advanced and configuration-dependent features
- **Objective:** Complete only features with a safe end-to-end operational design.
- **Requirements:** Live video/guest/moderation/recording; calls; creator monetization/payout controls; Ads only with privacy/abuse/operational controls. Marketplace is documented as RETIRED and must not be reactivated by assumption.
- **Dependencies:** Core, privacy, safety and service-provider configuration.
- **Acceptance:** Provider credentials/health verified; authorization, ledger and payout reconciliation tests; safety/moderation coverage; no production credentials committed.
- **Status:** BLOCKED for provider-dependent slices; other work NOT STARTED.

### MS-PLATFORMS-07 — Platform client delivery
- **Objective:** Distinguish current browser runtime from planned native platforms.
- **Requirements:** Audit Android shell/release workflow; plan iOS, desktop, TV, Admin and Creator Studio deliverables; shared contracts and authentication.
- **Dependencies:** Stable API, core persistence and security stages.
- **Acceptance:** Each client has a tested build/release pipeline and feature coverage statement; planned clients are not marked implemented prematurely.
- **Status:** NOT STARTED.

### MS-DOCS-08 — Documentation and final integration audit
- **Objective:** Keep implementation status, architecture, security and deployment documentation synchronized with verified code.
- **Requirements:** Update docs after each completed slice; reconcile contradictory claims; verify final branches, migrations and runtime configuration.
- **Dependencies:** All implementation stages.
- **Acceptance:** No stale status claims, all stage records reconciled, full CI green, final repository tree and deployed health verified.
- **Status:** NOT STARTED.

## Queue maintenance rules

- Do not skip or silently delete a stage.
- Before starting a stage, expand it into concrete files, server/API/data/UI tasks, dependencies and acceptance tests.
- Do not mark a stage COMPLETED until every acceptance criterion is checked.
- Reverify repository identity and last verified commit whenever resuming.
- Retired features stay retired unless a distinct approved scope explicitly changes that decision.
