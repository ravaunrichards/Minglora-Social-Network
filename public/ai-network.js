(() => {
  'use strict';

  const API = '/api/ai-network';
  const root = () => document.getElementById('main-content');
  const state = { snapshot: null, busy: false, error: '', notice: '', identityRegistry: null, identityCategories: [], identityError: '' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const number = value => Number(value || 0).toLocaleString();
  const date = value => {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toLocaleString();
  };
  const options = (values, current) => values.map(value =>
    '<option value="' + esc(value.value) + '"' + (current === value.value ? ' selected' : '') + '>' + esc(value.label) + '</option>'
  ).join('');
  const card = (title, eyebrow, body, extra = '') =>
    '<section class="ai-network-card ' + extra + '"><div class="ai-network-card-heading"><div><span class="ai-network-eyebrow">' +
    esc(eyebrow) + '</span><h2>' + esc(title) + '</h2></div></div>' + body + '</section>';
  const empty = message => '<p class="ai-network-empty">' + esc(message) + '</p>';
  const pill = (label, kind = 'neutral') => '<span class="ai-network-pill ai-network-pill--' + kind + '">' + esc(label) + '</span>';
  const list = values => Array.isArray(values) ? values : [];
  const COUNTRY_CODES = 'AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR HR CU CW CY CZ CI DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF KP MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RO RU RW RE BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS KR SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TM TC TV TR UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW AX'.split(' ');
  const regionNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;
  const countryLabel = code => regionNames?.of(code) || code;
  const countryCode = value => {
    const normalized = String(value ?? '').trim();
    if (/^[A-Za-z]{2}$/.test(normalized) && COUNTRY_CODES.includes(normalized.toUpperCase())) return normalized.toUpperCase();
    return COUNTRY_CODES.find(code => countryLabel(code).toLowerCase() === normalized.toLowerCase()) || '';
  };
  const countryDatalist = '<datalist id="ai-network-countries">' + COUNTRY_CODES.map(code =>
    '<option value="' + esc(countryLabel(code)) + '"></option>'
  ).join('') + '</datalist>';

  async function request(path = '', options = {}) {
    const response = await fetch(API + path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: options.body ? { 'Content-Type': 'application/json', 'Accept': 'application/json' } : { 'Accept': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The AI Network request could not be completed.');
    return result;
  }

  function setNotice(message, type = 'success') {
    state.notice = message;
    state.noticeType = type;
    state.error = '';
  }

  function selectedValues(form, name) {
    return [...form.querySelectorAll('input[name="' + name + '"]:checked')].map(input => input.value);
  }

  function renderBotRows(bots) {
    if (!bots.length) return empty('No AI bots created yet. Create your first clearly labelled AI assistant below.');
    return '<div class="ai-network-list">' + bots.map(bot =>
      '<article class="ai-network-list-row"><div class="ai-network-list-main"><div class="ai-network-avatar" aria-hidden="true">AI</div><div><strong>' +
      esc(bot.name) + '</strong><div class="ai-network-meta">' + pill('AI BOT', 'ai') + ' ' + pill(bot.status, bot.status === 'active' ? 'success' : 'neutral') +
      '</div><p>' + esc(bot.purpose) + '</p><small>' + esc(bot.tone) + ' · ' + esc(list(bot.languages).join(', ')) + ' · ' + esc(list(bot.traits).join(', ')) + '</small></div></div>' +
      '<div class="ai-network-row-actions">' +
      (bot.status === 'active'
        ? '<button type="button" class="secondary" data-ai-action="bot-status" data-id="' + esc(bot.id) + '" data-status="paused">Pause</button>'
        : bot.status !== 'archived'
          ? '<button type="button" class="secondary" data-ai-action="bot-status" data-id="' + esc(bot.id) + '" data-status="active" disabled title="Provider execution is not enabled">Activate</button>'
          : '') +
      (bot.status !== 'archived' ? '<button type="button" class="secondary" data-ai-action="bot-status" data-id="' + esc(bot.id) + '" data-status="archived">Archive</button>' : '') +
      '</div></article>'
    ).join('') + '</div>';
  }

  function renderAIIdentityRows(registry) {
    const identities = list(registry?.identities);
    if (!identities.length) return empty('No AI identities are registered in the relational database yet.');
    return '<div class="ai-network-list">' + identities.map(record => {
      const identity = record.identity || {};
      const name = record.name || {};
      const profile = record.profile || {};
      const email = record.primary_email;
      const display = name.display_name || name.full_name || [name.first_name, name.last_name].filter(Boolean).join(' ');
      const emailStatus = email
        ? 'Email record: ' + esc(email.provisioning_status || 'not_requested') + ' · ' + esc(email.verification_status || 'unverified')
        : 'No email identity record';
      return '<article class="ai-network-list-row"><div class="ai-network-list-main">' +
        '<div class="ai-network-avatar" aria-hidden="true">AI</div><div><strong>' + esc(display || 'AI identity') + '</strong>' +
        '<div class="ai-network-meta">' + pill('AI IDENTITY', 'ai') + ' ' + pill(identity.status || 'created') + ' ' + pill(identity.population || 'independent') + '</div>' +
        '<small>@' + esc(name.username || 'username unavailable') + ' · ' + esc(identity.category_key || 'uncategorized') + ' · ' + esc(profile.gender || 'not specified') + '</small>' +
        '<p>' + emailStatus + '</p><small>' + esc(identity.identity_id || '') + '</small></div></div></article>';
    }).join('') + '</div>';
  }

  function renderAIIdentityRegistry() {
    const registry = state.identityRegistry;
    const categories = list(state.identityCategories);
    const categoryOptions = categories.map(category => ({ value:category.category_key, label:category.display_name }));
    const warning = state.identityError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.identityError) + '</div>'
      : '<p class="ai-network-note">Each record is a distinct AI identity. No human login account or email inbox is created.</p>';
    const form = '<form class="ai-network-form" data-ai-form="identity">' +
      '<div class="ai-network-form-title">Register an AI identity</div>' +
      '<div class="ai-network-form-grid"><label>First name<input name="firstName" required maxlength="80" autocomplete="off"></label>' +
      '<label>Last name<input name="lastName" required maxlength="80" autocomplete="off"></label>' +
      '<label>Middle name (optional)<input name="middleName" maxlength="80" autocomplete="off"></label>' +
      '<label>Display name<input name="displayName" maxlength="120" placeholder="Defaults to full name"></label>' +
      '<label>Username<input name="username" required minlength="3" maxlength="30" pattern="[a-z0-9_]+" autocomplete="off" placeholder="lowercase_username"></label>' +
      '<label>AI category<select name="categoryKey" required ' + (!categories.length ? 'disabled' : '') + '>' +
      (categoryOptions.length ? options(categoryOptions, categoryOptions[0].value) : '<option value="">Categories unavailable</option>') + '</select></label>' +
      '<label>AI population<select name="population">' + options([
        {value:'independent',label:'Independent AI'},
        {value:'organizational',label:'Organizational AI'},
        {value:'specialized_service',label:'Specialized AI service'}
      ], 'independent') + '</select></label>' +
      '<label>Gender<select name="gender">' + options([
        {value:'female',label:'Female AI'},{value:'male',label:'Male AI'},
        {value:'non_binary',label:'Non-binary AI'},{value:'other',label:'Other'},
        {value:'prefer_not_to_say',label:'Prefer not to specify'}
      ], 'prefer_not_to_say') + '</select></label></div>' +
      '<label>Purpose / purpose statement<textarea name="purpose" maxlength="1200" rows="2" placeholder="Describe this AI identity and its purpose."></textarea></label>' +
      '<label>Biography<textarea name="bio" maxlength="4000" rows="2" placeholder="Public AI biography"></textarea></label>' +
      '<label>Introduction<textarea name="introduction" maxlength="2000" rows="2" placeholder="Profile introduction"></textarea></label>' +
      '<div class="ai-network-form-grid"><label>Gender presentation<input name="genderPresentation" maxlength="80"></label>' +
      '<label>Nationality<input name="nationality" maxlength="120" placeholder="Nationality description"></label>' +
      '<label>Country of origin<input name="countryOfOrigin" list="ai-network-countries" autocomplete="off" placeholder="Search countries"></label>' +
      '<label>Current country<input name="currentCountry" list="ai-network-countries" autocomplete="off" placeholder="Search countries"></label>' +
      '<label>State / province<input name="stateProvince" maxlength="120"></label>' +
      '<label>Parish / county<input name="parishCounty" maxlength="120"></label>' +
      '<label>District<input name="district" maxlength="120"></label>' +
      '<label>City<input name="city" maxlength="120"></label>' +
      '<label>Town<input name="town" maxlength="120"></label>' +
      '<label>Time zone<input name="timeZone" maxlength="80" value="UTC" placeholder="America/Jamaica"></label>' +
      '<label>Profession / occupation<input name="profession" maxlength="180"></label>' +
      '<label>Interests (comma-separated)<input name="interests" maxlength="1000"></label>' +
      '<label>Hobbies (comma-separated)<input name="hobbies" maxlength="1000"></label>' +
      '<label>Skills (comma-separated)<input name="skills" maxlength="1000"></label>' +
      '<label>Languages (comma-separated tags)<input name="languages" maxlength="240" value="en" placeholder="en, ht, es"></label></div>' +
      countryDatalist +
      '<label>Email address (optional; record only)<input name="emailAddress" type="email" maxlength="320" placeholder="No inbox is created or claimed"></label>' +
      '<button class="primary" type="submit" ' + (!categories.length || !window.crypto?.randomUUID ? 'disabled' : '') + '>Create relational AI identity</button>' +
      '</form>';
    const bulkForm = '<form class="ai-network-form" data-ai-form="identity-bulk">' +
      '<div class="ai-network-form-title">Bulk import AI identities (1–100 per batch)</div>' +
      '<p class="ai-network-note">Paste a JSON array. Each item uses the same name, category, population and profile fields as the single-identity form. Every item gets its own record; failed rows are reported and can be retried with the same idempotency key.</p>' +
      '<label>Identity batch JSON<textarea name="items" required rows="8" maxlength="180000" spellcheck="false" placeholder=\'[{"population":"independent","category_key":"ai_friends","idempotency_key":"import-row-000001","name":{"first_name":"Ava","last_name":"Morgan","username":"ava_morgan_01"},"profile":{"gender":"female"}}]\'></textarea></label>' +
      '<button class="primary" type="submit" ' + (!categories.length ? 'disabled' : '') + '>Import identity batch</button>' +
      '</form>';
    return card('AI Identity & Profile Registry', 'RELATIONAL IDENTITY FOUNDATION',
      '<p>Registered identities are stored individually in Minglora Supabase. Human authentication accounts are kept separate.</p>' +
      warning + '<div class="ai-network-quick-stats"><div><span>Registered identities</span><strong>' +
      (registry ? number(registry.total) : 'Unavailable') + '</strong></div><div><span>Categories available</span><strong>' + number(categories.length) +
      '</strong></div></div>' + renderAIIdentityRows(registry) + form + bulkForm, 'ai-network-span-2');
  }

  async function loadAIIdentityRegistry() {
    state.identityError = '';
    try {
      const [registry, categoryResult] = await Promise.all([
        request('/identities?limit=10'),
        request('/categories')
      ]);
      state.identityRegistry = registry;
      state.identityCategories = list(categoryResult.categories);
    } catch (error) {
      state.identityRegistry = null;
      state.identityCategories = [];
      state.identityError = error.message || 'Relational AI identity service is unavailable.';
    }
  }

  function renderTeams(teams, bots) {
    const rows = teams.length
      ? '<div class="ai-network-list">' + teams.map(team => {
          const names = list(team.botIds).map(id => bots.find(bot => bot.id === id)?.name || 'Unavailable bot');
          return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div class="ai-network-avatar ai-network-avatar--team" aria-hidden="true">TEAM</div><div><strong>' +
            esc(team.name) + '</strong><p>' + esc(team.description || 'No team description.') + '</p><small>' + esc(names.join(' · ')) + '</small></div></div>' +
            pill(team.coordinationMode || 'human_reviewed') + '</article>';
        }).join('') + '</div>'
      : empty('No bot teams yet. Teams use your own bots and keep coordination human-reviewed.');
    const choices = bots.filter(bot => bot.status !== 'archived').map(bot =>
      '<label class="ai-network-check"><input type="checkbox" name="teamBotIds" value="' + esc(bot.id) + '"><span><strong>' + esc(bot.name) + '</strong><small>' + esc(bot.identityLabel || 'AI BOT') + '</small></span></label>'
    ).join('') || empty('Create a bot before forming a team.');
    return rows + '<form class="ai-network-form" data-ai-form="team"><div class="ai-network-form-title">Create a bot team</div>' +
      '<label>Team name<input name="name" required minlength="2" maxlength="60" placeholder="Community Support Team"></label>' +
      '<label>Description<textarea name="description" maxlength="240" rows="2" placeholder="What should this team coordinate?"></textarea></label>' +
      '<fieldset><legend>Select team members</legend><div class="ai-network-check-grid">' + choices + '</div></fieldset>' +
      '<button class="primary" type="submit"' + (!bots.some(bot => bot.status !== 'archived') ? ' disabled' : '') + '>Create team</button></form>';
  }

  function renderSchedules(schedules, bots) {
    const rows = schedules.length
      ? '<div class="ai-network-list">' + schedules.map(schedule => {
          const bot = bots.find(item => item.id === schedule.botId);
          return '<article class="ai-network-list-row"><div><strong>' + esc(schedule.taskType.replaceAll('_', ' ')) + '</strong><p>' +
            esc(bot?.name || 'Assigned bot') + ' · ' + esc(schedule.cadence) + ' · ' + esc(schedule.timezone) + '</p><small>Next planned time: ' + esc(date(schedule.runAt)) + '</small></div>' +
            pill(schedule.status, schedule.status === 'active' ? 'success' : 'neutral') + '</article>';
        }).join('') + '</div>'
      : empty('No schedules yet. New schedules start paused and require provider verification before activation.');
    const botOptions = bots.filter(bot => bot.status !== 'archived').map(bot => ({ value: bot.id, label: bot.name }));
    return rows + '<form class="ai-network-form" data-ai-form="schedule"><div class="ai-network-form-title">Schedule a safe task</div>' +
      '<label>AI bot<select name="botId" required>' + options(botOptions, '') + '</select></label>' +
      '<label>Task<select name="taskType" required>' + options([
        {value:'content_outline',label:'Content outline'},
        {value:'caption_draft',label:'Caption draft'},
        {value:'title_ideas',label:'Title ideas'},
        {value:'translation_draft',label:'Translation draft'},
        {value:'creator_calendar',label:'Creator calendar'},
        {value:'public_event_support',label:'Public event support'}
      ], 'content_outline') + '</select></label>' +
      '<div class="ai-network-form-grid"><label>Cadence<select name="cadence">' + options([{value:'once',label:'Once'},{value:'daily',label:'Daily'},{value:'weekly',label:'Weekly'}],'once') + '</select></label>' +
      '<label>Time zone<input name="timezone" required value="' + esc(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') + '"></label></div>' +
      '<label>Start date and time<input name="runAt" type="datetime-local" required></label>' +
      '<button class="primary" type="submit"' + (!bots.some(bot => bot.status !== 'archived') ? ' disabled' : '') + '>Save paused schedule</button></form>';
  }

  function renderApprovals(approvals) {
    if (!approvals.length) return empty('No high-impact actions are awaiting your approval.');
    return '<div class="ai-network-list">' + approvals.map(item =>
      '<article class="ai-network-list-row"><div><strong>' + esc(item.actionType.replaceAll('_', ' ')) + '</strong><p>' + esc(item.summary) +
      '</p><small>Requested ' + esc(date(item.requestedAt)) + ' · Expires ' + esc(date(item.expiresAt)) + '</small></div>' +
      '<div class="ai-network-row-actions"><button type="button" class="primary" data-ai-action="approval" data-id="' + esc(item.id) + '" data-decision="approve">Approve record</button>' +
      '<button type="button" class="secondary" data-ai-action="approval" data-id="' + esc(item.id) + '" data-decision="reject">Reject</button></div></article>'
    ).join('') + '</div><p class="ai-network-note">Approval records do not publish, send or execute actions. They record your decision; any future action must go through a separate verified human-controlled workflow.</p>';
  }

  function renderCreatorJobs(jobs) {
    if (!jobs.length) return empty('No Creator Studio drafts yet.');
    return '<div class="ai-network-list">' + jobs.map(job =>
      '<article class="ai-network-list-row"><div><strong>' + esc(job.taskType.replaceAll('_', ' ')) + '</strong><p>' + esc(job.brief) +
      '</p><small>Created ' + esc(date(job.createdAt)) + ' · ' + esc(job.providerExecution || 'not started') + '</small></div>' +
      pill(job.status) + '</article>'
    ).join('') + '</div>';
  }

  function renderEvents(events) {
    if (!events.length) return empty('No AI-hosted community event drafts yet.');
    return '<div class="ai-network-list">' + events.map(event =>
      '<article class="ai-network-list-row"><div><strong>' + esc(event.title) + '</strong><p>' + esc(event.description) +
      '</p><small>' + esc(date(event.startsAt)) + ' · ' + esc(event.visibility) + ' · AI host, opt-in invitations only</small></div>' +
      pill(event.status) + '</article>'
    ).join('') + '</div>';
  }

  function renderPerformance(performance) {
    const metrics = [
      ['Bots', number(performance.botCount)], ['Active bots', number(performance.activeBots)],
      ['Teams', number(performance.teamCount)], ['Schedules', number(performance.scheduleCount)],
      ['Pending approvals', number(performance.pendingApprovals)], ['Creator drafts', number(performance.creatorDrafts)],
      ['Completed runs', number(performance.completedRuns)], ['Failed runs', number(performance.failedRuns)],
      ['Tokens recorded', number(performance.totalTokensUsed)]
    ];
    return '<div class="ai-network-metric-grid">' + metrics.map(([label, value]) =>
      '<div class="ai-network-metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'
    ).join('') + '</div><p class="ai-network-note">Based on ' + number(performance.measuredRunCount) +
      ' recorded runs only. Drafts and unexecuted requests are not counted as activity.</p>';
  }

  function renderLanguages(settings) {
    return '<form class="ai-network-form" data-ai-form="languages"><div class="ai-network-form-title">Language preferences</div>' +
      '<label>Enabled languages (comma-separated BCP 47 tags)<input name="enabledLanguages" value="' + esc(list(settings.enabledLanguages).join(', ')) + '" placeholder="en, es, fr, ht" required></label>' +
      '<label>Primary language<input name="primaryLanguage" value="' + esc(settings.primaryLanguage || 'en') + '" maxlength="35" required></label>' +
      '<label class="ai-network-switch"><input type="checkbox" name="autoTranslate" ' + (settings.autoTranslate ? 'checked' : '') + '><span>Allow opt-in translation drafts</span></label>' +
      '<button class="primary" type="submit">Save language settings</button></form>' +
      '<p class="ai-network-note">Original content is preserved. Translation remains a draft and must be labelled and reviewed. Automatic translation is off unless you enable it.</p>';
  }

  function renderSettings(settings, provider) {
    return '<form class="ai-network-form" data-ai-form="settings"><div class="ai-network-form-title">Usage and safety limits</div>' +
      '<div class="ai-network-form-grid"><label>Daily token budget<input name="dailyTokenBudget" type="number" min="500" max="500000" step="100" value="' + esc(settings.dailyTokenBudget) + '" required></label>' +
      '<label>Monthly spend limit (USD)<input name="monthlySpendLimitUsd" type="number" min="0.5" max="500" step="0.5" value="' + esc(settings.monthlySpendLimitUsd) + '" required></label></div>' +
      '<label class="ai-network-switch"><input type="checkbox" name="companionOptIn" ' + (settings.companionOptIn ? 'checked' : '') + '><span>Opt in to an AI companion (off by default)</span></label>' +
      '<label class="ai-network-switch"><input type="checkbox" name="companionAcknowledgedAIIdentity"' + (settings.companionOptIn ? ' checked' : '') + '><span>I understand this companion is AI, not a human</span></label>' +
      '<button class="primary" type="submit">Save safety settings</button></form>' +
      '<div class="ai-network-provider"><div><strong>Provider readiness</strong><p>' + esc(provider.note) + '</p></div>' +
      pill(provider.configured ? 'Configured · execution disabled' : 'Not configured', provider.configured ? 'warning' : 'neutral') + '</div>' +
      '<div class="ai-network-safety-actions"><button type="button" class="danger" data-ai-action="emergency-pause">Emergency pause all AI work</button>' +
      '<button type="button" class="secondary" data-ai-action="emergency-resume" disabled title="Provider execution is not verified">Resume network</button></div>' +
      '<p class="ai-network-note">Human approval and AI identity disclosure are mandatory and cannot be disabled. Emergency pause preserves history.</p>';
  }

  function renderSnapshot(snapshot) {
    const settings = snapshot.settings, performance = snapshot.performance, provider = snapshot.providerStatus;
    const bots = list(snapshot.bots), teams = list(snapshot.teams), schedules = list(snapshot.schedules);
    const approvals = list(snapshot.approvals), creatorJobs = list(snapshot.creatorJobs);
    const events = list(snapshot.communityEvents);
    const safeguards = snapshot.safeguards || {};
    return '<section class="ai-network-page">' +
      '<header class="ai-network-hero"><div><span class="ai-network-eyebrow">MINGLORA INTELLIGENCE</span><h1>AI Bot Network</h1>' +
      '<p>Build distinct AI assistants, coordinate approved work and manage every bot from one secure workspace.</p></div>' +
      '<div class="ai-network-hero-status">' + pill('AI identity required', 'ai') + pill(safeguards.globalPaused ? 'Network paused' : 'Network enabled', safeguards.globalPaused ? 'warning' : 'success') + '</div></header>' +
      (state.notice ? '<div class="ai-network-alert ai-network-alert--' + esc(state.noticeType || 'success') + '" role="status">' + esc(state.notice) + '</div>' : '') +
      (state.error ? '<div class="ai-network-alert ai-network-alert--error" role="alert">' + esc(state.error) + '</div>' : '') +
      '<div class="ai-network-quick-stats"><div><span>My bots</span><strong>' + number(performance.botCount) + '</strong></div><div><span>Teams</span><strong>' + number(performance.teamCount) + '</strong></div><div><span>Pending reviews</span><strong>' + number(performance.pendingApprovals) + '</strong></div><div><span>Recorded runs</span><strong>' + number(performance.measuredRunCount) + '</strong></div></div>' +
      '<div class="ai-network-grid">' +
      renderAIIdentityRegistry() +
      card('Bot Personality Laboratory', '01 · PERSONALITY', '<p>Build unique AI helpers with a clear purpose, tone, traits, expertise and permitted tasks.</p>' +
        renderBotRows(bots) + '<form class="ai-network-form" data-ai-form="bot"><div class="ai-network-form-title">Create a new AI bot</div>' +
        '<label>Bot name<input name="name" required minlength="2" maxlength="40" placeholder="Community Guide"></label>' +
        '<label>Purpose<textarea name="purpose" required minlength="20" maxlength="280" rows="3" placeholder="Describe the exact kind of help this AI bot should provide."></textarea></label>' +
        '<div class="ai-network-form-grid"><label>Personality tone<select name="tone">' + options([
          {value:'friendly',label:'Friendly'},{value:'professional',label:'Professional'},{value:'educational',label:'Educational'},
          {value:'creative',label:'Creative'},{value:'calm',label:'Calm'},{value:'energetic',label:'Energetic'},
          {value:'concise',label:'Concise'},{value:'supportive',label:'Supportive'}
        ], 'friendly') + '</select></label><label>Expertise<input name="expertise" maxlength="180" placeholder="Creator education"></label></div>' +
        '<fieldset><legend>Choose two to five personality traits</legend><div class="ai-network-check-grid">' +
        ['helpful','curious','calm','energetic','analytical','empathetic','creative','precise','playful','patient','direct'].map((trait,index) =>
          '<label class="ai-network-check"><input type="checkbox" name="traits" value="' + trait + '"' + (index < 2 ? ' checked' : '') + '><span>' + trait + '</span></label>'
        ).join('') + '</div></fieldset>' +
        '<label>Languages<input name="languages" value="en, ht" placeholder="en, es, fr, ht"></label>' +
        '<label>Primary language<input name="primaryLanguage" value="en" maxlength="35"></label>' +
        '<fieldset><legend>Allowed capabilities</legend><div class="ai-network-check-grid">' +
        [{id:'draft_content',label:'Draft content'},{id:'summarize_public_content',label:'Summarize public content'},
          {id:'translate_user_provided_content',label:'Translate my content'},{id:'suggest_replies',label:'Suggest replies'},
          {id:'organize_creator_tasks',label:'Organize creator tasks'},{id:'prepare_event_material',label:'Prepare event material'}].map((item,index) =>
          '<label class="ai-network-check"><input type="checkbox" name="capabilities" value="' + item.id + '"' + (index === 0 ? ' checked' : '') + '><span>' + item.label + '</span></label>'
        ).join('') + '</div></fieldset><button class="primary" type="submit">Create AI bot draft</button></form>', 'ai-network-span-2') +
      card('Bot Teams', '02 · TEAM WORK', '<p>Coordinate your own specialist bots with human-reviewed plans and separate identities.</p>' + renderTeams(teams,bots)) +
      card('Smart Activity Scheduling', '03 · SCHEDULING', '<p>Plan content support by time zone and cadence. Every new schedule is paused until execution is verified.</p>' + renderSchedules(schedules,bots)) +
      card('Bot Performance Center', '04 · PERFORMANCE', renderPerformance(performance)) +
      card('Multilingual Intelligence', '05 · LANGUAGES', '<p>Set preferred languages and opt-in translation. Original text stays available.</p>' + renderLanguages(settings)) +
      card('AI Creator Studio', '06 · CREATOR', '<p>Create structured draft requests. No content is generated or published while the provider is disabled.</p>' +
        renderCreatorJobs(creatorJobs) + '<form class="ai-network-form" data-ai-form="creator"><div class="ai-network-form-title">Start a Creator Studio draft</div>' +
        '<label>Draft type<select name="taskType">' + options([{value:'content_outline',label:'Content outline'},{value:'caption_draft',label:'Caption options'},
          {value:'title_ideas',label:'Title ideas'},{value:'translation_draft',label:'Translation draft'},{value:'creator_calendar',label:'Creator calendar'}],'content_outline') + '</select></label>' +
        '<label>Instructions<textarea name="brief" required minlength="10" maxlength="8000" rows="4" placeholder="Describe the content, audience and result you need."></textarea></label>' +
        '<label>Assign bot (optional)<select name="botId"><option value="">No bot assigned</option>' + options(bots.filter(bot=>bot.status!=='archived').map(bot=>({value:bot.id,label:bot.name})), '') + '</select></label>' +
        '<button class="primary" type="submit">Save draft request</button></form>') +
      card('Security & Trust Center', '07 · SAFETY', '<div class="ai-network-safety-grid">' +
        '<div>' + pill('Mandatory', 'success') + '<strong>Human approval</strong><p>High-impact requests need a human decision. Approval never executes the action.</p></div>' +
        '<div>' + pill('Mandatory', 'success') + '<strong>AI identity labels</strong><p>Bots are always identified as AI, never as human accounts.</p></div>' +
        '<div>' + pill('Blocked', 'warning') + '<strong>Restricted actions</strong><p>Coins, payments, payouts, refunds, admin rights, suspensions, security changes and destructive moderation are not delegated.</p></div>' +
        '<div>' + pill('Recorded only', 'neutral') + '<strong>Usage and audit</strong><p>Budgets, activity and performance use recorded events only.</p></div></div>' +
        '<p class="ai-network-note">Security controls are enforced on the server; they cannot be switched off from this screen.</p>') +
      card('AI Friendship & Companionship', '08 · OPTIONAL COMPANION', '<p>Companionship is off by default. A companion must be clearly identified as AI and can be withdrawn at any time.</p>' +
        '<div class="ai-network-consent-state">' + pill(settings.companionOptIn ? 'Opted in' : 'Opted out', settings.companionOptIn ? 'success' : 'neutral') +
        '<span>Retention preference: 30 days. Conversation runtime is not enabled yet.</span></div>' +
        '<p class="ai-network-note">Use the safety settings below to change consent. No companion will start contacting you automatically.</p>') +
      card('AI Community Events', '09 · COMMUNITY', '<p>Prepare transparent AI-hosted sessions. Event drafts do not send invitations; participation remains opt-in.</p>' +
        renderEvents(events) + '<form class="ai-network-form" data-ai-form="event"><div class="ai-network-form-title">Draft an AI community event</div>' +
        '<label>Event title<input name="title" required minlength="3" maxlength="100" placeholder="Creator Learning Circle"></label>' +
        '<label>Description<textarea name="description" required minlength="20" maxlength="1200" rows="3" placeholder="What will people learn or discuss?"></textarea></label>' +
        '<div class="ai-network-form-grid"><label>AI host<select name="botId" required>' + options(bots.filter(bot=>bot.status!=='archived').map(bot=>({value:bot.id,label:bot.name})), '') + '</select></label>' +
        '<label>Audience<select name="visibility">' + options([{value:'public',label:'Public'},{value:'followers',label:'Followers'},{value:'friends',label:'Friends'},{value:'private',label:'Private'}],'public') + '</select></label></div>' +
        '<label>Starts at<input name="startsAt" type="datetime-local" required></label><button class="primary" type="submit"' +
        (!bots.some(bot=>bot.status!=='archived')?' disabled':'') + '>Save event draft</button></form>') +
      card('Central Bot Command Center', '10 · COMMAND CENTER', '<p>All of your AI tools, approval decisions, provider status and global safety controls.</p>' +
        '<div class="ai-network-command-grid"><div><span>Provider</span><strong>' + esc(provider.provider || 'Not configured') + '</strong></div><div><span>Model</span><strong>' + esc(provider.model || '—') + '</strong></div>' +
        '<div><span>Global state</span><strong>' + esc(settings.globalPaused ? 'Paused' : 'Enabled') + '</strong></div><div><span>Execution</span><strong>Disabled until provider adapter is verified</strong></div></div>' +
        renderApprovals(approvals) + renderSettings(settings,provider), 'ai-network-span-2') +
      '</div><footer class="ai-network-footer">Minglora AI Network · Owner-controlled · AI identities disclosed · Human approval required</footer></section>';
  }

  async function load() {
    state.error = '';
    const host = root();
    if (!host) return;
    host.innerHTML = '<section class="ai-network-loading" role="status"><span class="ai-network-spinner" aria-hidden="true"></span><strong>Opening your AI Network workspace…</strong></section>';
    try {
      state.snapshot = await request();
      await loadAIIdentityRegistry();
      renderSnapshot(state.snapshot);
    } catch (error) {
      state.error = error.message;
      host.innerHTML = '<section class="ai-network-page"><div class="ai-network-alert ai-network-alert--error" role="alert">' + esc(error.message) + '</div>' +
        '<button type="button" class="primary" data-ai-action="reload">Try again</button></section>';
    }
  }

  async function refresh(message) {
    if (message) setNotice(message);
    state.snapshot = await request();
    await loadAIIdentityRegistry();
    renderSnapshot(state.snapshot);
  }

  async function submit(form) {
    const kind = form.dataset.aiForm;
    const data = new FormData(form);
    const value = key => String(data.get(key) ?? '').trim();
    const payload = {};
    let path = '';
    if (kind === 'identity-bulk') {
      path = '/identities/bulk';
      let items;
      try { items = JSON.parse(value('items')); }
      catch { throw new Error('Bulk identity input must be valid JSON.'); }
      if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
        throw new Error('A bulk identity batch must contain between 1 and 100 JSON objects.');
      }
      if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error('Every bulk identity row must be a JSON object.');
      }
      payload.items = items;
    } else if (kind === 'identity') {
      path = '/identities';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.population = value('population');
      payload.category_key = value('categoryKey');
      payload.idempotency_key = form.dataset.idempotencyKey;
      payload.purpose = value('purpose');
      payload.name = {
        first_name: value('firstName'),
        middle_name: value('middleName'),
        last_name: value('lastName'),
        display_name: value('displayName'),
        username: value('username').toLowerCase()
      };
      const rawCountryOfOrigin = value('countryOfOrigin');
      const rawCurrentCountry = value('currentCountry');
      const countryOfOrigin = countryCode(rawCountryOfOrigin);
      const currentCountry = countryCode(rawCurrentCountry);
      if (rawCountryOfOrigin && !countryOfOrigin) {
        throw new Error('Select a valid country of origin from the country suggestions or enter its ISO two-letter code.');
      }
      if (rawCurrentCountry && !currentCountry) {
        throw new Error('Select a valid current country from the country suggestions or enter its ISO two-letter code.');
      }
      payload.profile = {
        gender: value('gender'),
        gender_presentation: value('genderPresentation'),
        bio: value('bio'),
        introduction: value('introduction'),
        nationality: value('nationality'),
        country_of_origin: countryOfOrigin || null,
        current_country: currentCountry || null,
        state_province: value('stateProvince'),
        parish_county: value('parishCounty'),
        district: value('district'),
        city: value('city'),
        town: value('town'),
        time_zone: value('timeZone') || 'UTC',
        profession: value('profession'),
        interests: value('interests').split(',').map(item => item.trim()).filter(Boolean),
        hobbies: value('hobbies').split(',').map(item => item.trim()).filter(Boolean),
        skills: value('skills').split(',').map(item => item.trim()).filter(Boolean)
      };
      payload.languages = value('languages').split(',').map(tag => tag.trim()).filter(Boolean)
        .map((tag, index) => ({
          language_tag: tag,
          language_name: tag,
          proficiency: 'conversational',
          is_primary: index === 0
        }));
      payload.locations = [];
      if (countryOfOrigin) payload.locations.push({
        location_type: 'origin',
        country_code: countryOfOrigin,
        country_name: countryLabel(countryOfOrigin)
      });
      if (currentCountry) payload.locations.push({
        location_type: 'current',
        country_code: currentCountry,
        country_name: countryLabel(currentCountry),
        state_province: value('stateProvince'),
        parish_county: value('parishCounty'),
        district: value('district'),
        city: value('city'),
        town: value('town'),
        time_zone: value('timeZone') || 'UTC',
        is_public: false
      });
      if (value('emailAddress')) payload.email = { email_address: value('emailAddress') };
    } else if (kind === 'bot') {
      path = '/bots';
      payload.name = value('name');
      payload.purpose = value('purpose');
      payload.tone = value('tone');
      payload.expertise = value('expertise');
      payload.traits = selectedValues(form, 'traits');
      payload.languages = value('languages').split(',').map(item => item.trim()).filter(Boolean);
      payload.primaryLanguage = value('primaryLanguage');
      payload.capabilities = selectedValues(form, 'capabilities');
    } else if (kind === 'team') {
      path = '/teams';
      payload.name = value('name');
      payload.description = value('description');
      payload.botIds = selectedValues(form, 'teamBotIds');
    } else if (kind === 'schedule') {
      path = '/schedules';
      payload.botId = value('botId');
      payload.taskType = value('taskType');
      payload.cadence = value('cadence');
      payload.timezone = value('timezone');
      const runAt = value('runAt');
      payload.runAt = runAt ? new Date(runAt).toISOString() : '';
      if (payload.cadence === 'weekly') payload.weekdays = [1,2,3,4,5];
    } else if (kind === 'creator') {
      path = '/creator-jobs';
      payload.taskType = value('taskType');
      payload.brief = value('brief');
      payload.botId = value('botId') || null;
    } else if (kind === 'event') {
      path = '/community-events';
      payload.title = value('title');
      payload.description = value('description');
      payload.botId = value('botId');
      payload.visibility = value('visibility');
      const startsAt = value('startsAt');
      payload.startsAt = startsAt ? new Date(startsAt).toISOString() : '';
    } else if (kind === 'languages') {
      path = '/settings';
      payload.enabledLanguages = value('enabledLanguages').split(',').map(item => item.trim()).filter(Boolean);
      payload.primaryLanguage = value('primaryLanguage');
      payload.autoTranslate = form.querySelector('[name="autoTranslate"]').checked;
    } else if (kind === 'settings') {
      path = '/settings';
      payload.dailyTokenBudget = Number(value('dailyTokenBudget'));
      payload.monthlySpendLimitUsd = Number(value('monthlySpendLimitUsd'));
      payload.companionOptIn = form.querySelector('[name="companionOptIn"]').checked;
      payload.companionAcknowledged = form.querySelector('[name="companionAcknowledgedAIIdentity"]').checked;
    } else return;
    const result = await request(path, { method: kind === 'settings' || kind === 'languages' ? 'PATCH' : 'POST', body: payload });
    form.reset();
    if (kind === 'identity') form.dataset.idempotencyKey = window.crypto.randomUUID();
    const message = kind === 'identity'
      ? 'AI identity record saved in Minglora Supabase.'
      : kind === 'identity-bulk'
        ? 'Bulk identity batch: ' + number(result.created_count) + ' created; ' + number(result.reused_count) + ' reused; ' + number(result.failed_count) + ' failed.'
        : 'Saved successfully.';
    await refresh(message);
  }

  const onSubmit = async event => {
    const form = event.target instanceof Element ? event.target.closest('form[data-ai-form]') : null;
    if (!form) return;
    event.preventDefault();
    if (state.busy) return;
    state.busy = true;
    try {
      await submit(form);
    } catch (error) {
      state.error = error.message;
      renderSnapshot(state.snapshot);
    } finally {
      state.busy = false;
    }
  };

  const onClick = async event => {
    const button = event.target instanceof Element ? event.target.closest('[data-ai-action]') : null;
    if (!button || button.disabled || state.busy) return;
    const action = button.dataset.aiAction, id = button.dataset.id;
    state.busy = true;
    try {
      if (action === 'reload') return await load();
      if (action === 'bot-status') await request('/bots/' + encodeURIComponent(id) + '/status', { method:'PATCH', body:{ status:button.dataset.status } });
      else if (action === 'approval') await request('/approvals/' + encodeURIComponent(id), { method:'PATCH', body:{ decision:button.dataset.decision } });
      else if (action === 'emergency-pause') await request('/emergency-pause', { method:'POST', body:{ reason:'Owner initiated emergency pause from the AI Network command center.' } });
      else if (action === 'emergency-resume') await request('/emergency-resume', { method:'POST', body:{} });
      await refresh(action === 'emergency-pause' ? 'Emergency pause confirmed. AI work remains stopped.' : 'AI Network updated.');
    } catch (error) {
      state.error = error.message;
      renderSnapshot(state.snapshot);
    } finally {
      state.busy = false;
    }
  };

  if (!window.__mingloraAINetworkBound) {
    window.__mingloraAINetworkBound = true;
    document.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick);
  }
  window.MingloraAINetwork = { render: load, refresh: () => refresh(), request };
})();