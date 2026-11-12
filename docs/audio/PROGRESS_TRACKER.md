# Minglora Unified Audio Ecosystem — Live Progress Tracker

Last updated: 12 November 2026
Repository: `ravaunrichards/Minglora-Social-Network`
Feature branch: `feat/minglora-unified-audio-ecosystem`
Review PR: [Draft PR #265](https://github.com/ravaunrichards/Minglora-Social-Network/pull/265)
Supabase project: existing Minglora project `gzycobgbasnqqhnympkr`

## Overall status

**Foundation implemented; full ecosystem remains in progress.** This tracker deliberately separates code committed, live database work, CI verification, deployed runtime, and actual installed sound files.

## Verified completed

- [x] Inspected existing Sounds Studio, generated sound pack, ringtone preferences, call/notification settings, private storage policies, media upload routes, and Admin Centre conventions.
- [x] Kept existing call, notification, ringtone, LiveKit, MeetWave, media and user preference code in place.
- [x] Added canonical sound category and event registry.
- [x] Added audio filename, source, technical metadata, SHA-256, origin-type, authenticity and rights validation.
- [x] Added explicit rejection of procedural/synthetic/AI-generated/robotic audio for the official recording catalogue.
- [x] Added the 15-table relational schema for category, event, asset, source, licence, versions, assignment, profiles, preferences, favourites, projects, tracks, usage, reports and audit records.
- [x] Applied the additive schema migration to the existing Minglora Supabase project.
- [x] Verified all 15 new tables exist with RLS enabled.
- [x] Verified direct SELECT is denied to both `anon` and `authenticated` for the new tables; the server-only `service_role` has database access.
- [x] Seeded 26 categories and registered event keys for messaging, calls, MeetWave, LIVE, gifts, coins, payments, posts, reels, stories, media, gaming, security, creator studio and AI.
- [x] Added MFA-protected owner API actions for catalogue listing, candidate registration, preview, authenticity/licence review, assignment and short-lived signed playback.
- [x] Added an owner-only Sound Management Centre page inside the existing Admin Centre.
- [x] Added actual-file upload through Minglora's existing private resumable Storage flow; browser metadata inspection and SHA-256; pending-review registration; private preview; and assignment of approved assets.
- [x] Added the user-supplied free-audio source directory and per-file licence checklist.
- [x] Added a reusable browser audio engine with event validation, short-lived signed URL caching, mute/volume controls, duplicate-event suppression, call-priority preemption and cleanup.
- [x] Connected new notification alerts and incoming/outgoing call ringtone lookup to central event resolution, retaining fallback only for a member's own uploaded personal recording when no approved platform assignment exists.
- [x] Removed oscillator-generated Messenger alerts, call ringback tones and LIVE speaker-request tones.
- [x] Disabled the legacy procedural 120-cue pack in personal sound selectors/previews and platform alert playback without deleting old binaries or stored preference IDs.
- [x] Loaded the engine before app clients and versioned the service-worker shell for the new script.
- [x] Added focused tests for taxonomy, filenames, file formats, metadata, rights gates, authentic-origin types, approval and assignment.
- [x] Confirmed the existing sound buckets remain private and no new audio files were installed.
- [x] Created a draft review PR rather than merging an unverified change set.

## In progress

### Phase 2 — Admin Management Centre

- [x] Upload and register authentic recording candidates.
- [x] Record source, licence, attribution, format, duration, size and SHA-256.
- [x] Preview pending assets using a short-lived private URL.
- [x] Approve or reject pending recordings.
- [x] Assign approved recordings to active platform events.
- [ ] Full category/subcategory create, rename, reorder and deactivate controls.
- [ ] Sound profile editor, preview, schedule, draft/publish, rollback and emergency disable.
- [ ] Asset replace, trim, crop, fade, gain and format conversion controls.
- [ ] Storage, usage, broken-reference, duplicate and audio-error reporting.

### Phase 3 — Universal Audio Engine

- [x] Server-side event resolver and secure 5-minute signed playback URL.
- [x] Shared browser audio engine and event playback queue with expiry-aware signed URL cache.
- [x] Existing notification and incoming call ringtone lookup use central events first, while preserving mute, category enable and volume preferences.
- [ ] Shared Android/iOS/desktop audio engine adapters using the same event contract.
- [ ] Global user mute, master/category volume and interruption handling integrated with existing settings.
- [ ] Direct event adapters for MeetWave, LIVE, gifts, transactions, posts, reels, stories, gaming and accessibility.
- [ ] Playback queue, deduplication, cache expiry and cleanup across feature transitions.
- [ ] Audio latency, device routing and real-device verification.

### Phase 4 — User Audio Studio

- [ ] User upload and recording UI.
- [ ] Personal private audio library and favorites/collections.
- [ ] Multitrack timeline for source audio, music, voiceovers, effects and additional tracks.
- [ ] Per-track mute, volume, trim, start/end, speed and fades.
- [ ] Draft persistence, synchronized preview, export and rendering.
- [x] Relational project and project-track tables created.

### Phase 5 — Discovery and Creator Audio

- [ ] Searchable music and sound-effect discovery.
- [ ] Trending/recent/popular and category/mood discovery.
- [ ] Creator-original audio publishing and management.
- [ ] Creator attribution, usage permissions, copyright reports and removal workflow.
- [ ] Usage analytics and licensing territory checks.

### Phase 6 — Platform integration

- [ ] Messaging and Messenger.
- [ ] Voice/video calls and call lifecycle.
- [ ] MeetWave.
- [ ] LIVE audio and video, gifts, coins and celebration sounds.
- [ ] Posts, photos, albums, reels, stories, videos and creator editing.
- [ ] Gaming and future Marketplace/transactions only where activated.
- [ ] AI speech/speech-to-text with explicit AI labeling and consent.
- [ ] Accessibility descriptions, transcripts and screen-reader integration.

## Blocked / not yet verified

- Actual real recordings have not been downloaded, checksum-tested and approved yet. The official catalogue therefore has **zero newly installed approved sound assets**.
- The existing 120-file generated WAV pack is procedurally synthesized and does not meet the new authenticity standard. It has not been deleted or grandfathered into the new registry because existing user preferences may still reference it.
- Source websites are a discovery list only. No website or download has been treated as blanket commercial or redistribution permission.
- Supabase Edge Function code in the PR has not yet been deployed.
- Render application code has not yet been deployed from the feature branch.
- Browser, Android, iOS, desktop, Bluetooth, low-bandwidth, and background-call tests have not yet been completed.
- The full application test suite has not yet completed on the latest corrected revision.

## CI checkpoints

- Repository structure check: passed on the second run after removing one redundant empty-folder `.gitkeep` placeholder; no reference screenshots were removed.
- Supabase Auth/OAuth acceptance: passed.
- For You functional navigation: passed.
- JavaScript syntax: an Admin Centre template-literal delimiter error was found and corrected; latest rerun is pending.
- Shared audio engine unit tests added for secure URL resolution, mute/volume, URL caching, duplicate suppression and call-priority preemption; latest CI execution is pending.
- Audio registry automated tests: pending CI execution.
- Full repository test suite: pending.
- Supabase security/performance follow-up: pending after the feature runtime is deployed.

## Data and rollout safeguards

- Do not delete or rewrite existing sound preferences or legacy media.
- Do not publish an asset based only on a source website name or a "free" download label.
- Require actual binary presence, a matching checksum, source record, verified licence, commercial-use permission, redistribution permission, and manual authenticity review.
- The private media bucket and short-lived signed URLs must remain the only playback delivery path for official audio.
- `anon` and `authenticated` remain without direct database access to the new catalogue tables.
- Deploy Edge Function and Render runtime changes only after CI and migration compatibility checks pass.
- Do not mark a platform event as complete until its event adapter is wired and exercised on a supported device.

## Completion rule

The full Minglora audio ecosystem is not complete until the pending items above are implemented, integrated, tested on supported devices, and backed by actual approved recordings. A working Admin Centre page alone is not completion.
