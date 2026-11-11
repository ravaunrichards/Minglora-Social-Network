# Blockers and Verification Limits

## Current profile Gifter badge stage

- **Implementation blocker:** None known at checkpoint `b9c1bc6bae92f0a239ecae1b9693e09e5e7a4365`.
- **Automated tests:** The latest full CI run passed all three jobs: https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42943613615.
- **Merge blocker:** Awaiting guarded merge of PR #224 and post-merge `main` verification.
- **Production visual verification:** Not yet performed. GitHub source/CI confirms markup, style and test coverage; it does not prove the deployed Render runtime has refreshed or that every browser/device visually renders the badge correctly.
- **Asset source:** 50 original per-Level PNGs were verified in the preceding gifter-level stage. This stage references those images and does not edit them.

## Repository-wide limits

- **Absolute local root path:** Not supplied by the connected GitHub interface. Verified root notation is repository root `.`.
- **Overall completion percentage:** Not yet measurable; a complete task-level backlog with weights does not exist yet.
- **Hosted LiveKit:** Existing repository audit documents the hosted runtime as not configured for LiveKit; provider-dependent LIVE/calling work remains blocked until configuration is verified. This is not introduced by the profile badge change.
- **Full product audit:** The repository has more than 1,000 tracked tree entries. The current stage map is based on the maintained roadmap, feature status, catalog and parity audit; a file-by-file audit of every module/client/test has not been completed.

## Resolved CI issues

- Test source had malformed nested quote literals; changed to safely escaped string assertions.
- Older tests expected the previous app bundle cache query; updated those assertions to the current versioned app script.
- Rewards route used a root-level image path, but the committed original exists at `assets/Gifters Badge Levels/Gifters Rewards.png`; server route and test now point to that original file.


## Current gift artwork workstream (PR #236)

- **Extraction:** 131/131 screenshots processed; 2,065 labelled cells; 1,509 individual PNG candidates; 556 repeated appearances merged by the extraction pipeline.
- **Automated quality:** Latest read-only audit passed after correcting its dimension-type comparison. All 1,509 manifest assets were inspected; 0 missing/invalid/hash errors; 0 exact duplicate file-hash groups; 0 automated image-quality flags.
- **Manual review:** 24/24 contact sheets and 1,509/1,509 thumbnails have been screened. Sixty-nine same-title pair comparisons have been completed at full size: forty-four are distinct variants and twenty-five appear to repeat artwork. Base images were reused for multi-variant comparisons. Source screenshot cells were checked for the first six and latest fifty-one comparisons (57/69); the twelve middle comparisons (#7–#18) still need direct source-cell confirmation. The other 1,378 manifest records still require individual full-size review. The OCR/crop/variant review queue remains 1,114 entries (overlapping warnings).
- **Name mapping:** 997 exact gift-name matches, 74 fuzzy suggestions, 432 unmatched exact names, and 6 low-confidence/truncated names without a suggestion.
- **Rights/provenance:** NOT CLEARED. The PNGs are crops from screenshot references; their extraction does not establish ownership or commercial-use permission. All files remain review-only and must not be activated as Minglora-original art.
- **Integration:** No extracted file has been added to the live gift catalogue; no gift pricing, Coin balances, wallets, transactions, reserves or creator earnings were changed.
- **Draft status:** PR #236 is open and Draft. It must remain unmerged until human review and rights/originality gates are satisfied.
- **Artwork-specific workflow:** PASS — https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/43090823543 (re-extraction, integrity audit, contact-sheet build and commit).
- **Separate general CI blocker:** The repository-structure step reports pre-existing `assets/Multi-Guest/.gitkeep` and `assets/Sounds/.gitkeep` placeholders as disallowed. These are outside the gift artwork scope and were not removed or modified. For You navigation and Supabase Auth acceptance jobs passed.
