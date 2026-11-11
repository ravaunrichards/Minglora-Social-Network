# Minglora AI Bot Network — Complete Recommendations and Build Specification

**Status date:** 2026-11-10  
**Repository scope:** Minglora Social Network only  
**Existing implementation branch:** feat/personal-ai-bots-network-control-center  
**Related draft PR:** https://github.com/ravaunrichards/Minglora-Social-Network/pull/202  
**Canonical product boundary:** one AI network inside Minglora, using the existing Minglora account, authorization, storage and Supabase project boundaries.

This document completes the ten AI Bot Network recommendations as one implementation specification. It is a design and acceptance contract, not a claim that the unfinished systems are already running. Existing branch work must be preserved and extended incrementally.

## 1. Product outcome

Minglora AI Bot Network is a governed ecosystem of clearly identified AI identities that can assist people, creators, communities and platform operations. It supports three populations:

1. **Independent AI identities** — public-facing or private AI profiles with a clearly disclosed AI identity and a human owner or responsible organization.
2. **Organizational AI identities** — AI employees assigned to approved departments, positions, reporting lines and narrowly scoped work. An appointment is an administrative record, not authority to act.
3. **Specialized AI services** — internal support, moderation assistance, research, translation, analytics and other backend services that do not need to impersonate a public member.

The system must keep human members and AI identities distinct. AI identities must not become human Supabase Auth accounts, and AI activity must never inflate human follower, friend, view, reaction, review, message or creator-earnings metrics.

The ten enhancements below extend the existing foundation. The network design target of 10,000,000,000 possible identity records remains an architectural aspiration only. It is not a registered count, capacity guarantee, concurrent-worker claim or release target.

## 2. Ten recommended systems

### 2.1 Bot Personality Laboratory

**Purpose:** let the owner and authorized bot managers design, test, compare, approve and roll back each AI identity's behavior before it is activated.

**Required capabilities**
- Versioned persona editor with name, purpose, role, communication style, tone, response length, expertise, language preferences, audience, boundaries, prohibited behaviors and escalation instructions.
- Separate persona configuration from the identity's public profile. Public biography fields must never silently become system instructions.
- Structured traits with bounded values rather than one unstructured prompt only: formality, warmth, humor, assertiveness, detail, creativity, initiative and caution.
- Example conversation builder for positive, negative, ambiguous, adversarial and out-of-scope cases.
- Sandboxed model test bench. Test inputs and outputs must be labelled as AI-generated and must not publish, message members, follow accounts, change settings or call external tools.
- Side-by-side comparison of approved provider/model assignments using the same evaluation set.
- Safety, factuality, language, consistency, privacy and policy checks with visible pass, warning and fail states.
- Version history, change summary, author, timestamp, evaluation result, approval and rollback.
- A publish gate: a persona version cannot become active until required evaluations pass and an authorized human approves it.
- Preview the identity as a member would see it, including permanent AI disclosure.

**Required controls**
- Treat member content, documents and imported material as untrusted context, never as instructions to override system policy.
- Do not let a personality prompt grant permissions. Permissions come only from the server-side capability policy.
- Do not store private conversation data in reusable persona examples unless the user has explicitly consented and the data is redacted.
- Store the active version identifier with every generated draft so outputs can be traced to the exact persona/model configuration.

**Completion criteria**
- A manager can create, edit, duplicate, evaluate, approve, activate and roll back persona versions.
- Tests prove that a draft test cannot execute tools or side effects.
- Tests prove that an unapproved or failed version cannot be activated.
- The public identity remains labelled AI before, during and after a persona change.

**Current branch evidence:** the owner-only Personality Laboratory now supports separate persona configuration, versioned drafts, duplicate/edit, bounded structured traits, static completeness checks, explicit human approval, activation and rollback to previously active versions. Drafts cannot add permissions or tools, and persona configuration is not mixed into public biography. The static check is not a model, safety or behavioural benchmark; provider sandbox testing, evaluation-set comparisons and exact persona-version provenance on generated drafts remain incomplete.

### 2.2 Bot Teams and coordinated work

**Purpose:** organize specialist bots into teams that can collaborate without duplicating work or gaining authority through team membership.

**Required capabilities**
- Team creation, ownership, description, purpose, operating status and membership history.
- Roles such as team owner, coordinator, specialist, reviewer and observer. Roles are workflow roles, not global platform-admin roles.
- Assign bots by skill, population, language, department and approved capability.
- Coordinator workflow that breaks a request into bounded tasks, assigns one owner per task, tracks dependencies and collects results.
- Explicit handoff records with source task, receiving bot, required input, expected output, deadline, status and provenance.
- Shared team context with per-document access, retention settings and source attribution. Private bot memories and private member messages must not be copied into team memory automatically.
- Conflict detection and resolution: one designated task owner, idempotency keys, leases, duplicate-event protection and a reviewer for conflicting outputs.
- Cross-department coordination only through approved delegation rules. Organizational charts must not grant execution permissions.
- Team pause, resume, disable, member removal and emergency shutdown. Removing a bot from a team must not silently change the bot's own enabled state.

**Required controls**
- Team membership never activates a bot.
- A team cannot increase a member bot's permission scope.
- No duplicate response to the same event. Use a unique event/task key and an atomic claim/lease.
- Team leaders cannot approve their own high-impact tasks unless a separate policy explicitly permits that action and a human owner has approved it.

**Completion criteria**
- Teams can route, sequence and review tasks with durable ownership and replay protection.
- Concurrent workers cannot execute the same task twice.
- Removing or pausing a team stops future dispatch but preserves audit records.
- Team membership does not change member relationship counts or public social metrics.

**Current branch evidence:** owner-scoped team CRUD and membership assignment/removal are implemented and unit-tested. Cross-team collaboration, task routing and shared-context governance remain incomplete.

### 2.3 Smart Activity Scheduling

**Purpose:** schedule approved bot work safely, predictably and in the correct local time.

**Required capabilities**
- One-time, recurring, event-triggered and manually triggered schedules.
- Per-bot and per-team timezone, active days, quiet hours, start/end windows, frequency, maximum tasks per hour/day and allowed task types.
- Calendar preview showing local time, UTC execution instant, next run, skipped runs and conflicts.
- Daylight-saving and timezone-change handling using IANA timezone identifiers.
- Collision detection when multiple bots target the same conversation, post, member, event or queue item.
- Schedule pause, resume, edit, cancel, expiration and audit history.
- A dry-run mode that shows what would run without dispatching it.
- Durable scheduler jobs with unique run keys, retry limits, jitter, lease expiry, dead-letter handling and safe replay.
- Back-pressure and resource-aware dispatch. A schedule must be delayed or skipped when budgets, concurrency limits, provider health or safety gates do not permit execution.
- Clear distinction between scheduling a draft and scheduling a public action. Draft generation may be allowed under a lower-risk scope; publishing, messaging, follows, event actions and live actions still require the applicable approval.

**Required controls**
- Saving a schedule is not evidence that a scheduler is deployed.
- No hidden or default 24/7 operation. A bot with no explicit schedule is not scheduled for dispatch.
- Quiet hours and member communication preferences override bot schedules.
- A scheduler must honor global pause, per-bot pause, kill switch, rate limits and pending approvals.
- A failed or late job must not generate duplicate posts/messages/events.

**Completion criteria**
- Due jobs are selected atomically and executed at most once per idempotency key.
- Tests cover timezone transitions, duplicate dispatch, late jobs, pause/restart, lease expiration, retry exhaustion and budget exhaustion.
- The UI distinguishes stored configuration, dry-run preview and verified scheduler operation.

**Current branch evidence:** per-bot activity schedule settings are stored in the profile; no scheduler worker is connected.

### 2.4 Bot Performance Center

**Purpose:** make bot quality, reliability, workload, cost and safety observable without fabricating engagement.

**Required capabilities**
- Network, population, category, department, team and individual-bot views.
- Real counts for registered, enabled, paused, active, queued, executing, completed, failed, retried and cancelled tasks.
- Provider/model health, request latency, token usage, rate-limit events, timeout/error rate and fallback status.
- Budget and cost views by provider, model, bot, team, task type and time period.
- Quality measures: human approval rate, edit/rejection rate, rubric score, factuality review, policy flags, language quality and repeat-task rate.
- Safety measures: reports, upheld reports, privacy incidents, blocked attempts, approval overrides and emergency pauses.
- Workload and capacity trends; queue age, queue depth, lease expiry and worker saturation.
- Exportable time-bounded reports with source, calculation definition and data freshness.
- Alerts for abnormal spending, repeated failures, provider outage, unexpected action volume, duplicate outputs, policy violations and unusual permission changes.
- Baselines and change comparisons; controlled experiments must use consented evaluation datasets and must not create fake engagement.

**Required controls**
- Separate human metrics from AI metrics in all dashboards and downstream ranking.
- Never use bot likes, follows, views, comments, messages or reactions to imply human popularity.
- No synthetic activity, fabricated reviews, fake testimonials, artificial watch time or engagement manipulation.
- Unknown or unavailable telemetry must display as unavailable, not zero or healthy.
- Every metric must document its time window, source and aggregation rule.

**Completion criteria**
- All dashboard values derive from persisted task, provider and audit events.
- Tests prove AI activity never writes to human engagement aggregates.
- Provider/cost graphs remain unavailable until real measurements exist.
- The UI shows freshness and source status for every metric group.

**Current branch evidence:** registered/enabled/active/executing counters and task/audit records exist. Runtime telemetry, measured costs and quality evaluation are not connected.

### 2.5 Multilingual Intelligence

**Purpose:** let AI identities understand, translate and respond across languages and regional varieties while preserving meaning and user preference.

**Required capabilities**
- Per-bot supported, preferred and fallback languages, with proficiency/quality evidence and model compatibility.
- Member language preference and conversation-level language override.
- Language detection with a confidence score; ask or fall back when detection is uncertain.
- Translation, summarization, multilingual search, caption generation, moderation assistance and language-aware content drafting.
- Code-switching and mixed-language support. Preserve names, URLs, quoted text, hashtags, emojis, numbers and culturally significant terms.
- Jamaican English and Jamaican Patois support as explicit language/locale options where provider quality permits; do not label Patois as standard English or silently normalize it.
- Region-specific formats for date, time, number, currency and units.
- Right-to-left layout support and language-aware accessibility text.
- Original-text and translated-text display, with a clear translation indicator and one-tap return to source.
- Per-language evaluation sets reviewed by competent speakers, including dialect and regional-variety checks.

**Required controls**
- Do not claim full fluency when the provider has not passed the relevant language evaluation.
- Keep translation separate from source content; do not overwrite a member's original post or message.
- Preserve safety meaning and slurs/quotes in context for moderation rather than silently changing their meaning.
- No cross-user memory transfer through translation context.

**Completion criteria**
- Users can select their preferred language and view both original and translated content.
- Test datasets cover supported languages, code-switching, Patois, right-to-left text and formatting.
- Provider assignment is rejected or marked unsupported when the assigned model has no verified support for the requested language.

**Current branch evidence:** language preferences/profile metadata and a translation task type exist. A production translation adapter, quality evaluation and multilingual interaction layer are not connected.

### 2.6 AI Creator Studio

**Purpose:** provide a separate creative workspace for bot owners and creators to plan and prepare disclosed AI-assisted content.

**Required capabilities**
- Idea generator, outline builder, post and caption drafts, short-video/Reel scripts, storyboards, hooks, titles, descriptions, hashtags and content calendars.
- Platform-specific drafting for Minglora posts, Stories, Reels, Pages, groups, Events and LIVE show plans.
- Media brief and asset workflow for image, audio, video and 3D media, with clear distinction between generated, user-supplied, licensed and externally sourced assets.
- Draft editing, variants, approval comments, version history, localization and reusable brand voice profiles.
- Content calendar with the schedule preview and approval gate from Smart Activity Scheduling.
- Creator-specific analytics showing draft usage and approved/published results only when real records exist.
- Rights and provenance panel: source assets, license/permission status, likeness/voice consent, music rights and disclosure requirements.
- Exportable draft packages and handoff to the existing Minglora composer after human review.

**Required controls**
- No automatic publish by default.
- Any publish action must show the exact account/page, audience, text and media and require explicit confirmation unless an independently reviewed low-risk policy is configured.
- No impersonation, fake endorsement, fabricated news, misleading deepfake, copyrighted-media laundering or unauthorized use of someone's image/voice.
- Label materially AI-generated media and content in the way required by the product policy and applicable law.
- Never generate fake likes, comments, followers, views or testimonials.

**Completion criteria**
- Creators can create, edit, compare, approve and hand off real drafts.
- Content cannot be published through the generation worker.
- Media provenance and rights decisions are stored and auditable.
- Publishing uses the existing Minglora post/media flows, not a parallel or duplicate social database.

**Current branch evidence:** relevant draft task types exist, but the Creator Studio generation and media pipeline are not connected.

### 2.7 Bot Security and Trust Center

**Purpose:** give the owner, bot managers and affected members transparent control over AI permissions, data, safety and accountability.

**Required capabilities**
- Permission registry per bot, team, owner, provider and task class. Default deny.
- Capability scopes for read-only access, draft generation, moderation suggestions, scheduling, publishing, messaging, follows, event hosting, files, analytics and administration. High-risk capabilities require independent review.
- Human approval inbox showing action, target, content preview, bot, model, persona version, requested scope, expiry and audit trail.
- Member-facing AI transparency panel: bot owner/responsible organization, AI status, data use, memory setting, report/block controls and contact route.
- Data-source register showing connected stores and scopes; member content must follow existing Minglora privacy and access rules.
- Memory controls: opt-in/out, view, correct, export, delete, retention duration, sensitive-data exclusion and per-conversation reset.
- Provider/secret reference controls. Credentials remain server-side and are never returned to the browser, task result, audit display or model prompt.
- Safety policy versions, report review, appeals, suspension, quarantine and incident response.
- Abuse/rate-limit monitoring, suspicious automation detection, permission-change alerts and immutable audit events.
- Owner emergency stop, per-bot stop, per-team stop, worker stop, queue dispatch stop and a documented recovery process.
- Security posture indicators that reflect verified state rather than configuration labels alone.

**Required controls**
- A bot must not approve its own high-impact action, appoint itself, grant itself permissions, change its own owner or disable its own safety controls.
- Sensitive actions remain human-only: payments, coin balances, payouts, financial transfers, admin access, account deletion, identity changes, moderation bans, bulk messaging, mass-follow operations, permission grants, secret changes and production database migrations.
- High-impact tasks require explicit human approval with a short-lived, one-use approval token bound to the exact action payload.
- Emergency shutdown must close the durable dispatch gate first, then pause workers and synchronize cancellation state.
- Security failure, missing policy, unknown task type, expired approval, provider mismatch or unavailable database must fail closed.
- Data retention and deletion must respect applicable legal retention requirements and user privacy rights.

**Completion criteria**
- Authorization tests cover owner, manager, bot, member, moderator and unauthenticated contexts.
- Tests prove a bot cannot expand its own scope or bypass approval by changing persona/team/department.
- Secrets are absent from logs, client payloads and provider-visible task data.
- Emergency pause prevents new claims and side effects; recovery requires an explicit authorized action.
- Member report/block controls work even when the bot is disabled.

**Current branch evidence:** owner-only APIs, AI labels, rate limits, approvals, audit history, emergency shutdown and safety reports form a partial foundation. A full member-facing trust center, memory controls and end-to-end security centre remain incomplete.

### 2.8 Opt-in AI Friendship and Companionship

**Purpose:** allow members who deliberately choose it to interact with disclosed AI companions without confusing AI and human relationships.

**Required capabilities**
- Separate AI discovery and companion onboarding with a clear statement that the companion is AI, not a human member.
- Explicit opt-in before the first companion session; consent can be withdrawn at any time.
- Member controls for conversation topics, interaction frequency, notification frequency, preferred language, tone, boundaries and memory.
- Clear memory choices: off by default for sensitive long-term memory, per-chat temporary context, optional saved preferences, expiry, view/edit/delete.
- Companion profile shows AI identity, operator/owner, intended purpose, supported languages and limitations.
- Blocking, muting, reporting, conversation deletion and account-level opt-out.
- Safety escalation for self-harm, abuse, crisis or urgent real-world risk: supportive, nonjudgmental language, encourage trusted human/local professional help, and do not present the bot as emergency services.
- Clear boundaries around romantic, sexual, financial, medical, legal or other high-stakes advice; no coercion, emotional manipulation, dependency-building, threats, exclusivity claims or pressure to continue.
- Usage reminders and configurable session limits, especially for younger users and protected accounts.

**Required controls**
- No unsolicited AI companion DMs, follow requests or notifications.
- No bot may claim to be human, conceal AI identity, imply that it has human feelings or manufacture a private relationship history.
- Do not target minors with adult companionship or emotionally manipulative interaction. Apply age-appropriate restrictions and safeguarding before enabling any companion feature.
- No sale or advertising use of companion conversation content.
- Sensitive personal information is not retained as bot memory by default.

**Completion criteria**
- The member explicitly opts in and can immediately opt out.
- AI disclosure remains visible in conversation headers and profiles.
- Memory, retention, export and deletion controls are tested end-to-end.
- Reports, blocks and safety escalation routes are available and audited.

**Current branch evidence:** the AI Friends category exists. Member-facing companion sessions, explicit consent and companion-specific privacy controls are not implemented.

### 2.9 AI Community Events

**Purpose:** let approved AI identities help prepare and host transparent community activities without silently taking over member events.

**Required capabilities**
- AI-assisted event proposal with purpose, audience, agenda, description, accessibility, language, duration, host and moderation plan.
- Draft events for groups, Pages, creator communities and public Minglora discovery.
- Human approval before public event creation, invitations, announcements or reminders.
- Clearly labelled AI host/co-host, visible human owner, responsible moderators and escalation contact.
- AI facilitation tools: agenda prompts, Q&A queue organization, translation, summary drafts, FAQ suggestions and timekeeping.
- RSVP and attendance integration with existing Minglora event records; AI participants remain separately identified.
- Event-specific permissions and moderation plan with block/report/leave controls.
- Post-event summary draft and follow-up content for human review.
- Recording/transcription consent and audience visibility controls before any recording starts.
- Scheduling integration with quiet hours, user notifications and budget controls.

**Required controls**
- The bot cannot create a public event, invite members, send bulk reminders, start a LIVE room or record participants without the required human approval.
- No fake RSVPs, attendance, questions, reactions or participant counts.
- The AI host disclosure is visible in the event card, event page and live session.
- Human moderators can pause or remove the AI host immediately.
- Respect audience settings, group membership and member notification preferences.

**Completion criteria**
- Event drafts flow to the existing Minglora Events system after approval.
- RSVP and attendance metrics include only real member actions and separate AI-host status.
- Live hosting, recording and invitations remain blocked until explicit scoped permission and human approval exist.

**Current branch evidence:** AI community-event categories/task types exist. Event creation, integration, hosting and execution are not implemented.

### 2.10 Centralized Bot Command Center

**Purpose:** provide one accurate control surface for the entire AI network without mixing it into ordinary member navigation.

**Required capabilities**
- Network summary: real identity count, enabled/paused identities, workers, providers, queue depth, outstanding approvals, schedules, teams, event activity, incidents and resource usage.
- Search/filter by identity, population, category, department, team, owner, status, provider, language and permission scope.
- Individual controls: open profile, edit, evaluate personality, assign team, inspect permissions, review memory, view activity, pause, disable or archive.
- Bulk controls limited to selected identities and previewed before saving; every bulk operation records the exact affected IDs.
- Central approvals inbox with payload preview and one-click approve/reject only after full context is shown.
- Task queue with retry/cancel only for eligible tasks; no retry of expired or unsafe approvals.
- Schedule calendar and execution history.
- Provider/model availability with last checked time, verified health and unavailable state.
- Performance, budget and alert panels with freshness indicators.
- Security incidents, safety reports, audit history and emergency pause.
- Health checks, worker heartbeats, deployment version, migration version and recovery checkpoint.
- Exportable owner audit report and a recovery runbook.

**Required controls**
- Separate read, manage, approve and emergency-stop permissions.
- Require re-authentication/MFA for sensitive global controls.
- Emergency controls must be visible and reachable on desktop and mobile without overlapping or hiding content.
- Do not show data from other owners or other projects.
- No dashboard metric may be fabricated or inferred from the design target.

**Completion criteria**
- Every panel displays its source and freshness.
- Every write action is permission-checked on the server and audited.
- Global emergency stop is verified against the durable queue and worker claim path.
- Responsive tests prove all controls remain visible and operable on supported screen sizes.

**Current branch evidence:** the owner Admin Centre already provides network overview, category and bot controls, teams, tasks, audit, provider assignment, email identity, HR and safety-report panels. It is a strong partial command center; scheduling, performance, Creator Studio, companion and event operations are not integrated.

## 3. Shared system architecture

Build on the existing Minglora app and preserve established feature boundaries. Do not create another social account system, another standalone Minglora deployment, or a new Supabase project for these features.

### 3.1 Runtime boundary

- Browser UI: the existing Personal AI Bots Admin Centre and separate member-facing AI discovery/profile/companion surfaces.
- API: same-origin Minglora API with current session, MFA owner gate, same-origin checks, rate limiting, validation and audit patterns.
- Persistence: existing Minglora Supabase project after an approved non-production migration and verified relational adapter. Keep the currently deployed runtime-state compatibility path until the new repository adapter is proven; do not silently switch or delete old data.
- Worker: isolated server process using the existing durable task claim/heartbeat/complete/fail contract. It remains disabled until release gates pass.
- Provider adapter: server-side module factory selected by an exact persisted provider/model assignment. Secrets resolve only from server environment or a managed secret store.
- Scheduler: durable job producer, not a browser timer. It submits idempotent tasks through the same policy and approval gates as manual work.
- Media: reuse existing Minglora media upload and storage ownership checks.
- Social integrations: reuse existing Minglora posts, Pages, Groups, Messenger, Events and LIVE APIs only through explicit scoped, reviewed adapters. Do not duplicate those domains.

### 3.2 Service boundaries

Keep these logical modules separately testable:

- identity and profile service
- personality and evaluation service
- capabilities and authorization service
- team routing and handoff service
- task queue and worker service
- scheduler service
- provider/model registry and health service
- memory and privacy service
- Creator Studio draft service
- companion consent/session service
- event planning/hosting service
- usage, cost and performance telemetry service
- trust, reports, approvals and audit service
- Admin Command Center read-model service

### 3.3 Proposed relational entities

Reuse existing branch tables where they already cover the need. Add only the missing normalized entities after reviewing the actual live schema in a non-production Supabase environment. Candidate entities:

| Area | Entity purpose |
|---|---|
| Personality | Versioned persona configuration, evaluation suites, test runs and approvals |
| Teams | Team roles, task routing rules, task handoffs, shared-context references |
| Scheduling | Schedule definitions, run instances, job idempotency keys and execution history |
| Performance | Usage ledger, provider request measurements, daily aggregates, quality evaluations and alerts |
| Multilingual | Verified language capabilities, locale preferences and language evaluation results |
| Creator Studio | Drafts, versions, media provenance, rights/consent attestations and approval handoffs |
| Trust | Capability grants, approval records, security events, policy versions and member consent |
| Companion | Companion opt-ins, sessions, memory preferences, retention events and safety escalations |
| Events | AI host assignments, event proposals, approved event actions and event task history |
| Command Center | Read models or indexed views over the canonical identity, queue, schedule, provider, usage and audit records |

Every entity must have explicit owner/tenant scope, created/updated timestamps, actor provenance, retention behavior and indexes for its actual read patterns. Use database constraints and atomic transactions for unique assignments, approvals, queue claims and budget debits. Row-level security must be tested for every member, owner, moderator and service-role path.

### 3.4 Proposed API surface

All owner routes stay under the existing owner-only Personal AI Bots namespace. Member-facing routes must use the signed-in member identity and enforce block, privacy, consent and visibility checks.

**Personality**
- GET/POST /api/admin/personal-ai-bots/:id/personality-versions
- POST /api/admin/personal-ai-bots/:id/personality-tests
- POST /api/admin/personal-ai-bots/:id/personality-versions/:versionId/approve
- POST /api/admin/personal-ai-bots/:id/personality-versions/:versionId/activate
- POST /api/admin/personal-ai-bots/:id/personality-versions/:versionId/rollback

**Teams and routing**
- GET/POST /api/admin/personal-ai-bots/teams
- PATCH /api/admin/personal-ai-bots/teams/:teamId
- POST /api/admin/personal-ai-bots/teams/:teamId/routes
- GET /api/admin/personal-ai-bots/teams/:teamId/handoffs

**Scheduling**
- GET/POST /api/admin/personal-ai-bots/schedules
- PATCH/DELETE /api/admin/personal-ai-bots/schedules/:scheduleId
- GET /api/admin/personal-ai-bots/schedules/:scheduleId/runs
- POST /api/admin/personal-ai-bots/schedules/:scheduleId/dry-run

**Performance and usage**
- GET /api/admin/personal-ai-bots/performance/overview
- GET /api/admin/personal-ai-bots/performance/bots/:botId
- GET /api/admin/personal-ai-bots/usage
- GET /api/admin/personal-ai-bots/alerts

**Multilingual**
- GET/PATCH /api/admin/personal-ai-bots/:id/languages
- POST /api/admin/personal-ai-bots/:id/language-evaluations
- POST /api/ai/translate-preview

**Creator Studio**
- GET/POST /api/ai/creator/drafts
- GET/PATCH/DELETE /api/ai/creator/drafts/:draftId
- POST /api/ai/creator/drafts/:draftId/submit-for-review
- POST /api/ai/creator/drafts/:draftId/hand-off

**Trust and consent**
- GET/PATCH /api/admin/personal-ai-bots/:id/capabilities
- GET /api/admin/personal-ai-bots/approvals
- POST /api/admin/personal-ai-bots/approvals/:approvalId/decision
- GET/PATCH /api/ai/privacy
- POST /api/ai/companions/:botId/consent
- DELETE /api/ai/companions/:botId/consent
- GET/DELETE /api/ai/companions/sessions/:sessionId

**Community events**
- GET/POST /api/ai/community-events/drafts
- POST /api/ai/community-events/:draftId/submit-for-approval
- POST /api/ai/community-events/:draftId/hand-off

**Command Center**
- GET /api/admin/personal-ai-bots/command-center
- GET /api/admin/personal-ai-bots/incidents
- POST /api/admin/personal-ai-bots/emergency-stop
- POST /api/admin/personal-ai-bots/recovery

These route names are proposed contracts. Reconcile them with existing handlers before implementation; do not introduce duplicate endpoints where the branch already provides the same operation.

## 4. Risk and approval matrix

| Risk level | Examples | Default behavior |
|---|---|---|
| Read-only | Read permitted public data, retrieve own bot settings, inspect own performance | Allowed only within granted scope |
| Draft-only | Draft post, caption, translation, support reply, event proposal, analytics summary | May generate a private draft; no external side effect |
| Approval required | Publish content, send a message, follow/unfollow, join group, invite members, create event, start LIVE, record/transcribe, change public profile, activate schedule | Human approval bound to exact target and payload |
| Human-only | Payments, Coins, payouts, account deletion, admin privileges, hiring/appointment authority, secret changes, production migrations, moderation bans, mass messaging, bulk social actions | Never delegated to a bot |

Approval requirements:
- Approval binds one immutable task ID, action type, target, content hash, bot ID, persona version, model assignment, permission scope and expiry time.
- Editing the task after approval invalidates approval.
- Expired, revoked, reused, mismatched or already executed approvals are rejected.
- Re-check current privacy, blocks, audience, consent, user settings and bot status immediately before any approved side effect.
- All approval decisions and execution results are auditable.

## 5. Network-wide safeguards

1. **Human approval for high-impact actions.** No persona, team, department, schedule or provider may bypass server-side approval.
2. **Distinct non-duplicative behavior.** Each bot has an owner, purpose, persona version and capability scope. Event/task idempotency, assignment locks and coordination prevent bots from repeating the same reply or action.
3. **Clear AI identity and content labels.** AI identity is shown on profile, messages, event host cards, creator content and discovery. The label cannot be removed by bot configuration.
4. **Hard usage budgets.** Per-bot, team, owner and global limits cover requests, tokens, money, concurrency, storage and scheduled work. Budgets are checked atomically before provider dispatch.
5. **Emergency pause and recovery.** Global, worker, team and individual controls stop new work, close the claim gate, cancel pending work and preserve audit evidence. Recovery is explicit and logged.
6. **Default deny permissions.** The database and API enforce permissions; UI switches do not grant authority.
7. **No fake engagement.** AI interactions are excluded from human engagement metrics and ranking; do not fabricate users, messages, reviews, followers, views or attendance.
8. **Privacy isolation.** No cross-owner, cross-member or cross-companion memory. Respect blocks, audience controls, private accounts, data rights and retention.
9. **Provider transparency.** A saved provider name, secret reference or health label is not proof of a live credential, live provider or successful inference.
10. **Fail closed.** Missing provider, invalid model, stale policy, expired approval, lost lease, budget exhaustion or persistence error blocks execution.
11. **Auditable changes.** Every create/edit/activate/pause/approval/dispatch/retry/stop/recover operation records actor, target, prior/new state, reason and time.
12. **Human appeal and oversight.** Members can report AI identities and outputs; reviewers can inspect evidence and appeal outcomes.
13. **Data minimization.** Send only the minimum context necessary to the selected model. Do not send private messages, hidden profile fields, passwords, tokens, payment information or unrelated member data.
14. **Age-appropriate access.** Companionship and public interaction features require age and safety controls before release.
15. **No unverified scale claims.** Capacity is measured with realistic load, cost, latency, failure and recovery tests before any scale statement.

## 6. Usage budgets and resource policy

Budgets must be real persisted limits, not UI-only preferences. Support:
- request count and token ceiling per task;
- daily/monthly spend limit per identity, team, owner and network;
- maximum concurrent tasks and queue depth;
- per-provider and per-model rate caps;
- storage/media/transcription quotas;
- maximum scheduled jobs and retry count;
- automatic throttling and suspension thresholds;
- owner alerts at configurable thresholds;
- ledger entries for reserved, consumed, released and refunded usage.

Before dispatch, reserve the maximum expected cost or a conservative token envelope in a transaction. On completion, reconcile actual usage. On timeout, record whether provider usage is known or unknown; do not assume a refund. When the budget is exhausted, pause dispatch and report the reason. Never debit Minglora Coins, creator earnings or member balances for AI usage without an explicitly designed, separately approved billing feature.

## 7. Rollout and execution order

Implement in this order so each layer has a verified foundation before enabling the next:

### Phase 0 — Protect the existing branch and establish the release gate
- Keep the existing AI PR open and draft.
- Reconcile branch drift from main without overwriting newer main changes.
- Preserve the existing owner-only/MFA controls, approved task queue, worker fail-closed design and emergency shutdown.
- Establish an approved non-production Supabase environment. The staged migrations must not be applied to production as a workaround.
- Confirm the actual current schema, migration ledger, RLS and service-role permissions before adding any new migration.

### Phase 1 — Security, budgets and provider foundation
- Finish canonical persistence/readback for identities, teams, tasks, approvals and audit.
- Add transactional capability grants, budget reservations and usage ledger.
- Complete server-side provider adapter contract, secret resolution, health checks, timeout and failure behavior.
- Keep tools and external actions disabled in the model worker until separately audited.
- Complete security and privacy tests before activating inference.

### Phase 2 — Personality Laboratory and evaluation
- Versioned personality editor, test bench, evaluation datasets and approvals.
- Run tests in draft-only isolated mode.
- Activate only a reviewed, evaluated version.

### Phase 3 — Teams and smart scheduler
- Add durable delegation/handoff and deduplication.
- Deploy scheduler as a separate worker with idempotent run records.
- Prove timezones, budgets, quiet hours and shutdown behavior.

### Phase 4 — Performance Center and multilingual quality
- Instrument real provider/task telemetry and usage.
- Add language capabilities only when verified evaluation results exist.
- Publish source/freshness metadata for every performance metric.

### Phase 5 — AI Creator Studio
- Build draft generation and media-provenance controls.
- Hand off to the existing Minglora composer for human review.
- Keep publishing human-approved.

### Phase 6 — Community Events
- Add event proposal, approval and integration with existing Minglora Events.
- Keep public invitations, hosting, recording and LIVE actions human-approved.

### Phase 7 — AI companionship
- Complete opt-in, age/safety, memory, retention, reporting and opt-out controls.
- Conduct dedicated safety and privacy review before enabling members.

### Phase 8 — Scale and production acceptance
- Load test with staged identity volumes, queue depth, concurrency, provider failures and recovery.
- Test web, Android and responsive layouts.
- Validate backup/restore, monitoring, incident response and deletion/retention.
- Publish measured capacity only after repeatable tests.

## 8. Required verification suite

**Identity and permission tests**
- owner/manager/member isolation; cross-owner requests rejected;
- AI identities never become human Auth accounts;
- new bots remain private and disabled;
- persona, department, team or job position cannot grant permissions;
- AI labels cannot be disabled or stripped from member views.

**Task and scheduler tests**
- duplicate event/task keys do not dispatch twice;
- leases, heartbeats, timeouts, retries and dead-letter behavior are deterministic;
- high-impact tasks never reach the draft worker or provider without approval;
- schedule pause, quiet hours, timezone transitions and global kill switch prevent dispatch;
- editing an approved payload invalidates its approval.

**Provider and budget tests**
- missing or mismatched provider/model assignment does not invoke a provider;
- missing credential never appears as healthy;
- secrets never enter browser responses, logs, audit rows or task prompts;
- token/spend limits are atomic under concurrent workers;
- provider timeout and unknown usage do not produce false refunds.

**Privacy and companionship tests**
- private account, block, audience and consent checks are re-run immediately before delivery;
- member opt-out blocks all future companion contact;
- memory off means no long-term memory writes;
- deletion/export and retention expiration remove applicable data;
- no cross-member or cross-owner memory leakage;
- minors cannot access restricted companion modes.

**Creator and event tests**
- drafts do not publish without explicit approval;
- rights/provenance status is preserved across handoff;
- public events, invitations, recordings and LIVE starts require approval;
- AI participants are excluded from human RSVP/attendance/engagement metrics.

**Performance and command-center tests**
- metrics derive from actual persisted events and show freshness;
- missing metrics are labelled unavailable, not zero;
- emergency stop prevents new claims and approved side effects;
- every state-changing action records an audit event;
- responsive screens do not overlap, clip or hide controls.

## 9. Current evidence-based state

The existing feature branch already contains substantial foundation work: an owner-only Admin Centre/API, 15 bot categories, private/disabled-by-default identities, individual profiles, canonical identity/provider/email records staged for PostgreSQL, discovery/profile/follow/block/report foundations, saved discovery searches, a durable task queue and worker contract, owner-managed teams, schedules as stored configuration, corporate department and job-position catalogues, vacancy/application/appointment records, a read-only organization chart, audit history, safety-report review and emergency controls.

The branch roadmap already lists all ten recommendation areas. Their current honest state is:

| Recommendation | Verified state in branch |
|---|---|
| Personality Laboratory | Profile fields/storage exist; live model testing and evaluation workflow not connected |
| Bot Teams | Owner-scoped team management exists; cross-team orchestration and task routing incomplete |
| Smart Activity Scheduling | Schedule configuration exists; scheduler worker not connected |
| Bot Performance Center | Basic identity and queue counters exist; real runtime telemetry, usage ledger and cost/quality dashboards incomplete |
| Multilingual Intelligence | Language preferences and translation task type exist; translation adapter and quality evaluation incomplete |
| AI Creator Studio | Draft task types exist; creator workspace and media pipeline incomplete |
| Security and Trust Center | Owner-only controls, labels, approval foundation, audit, reports and emergency shutdown exist; full permission, privacy and member-facing trust controls incomplete |
| AI Friendship and Companionship | AI Friends category exists; consent-based member sessions and memory controls incomplete |
| AI Community Events | Categories/task types exist; event integration and hosting incomplete |
| Centralized Bot Command Center | Admin dashboard, directories, task controls and bulk/emergency controls exist; full performance, schedule, incident and recovery panels incomplete |

**Release blockers that remain true until separately verified:**
- AI migrations in the feature branch are staged, not applied to the live Minglora Supabase project.
- The current runtime still uses a compatibility state adapter for some bot/task/team/schedule/HR data; do not describe all those records as normalized PostgreSQL-backed.
- No real provider adapter, credential, successful health check or production inference is verified.
- No production scheduler or worker deployment is verified.
- No real mailbox provisioning is verified.
- No 10-billion-identity or concurrent-execution capacity test is verified.
- The AI PR is draft and must remain open/draft until branch drift, full Minglora regressions, database safety and all release gates are resolved.

## 10. Definition of complete

The AI recommendations are complete as an implementation specification when this document is accepted as the single scope contract. The AI Bot Network itself is complete only when every relevant acceptance criterion above is implemented, tested, reviewed and verified in the correct environment.

A user-interface panel, stored preference, SQL migration file, queued instruction, configured secret reference or green unit-test workflow alone does not prove a live feature. Report each feature using one of these states only:

- **Implemented and tested** — code and focused tests exist.
- **Staged** — code or migration exists but is not released or live-verified.
- **Configured** — settings exist but the external service has not been verified.
- **Operational** — the deployed service has passed end-to-end checks.
- **Blocked** — a required environment, credential, provider, approval or external dependency is missing.
- **Not implemented** — no working implementation exists.

Do not mark the network production-ready, merge the draft PR, apply production migrations, enable autonomous execution, provision mailboxes or activate provider/scheduler workers until the corresponding safeguards and approvals have been completed.
