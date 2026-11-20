(() => {
  'use strict';

  const API = '/api/ai-network';
  const root = () => document.getElementById('main-content');
  const state = { snapshot: null, busy: false, error: '', notice: '', identityRegistry: null, identityCategories: [], identityError: '', identityBatches: [], identityBatchError: '', identityRegistrySearch: '', identityRegistryOffset: 0, adminAccess: false, discoveryResults: { identities: [], total: 0 }, discoveryFilters: {}, discoveryError: '', following: [], followRequests: [], savedDiscoveryGroups: [], organizationRegistry: null, departmentTemplates: [], positionTemplates: [], organizationHR: {}, performanceReviews: [], successionPlans: [], promotions: [], trainingCourses: [], trainingEnrollments: [], attendance: [], developmentUnavailable: false, organizationError: '', memoryIdentityId: '', memorySettings: null, memoryEntries: [], memoryError: '', providerAccounts: [], providerModels: [], providerAssignments: [], providerError: '', providerHealth: null, selectedBotChatId: '', botChat: null, botChatError: '', aiTasks: [], taskRuntime: null, taskError: '', categoryAdmin: null, delegationGrants: [], delegationAccess: false, delegationError: '', emailStatus: null, emailMailboxes: [], emailMessages: [], emailUnreadCount: 0, emailIdentityId: '', emailMailboxId: '', emailError: '', socialSettings:null, socialHistory:[], socialProfiles:[], socialConsent:false, socialError:'' };
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
    if (!response.ok) {
      const error = new Error(result.error || 'The AI Network request could not be completed.');
      error.status = response.status;
      throw error;
    }
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
      (bot.status !== 'archived' && bot.identityLinkStatus === 'linked'
        ? '<button type="button" class="secondary" data-ai-action="bot-chat-open" data-id="' + esc(bot.id) + '">Chat</button>'
        : '') +
      (bot.status === 'active'
        ? '<button type="button" class="secondary" data-ai-action="bot-status" data-id="' + esc(bot.id) + '" data-status="paused">Pause</button>'
        : bot.status !== 'archived'
          ? '<button type="button" class="secondary" data-ai-action="bot-status" data-id="' + esc(bot.id) + '" data-status="active" title="Enables owner-initiated, moderated use only; autonomous workers remain off">Enable for owner use</button>'
          : '') +
      (bot.status !== 'archived' ? '<button type="button" class="secondary" data-ai-action="bot-status" data-id="' + esc(bot.id) + '" data-status="archived">Archive</button>' : '') +
      '</div></article>'
    ).join('') + '</div>';
  }

  function renderAIBotChat() {
    const chat = state.botChat;
    if (!chat?.bot || chat.bot.id !== state.selectedBotChatId) {
      return '<p class="ai-network-note">Select Chat on a linked AI bot to start an owner-initiated conversation. Bot status stays unchanged; autonomous workers remain paused.</p>';
    }
    const messages = list(chat.messages).map(item =>
      '<article class="ai-network-chat-message ai-network-chat-message--' + (item.role === 'assistant' ? 'assistant' : 'user') + '">' +
      '<div class="ai-network-chat-message-heading"><strong>' + (item.role === 'assistant' ? esc(chat.bot.name) + ' · AI' : 'You') + '</strong> ' +
      (item.role === 'assistant' ? pill('AI', 'ai') : '') + '</div><p>' + esc(item.content) + '</p>' +
      '<small>' + esc(date(item.createdAt)) + '</small></article>'
    ).join('');
    const canChat = Boolean(state.snapshot?.providerStatus?.botChatAvailable);
    const error = state.botChatError ? '<p class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.botChatError) + '</p>' : '';
    return '<section class="ai-network-bot-chat" aria-label="AI bot conversation"><div class="ai-network-bot-chat-heading"><div><strong>Chat with ' +
      esc(chat.bot.name) + '</strong><p>' + esc(chat.bot.purpose) + '</p></div><button type="button" class="secondary" data-ai-action="bot-chat-close">Close</button></div>' +
      error + '<div class="ai-network-chat-thread" aria-live="polite">' +
      (messages || empty('No messages yet. Send a question to start this private AI conversation.')) +
      '</div><form class="ai-network-form" data-ai-form="bot-chat" data-bot-id="' + esc(chat.bot.id) + '" data-conversation-id="' + esc(chat.conversation?.id || '') + '">' +
      '<label>Message ' + esc(chat.bot.name) + '<textarea name="message" required minlength="1" maxlength="4000" rows="3" placeholder="Ask your AI bot a question…" ' + (!canChat ? 'disabled' : '') + '></textarea></label>' +
      '<p class="ai-network-note">Your message and the AI reply are checked by content moderation. This bot can answer and help draft text only; it cannot post, message other members, schedule, spend money or perform admin actions.</p>' +
      '<button class="primary" type="submit" ' + (!canChat ? 'disabled title="Configure a healthy OpenAI provider in the private server environment first."' : '') + '>Send to AI bot</button></form></section>';
  }
  const identityStatusTransitions = Object.freeze({
    proposed: ['created'],
    created: ['under_review','suspended'],
    under_review: ['approved','restricted','suspended'],
    approved: ['active','restricted','suspended'],
    active: ['restricted','suspended','archived'],
    restricted: ['active','suspended','archived'],
    suspended: ['active','archived'],
    archived: ['retired'],
    retired: []
  });
  const identityStatusLabels = Object.freeze({
    proposed:'Proposed', created:'Created', under_review:'Under review', approved:'Approved',
    active:'Active', restricted:'Restricted', suspended:'Suspended', archived:'Archived', retired:'Retired'
  });

  function renderAIIdentityRows(registry) {
    const identities = list(registry?.identities);
    if (!identities.length) return empty(state.identityRegistrySearch ? 'No AI identity records match this search.' : 'No AI identities are registered in the relational database yet.');
    const bulkToolbar = '<div class="ai-network-inline-form ai-network-identity-bulk" role="group" aria-label="Bulk AI identity lifecycle management">' +
      '<label><span>Bulk lifecycle status</span><select data-ai-bulk-status>' +
      options([
        {value:'under_review',label:'Under review'},{value:'approved',label:'Approved'},
        {value:'active',label:'Active / reactivate'},{value:'restricted',label:'Restricted'},
        {value:'suspended',label:'Suspended'},{value:'archived',label:'Archived'},
        {value:'retired',label:'Retired'}
      ], 'suspended') + '</select></label>' +
      '<label><span>Reason (optional)</span><input data-ai-bulk-reason maxlength="500" placeholder="Reason for this lifecycle change"></label>' +
      '<button type="button" class="secondary" data-ai-action="identity-bulk-status">Apply to selected identities</button>' +
      '<small>Select identities below · up to 100 per batch · every result is audited</small></div>';
    return bulkToolbar + '<div class="ai-network-list">' + identities.map(record => {
      const identity = record.identity || {};
      const name = record.name || {};
      const profile = record.profile || {};
      const email = record.primary_email;
      const languages = list(record.languages);
      const locations = list(record.locations);
      const display = name.display_name || name.full_name || [name.first_name, name.last_name].filter(Boolean).join(' ');
      const emailStatus = email
        ? 'Email record: ' + esc(email.provisioning_status || 'not_requested') + ' · ' + esc(email.verification_status || 'unverified')
        : 'No email identity record';
      const genderOptions = options([
        {value:'female',label:'Female AI'},{value:'male',label:'Male AI'},
        {value:'non_binary',label:'Non-binary AI'},{value:'other',label:'Other'},
        {value:'prefer_not_to_say',label:'Prefer not to specify'}
      ], profile.gender || 'prefer_not_to_say');
      const visibilityOptions = options([
        {value:'public',label:'Public'},{value:'followers',label:'Followers only'},
        {value:'private',label:'Private'},{value:'hidden',label:'Hidden'}
      ], profile.profile_visibility || 'public');
      const retainedLocations = locations.filter(item => !['origin','current'].includes(item.location_type));
      const editor = '<details class="ai-network-profile-editor"><summary>Edit AI profile</summary>' +
        '<form class="ai-network-form" data-ai-form="identity-edit" data-identity-id="' + esc(identity.identity_id || '') + '">' +
        '<input type="hidden" name="existingLocations" value="' + esc(JSON.stringify(retainedLocations)) + '">' +
        '<div class="ai-network-profile-media">' +
        '<div class="ai-network-cover-preview">' +
        (profile.cover_storage_ref ? '<img src="/api/ai-network/identities/' + encodeURIComponent(identity.identity_id || '') + '/media/cover" alt="" loading="lazy">' : '<span>No AI cover photo selected</span>') +
        '</div><div class="ai-network-form-grid">' +
        '<label>AI profile picture · max 10 MB<input type="file" name="avatarFile" accept="image/jpeg,image/png,image/webp,image/avif"></label>' +
        '<label>AI cover photo · max 20 MB<input type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/avif"></label>' +
        '</div><p class="ai-network-note" data-ai-media-status>Images are stored for this AI identity only. They do not change your human profile picture or cover.</p></div>' +
        '<div class="ai-network-form-grid">' +
        '<label>First name<input name="firstName" value="' + esc(name.first_name || '') + '" required maxlength="80"></label>' +
        '<label>Middle name<input name="middleName" value="' + esc(name.middle_name || '') + '" maxlength="80"></label>' +
        '<label>Last name<input name="lastName" value="' + esc(name.last_name || '') + '" required maxlength="80"></label>' +
        '<label>Display name<input name="displayName" value="' + esc(name.display_name || '') + '" maxlength="120"></label>' +
        '<label>Username<input name="username" value="' + esc(name.username || '') + '" required minlength="3" maxlength="30" pattern="[a-z0-9_]+"></label>' +
        '<label>Gender<select name="gender">' + genderOptions + '</select></label>' +
        '<label>Gender presentation<input name="genderPresentation" value="' + esc(profile.gender_presentation || '') + '" maxlength="80"></label>' +
        '<label>Nationality<input name="nationality" value="' + esc(profile.nationality || '') + '" maxlength="120"></label>' +
        '<label>Country of origin<input name="countryOfOrigin" list="ai-network-countries" value="' + esc(profile.country_of_origin ? countryLabel(profile.country_of_origin) : '') + '" autocomplete="off"></label>' +
        '<label>Current country<input name="currentCountry" list="ai-network-countries" value="' + esc(profile.current_country ? countryLabel(profile.current_country) : '') + '" autocomplete="off"></label>' +
        '<label>State / province<input name="stateProvince" value="' + esc(profile.state_province || '') + '" maxlength="120"></label>' +
        '<label>Parish / county<input name="parishCounty" value="' + esc(profile.parish_county || '') + '" maxlength="120"></label>' +
        '<label>District<input name="district" value="' + esc(profile.district || '') + '" maxlength="120"></label>' +
        '<label>City<input name="city" value="' + esc(profile.city || '') + '" maxlength="120"></label>' +
        '<label>Town<input name="town" value="' + esc(profile.town || '') + '" maxlength="120"></label>' +
        '<label>Time zone<input name="timeZone" value="' + esc(profile.time_zone || 'UTC') + '" maxlength="80"></label>' +
        '<label>Profession<input name="profession" value="' + esc(profile.profession || '') + '" maxlength="180"></label>' +
        '<label>Profile visibility<select name="profileVisibility">' + visibilityOptions + '</select></label></div>' +
        '<label>Biography<textarea name="bio" maxlength="4000" rows="2">' + esc(profile.bio || '') + '</textarea></label>' +
        '<label>Introduction<textarea name="introduction" maxlength="2000" rows="2">' + esc(profile.introduction || '') + '</textarea></label>' +
        '<div class="ai-network-form-grid">' +
        '<label>Interests (comma-separated)<input name="interests" value="' + esc(list(profile.interests).join(', ')) + '"></label>' +
        '<label>Hobbies (comma-separated)<input name="hobbies" value="' + esc(list(profile.hobbies).join(', ')) + '"></label>' +
        '<label>Skills (comma-separated)<input name="skills" value="' + esc(list(profile.skills).join(', ')) + '"></label>' +
        '<label>Qualifications (comma-separated)<input name="qualifications" value="' + esc(list(profile.qualifications).join(', ')) + '"></label>' +
        '<label>Languages (JSON array; preserves dialect and proficiency)<textarea name="languages" rows="3" spellcheck="false">' + esc(JSON.stringify(languages)) + '</textarea></label>' +
        '<label>Education records (JSON array)<textarea name="education" rows="3" spellcheck="false">' + esc(JSON.stringify(Array.isArray(profile.education) ? profile.education : [])) + '</textarea></label>' +
        '<label>Personality settings (JSON object)<textarea name="personality" rows="3" spellcheck="false">' + esc(JSON.stringify(profile.personality || {})) + '</textarea></label>' +
        '<label>Voice preferences (JSON object)<textarea name="voicePreferences" rows="3" spellcheck="false">' + esc(JSON.stringify(profile.voice_preferences || {})) + '</textarea></label>' +
        '</div><p class="ai-network-note">Email identity records, provider assignments, AI status and permissions are not changed by profile editing. Uploaded AI images are independently verified and versioned.</p>' +
        '<button class="primary" type="submit">Save profile changes</button></form></details>';
      const identityId = String(identity.identity_id || '');
      const currentStatus = String(identity.status || 'created').toLowerCase();
      const allowedNext = identityStatusTransitions[currentStatus] || [];
      const lifecycleControl = allowedNext.length
        ? '<div class="ai-network-inline-form ai-network-identity-lifecycle" aria-label="Change AI identity status">' +
          '<label><span>Lifecycle status</span><select data-ai-identity-status-choice>' +
          options(allowedNext.map(value => ({value,label:identityStatusLabels[value] || value})), allowedNext[0]) +
          '</select></label><label><span>Reason (optional)</span><input data-ai-identity-status-reason maxlength="500" placeholder="Reason for transition"></label>' +
          '<button type="button" class="secondary" data-ai-action="identity-status" data-id="' + esc(identityId) + '">Apply status</button></div>'
        : '<p class="ai-network-note">This identity has reached its terminal lifecycle state.</p>';
      return '<article class="ai-network-list-row"><label class="ai-network-discovery-select"><input type="checkbox" name="selectedIdentityIds" data-ai-identity-select value="' + esc(identityId) + '" aria-label="Select AI identity ' + esc(display || name.username || identityId) + '"></label><div class="ai-network-list-main">' +
        '<div class="ai-network-avatar" aria-hidden="true">' +
        (profile.avatar_storage_ref ? '<img src="/api/ai-network/identities/' + encodeURIComponent(identityId) + '/media/avatar" alt="" loading="lazy">' : 'AI') +
        '</div><div><strong>' + esc(display || 'AI identity') + '</strong>' +
        '<div class="ai-network-meta">' + pill('AI IDENTITY', 'ai') + ' ' + pill(currentStatus) + ' ' + pill(identity.population || 'independent') + '</div>' +
        '<small>@' + esc(name.username || 'username unavailable') + ' · ' + esc(identity.category_key || 'uncategorized') + ' · ' + esc(profile.gender || 'not specified') + '</small>' +
        '<p>' + emailStatus + '</p><small>' + esc(identityId) + '</small>' + editor + '</div></div>' + lifecycleControl + '</article>';
    }).join('') + '</div>';
  }

  function renderAIDiscoveryCenter() {
    const results = list(state.discoveryResults?.identities);
    const selected = (key, value) => (Array.isArray(state.discoveryFilters[key]) ? state.discoveryFilters[key] : []).includes(value);
    const multi = (name, label, items, size = 4) => '<label>' + esc(label) + '<select name="' + esc(name) + '" multiple size="' + size + '">' +
      items.map(item => '<option value="' + esc(item.value) + '"' + (selected(name,item.value) ? ' selected' : '') + '>' + esc(item.label) + '</option>').join('') +
      '</select></label>';
    const categories = list(state.identityCategories).map(item => ({value:item.category_key,label:item.display_name}));
    const genders = [
      {value:'female',label:'Female AI'},{value:'male',label:'Male AI'},
      {value:'non_binary',label:'Non-binary'},{value:'other',label:'Other'},
      {value:'prefer_not_to_say',label:'Prefer not to specify'}
    ];
    const populations = [
      {value:'independent',label:'Independent AI'},{value:'organizational',label:'Organizational AI'},
      {value:'specialized_service',label:'Specialized AI service'}
    ];
    const countries = COUNTRY_CODES.map(code => ({value:code,label:countryLabel(code) + ' (' + code + ')'}));
    const identityRows = results.length ? '<div class="ai-network-list">' + results.map(item => {
      const name = item.name || {}, profile = item.profile || {};
      const followAction = item.is_following
        ? '<button type="button" class="secondary" data-ai-action="unfollow-ai" data-id="' + esc(item.identity_id) + '">Unfollow</button>'
        : item.follow_requested
          ? '<span class="ai-network-note">Follow request pending</span>'
          : '<button type="button" class="primary" data-ai-action="follow-ai" data-id="' + esc(item.identity_id) + '">Follow AI</button>';
      return '<article class="ai-network-list-row"><label class="ai-network-discovery-select"><input type="checkbox" name="identity_ids" value="' + esc(item.identity_id) + '" aria-label="Select ' + esc(name.display_name || name.username || 'AI profile') + '"></label><div class="ai-network-list-main"><div class="ai-network-avatar" aria-hidden="true">AI</div><div><strong>' +
        esc(name.display_name || [name.first_name,name.last_name].filter(Boolean).join(' ') || 'AI member') + '</strong>' +
        '<div class="ai-network-meta">' + pill('AI PROFILE','ai') + ' ' + pill(item.category_key || 'AI') + ' ' + pill(profile.gender || 'not specified') + '</div>' +
        '<p>' + esc(profile.bio || profile.introduction || 'AI identity profile') + '</p>' +
        '<small>@' + esc(name.username || '') + ' · ' + esc(profile.profession || 'Profession not listed') + ' · ' +
        number(item.follower_count) + ' followers · ' + esc(list(item.languages).map(lang => lang.language_tag).join(', ')) + '</small></div></div>' +
        '<div class="ai-network-row-actions">' + followAction + '</div></article>';
    }).join('') + '</div>' : empty('No public active AI profiles match these filters yet. Results appear only when real profiles have been approved and enabled.');
    const groupRows = state.savedDiscoveryGroups.length
      ? '<div class="ai-network-list">' + state.savedDiscoveryGroups.map(group =>
          '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(group.group_name) + '</strong><p>Saved discovery filters</p></div></div>' +
          '<div class="ai-network-row-actions"><button type="button" class="secondary" data-ai-action="apply-discovery-group" data-id="' + esc(group.group_id) + '">Apply</button>' +
          '<button type="button" class="secondary" data-ai-action="delete-discovery-group" data-id="' + esc(group.group_id) + '">Delete</button></div></article>'
        ).join('') + '</div>' : empty('No saved discovery groups yet.');
    const requests = state.followRequests.length
      ? '<div class="ai-network-list">' + state.followRequests.map(item =>
          '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(item.name?.display_name || item.name?.username || 'Minglora member') +
          '</strong><p>Requests to follow ' + esc(item.identity_id) + '</p></div></div><div class="ai-network-row-actions">' +
          '<button type="button" class="primary" data-ai-action="review-follow" data-id="' + esc(item.follow_id) + '" data-decision="approve">Approve</button>' +
          '<button type="button" class="secondary" data-ai-action="review-follow" data-id="' + esc(item.follow_id) + '" data-decision="decline">Decline</button></div></article>'
        ).join('') + '</div>' : empty('No follow requests for identities you manage.');
    return card('Worldwide AI Discovery', 'DISCOVER · FOLLOW · SAVE FILTERS',
      (state.discoveryError ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.discoveryError) + '</div>' :
        '<p class="ai-network-note">Search public, active AI identities. Follower counts and following status come from stored relationship records; private profiles are not exposed in public results.</p>') +
      '<form class="ai-network-form" data-ai-form="discovery">' +
      '<label>Search by name or username<input name="search" value="' + esc(state.discoveryFilters.search || '') + '" maxlength="120" placeholder="Search AI profiles"></label>' +
      '<div class="ai-network-form-grid">' + multi('category_keys','AI categories',categories,5) + multi('populations','AI population',populations,3) +
      multi('genders','Gender',genders,5) + multi('countries','Country (search list)',countries,6) + '</div>' +
      '<div class="ai-network-form-grid"><label>Languages (comma-separated tags)<input name="languages" value="' + esc(list(state.discoveryFilters.languages).join(', ')) + '" placeholder="en, ht, es"></label>' +
      '<label>Interests and hobbies (comma-separated)<input name="interests" value="' + esc(list(state.discoveryFilters.interests).join(', ')) + '" placeholder="music, travel, science"></label>' +
      '<label>Skills (comma-separated)<input name="skills" value="' + esc(list(state.discoveryFilters.skills).join(', ')) + '" placeholder="education, design"></label>' +
      '<label>Capabilities (comma-separated)<input name="capabilities" value="' + esc(list(state.discoveryFilters.capabilities).join(', ')) + '" placeholder="text, voice, image"></label>' +
      '<label>Nationality (comma-separated)<input name="nationalities" value="' + esc(list(state.discoveryFilters.nationalities).join(', ')) + '" placeholder="Jamaican, Canadian"></label>' +
      '<label>Profession contains<input name="profession" value="' + esc(state.discoveryFilters.profession || '') + '" maxlength="100"></label>' +
      '<label>Region, parish, city or district (comma-separated)<input name="regions" value="' + esc(list(state.discoveryFilters.regions).join(', ')) + '"></label></div>' +
      '<div class="ai-network-form-grid"><label>Sort<select name="sort">' + options([{value:'newest',label:'Newest'},{value:'popular',label:'Most followed'}],state.discoveryFilters.sort || 'newest') + '</select></label>' +
      '<label>Created within (days; 0 means any time)<input type="number" name="recent_days" min="0" max="3650" value="' + esc(state.discoveryFilters.recent_days || 0) + '"></label></div>' +
      '<button class="primary" type="submit">Search AI profiles</button></form>' +
      '<form class="ai-network-form ai-network-discovery-bulk" data-ai-form="bulk-follow"><div class="ai-network-discovery-results"><strong>' + number(state.discoveryResults?.total) + ' matching public AI profiles</strong>' + identityRows + '</div>' +
      '<button type="submit" class="secondary"' + (results.length ? '' : ' disabled') + '>Follow selected AI profiles (max 100)</button></form>' +
      '<form class="ai-network-form" data-ai-form="saved-discovery-group"><div class="ai-network-form-title">Save current discovery filters</div>' +
      '<label>Group name<input name="groupName" required minlength="2" maxlength="80" placeholder="Jamaican AI educators"></label>' +
      '<button type="submit" class="secondary">Save discovery group</button></form>' +
      '<div class="ai-network-discovery-groups"><h3>Saved discovery groups</h3>' + groupRows + '</div>' +
      '<div class="ai-network-discovery-requests"><h3>Follow requests for your AI profiles</h3>' + requests + '</div>' +
      '<div class="ai-network-note">You follow ' + number(state.following.length) + ' AI profiles. Human and AI engagement metrics remain separate.</div>',
      'ai-network-span-2 ai-network-discovery-center');
  }

  function renderAICategoryAdmin() {
    if (!Array.isArray(state.categoryAdmin)) return '';
    const categories = state.categoryAdmin;
    const rows = categories.length
      ? '<div class="ai-network-list">' + categories.map(category =>
          '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(category.display_name) + '</strong>' +
          '<div class="ai-network-meta">' + pill(category.is_active ? 'Active' : 'Inactive', category.is_active ? 'success' : 'warning') + '</div>' +
          '<small>' + esc(category.category_key) + ' · Order ' + number(category.sort_order) + '</small>' +
          '<p>' + esc(category.description || 'No description') + '</p></div></div>' +
          '<div class="ai-network-row-actions"><button type="button" class="secondary" data-ai-action="edit-category" data-category-key="' + esc(category.category_key) + '">Edit</button></div></article>'
        ).join('') + '</div>'
      : empty('No AI categories are registered.');
    const form = '<form class="ai-network-form" data-ai-form="category">' +
      '<div class="ai-network-form-title">Create or edit a category</div>' +
      '<label>Stable category key<input name="categoryKey" required minlength="2" maxlength="64" pattern="[a-z][a-z0-9_]+" autocomplete="off" placeholder="ai_science"></label>' +
      '<p class="ai-network-note">Category keys remain stable because existing AI identities reference them. Rename the display name instead; deactivate rather than delete.</p>' +
      '<div class="ai-network-form-grid"><label>Display name<input name="displayName" required minlength="2" maxlength="80"></label>' +
      '<label>Sort order<input name="sortOrder" type="number" min="0" max="100000" step="1" value="1000" required></label></div>' +
      '<label>Description<textarea name="description" maxlength="400" rows="2"></textarea></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="isActive" checked><span>Available for new AI identities</span></label>' +
      '<button class="primary" type="submit">Save category</button></form>';
    return card('AI Category Management', 'ADMIN · CREATE · RENAME · ACTIVATE · DEACTIVATE',
      '<p>Manage the discoverable AI categories. Every change is recorded in the category audit log; existing identities are preserved.</p>' +
      rows + form, 'ai-network-span-2');
  }

  function renderAIIdentityRegistry() {
    const registry = state.identityRegistry;
    const categories = list(state.identityCategories);
    const categoryOptions = categories.map(category => ({ value:category.category_key, label:category.display_name }));
    const warning = state.identityError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.identityError) + '</div>'
      : '<p class="ai-network-note">Each record is a distinct AI identity. No human login account or email inbox is created.</p>';
    const pageSize = Math.max(1, Number(registry?.limit || 100));
    const pageOffset = Math.max(0, Number(registry?.offset ?? state.identityRegistryOffset ?? 0));
    const totalIdentities = Math.max(0, Number(registry?.total || 0));
    const firstIdentity = totalIdentities ? pageOffset + 1 : 0;
    const lastIdentity = Math.min(pageOffset + pageSize, totalIdentities);
    const searchForm = '<form class="ai-network-inline-form ai-network-identity-search" data-ai-form="identity-search">' +
      '<label><span>Search your AI identities</span><input type="search" name="search" maxlength="120" value="' + esc(state.identityRegistrySearch) + '" placeholder="Name, display name or username"></label>' +
      '<button type="submit" class="secondary">Search</button>' +
      '<button type="button" class="secondary" data-ai-action="identity-search-clear"' + (!state.identityRegistrySearch ? ' disabled' : '') + '>Clear</button></form>';
    const pagination = '<div class="ai-network-inline-form ai-network-identity-pagination" role="group" aria-label="AI identity registry pages">' +
      '<span>Showing ' + number(firstIdentity) + '–' + number(lastIdentity) + ' of ' + number(totalIdentities) + ' AI identities</span>' +
      '<button type="button" class="secondary" data-ai-action="identity-page" data-offset="' + Math.max(0, pageOffset - pageSize) + '"' + (pageOffset <= 0 ? ' disabled' : '') + '>Previous</button>' +
      '<button type="button" class="secondary" data-ai-action="identity-page" data-offset="' + (pageOffset + pageSize) + '"' + (pageOffset + pageSize >= totalIdentities ? ' disabled' : '') + '>Next</button></div>';
    const form = '<form class="ai-network-form" data-ai-form="identity">' +
      '<div class="ai-network-form-title">Register an AI identity</div>' +
      '<div class="ai-network-form-grid"><label>First name<input name="firstName" required maxlength="80" autocomplete="off"></label>' +
      '<label>Last name<input name="lastName" required maxlength="80" autocomplete="off"></label>' +
      '<label>Middle name (optional)<input name="middleName" maxlength="80" autocomplete="off"></label>' +
      '<label>Display name<input name="displayName" maxlength="120" placeholder="Defaults to full name"></label>' +
      '<label>Username<input name="username" required minlength="3" maxlength="30" pattern="[a-z0-9_]+" autocomplete="off" placeholder="lowercase_username"></label>' +
      '<label>AI category<select name="categoryKey" required ' + (!categories.length ? 'disabled' : '') + '>' +
      (categoryOptions.length ? options(categoryOptions, categoryOptions[0].value) : '<option value="">Categories unavailable</option>') + '</select></label>' +
      (state.adminAccess
        ? '<label>AI population<select name="population">' + options([
            {value:'independent',label:'Independent AI'},
            {value:'organizational',label:'Organizational AI'},
            {value:'specialized_service',label:'Specialized AI service'}
          ], 'independent') + '</select></label>'
        : '<input type="hidden" name="population" value="independent"><p class="ai-network-note">Member-created identities belong to the independent AI population. Organizational employees and specialized platform services are managed by authorized administrators.</p>') +
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
      '<label>Profile visibility<select name="profileVisibility">' + options([{value:'private',label:'Private until approved'},{value:'followers',label:'Followers only'},{value:'public',label:'Public'},{value:'hidden',label:'Hidden from discovery'}], 'private') + '</select></label>' +
      '<label>Qualifications (comma-separated)<input name="qualifications" maxlength="2000" placeholder="Certificates, degrees, licences"></label>' +
      '<label>Interests (comma-separated)<input name="interests" maxlength="1000"></label>' +
      '<label>Hobbies (comma-separated)<input name="hobbies" maxlength="1000"></label>' +
      '<label>Skills (comma-separated)<input name="skills" maxlength="1000"></label>' +
      '<label>Languages (comma-separated tags)<input name="languages" maxlength="240" value="en" placeholder="en, ht, es"></label></div>' +
      '<label>Education history (JSON array)<textarea name="education" maxlength="12000" rows="3" spellcheck="false" placeholder=\'[{"institution":"Example University","qualification":"BSc Computer Science","year":2024}]\'>[]</textarea></label>' +
      '<div class="ai-network-form-grid"><label>Personality configuration (JSON object)<textarea name="personality" maxlength="8000" rows="3" spellcheck="false" placeholder=\'{"traits":["curious","warm"],"communication_style":"supportive"}\'>{}</textarea></label>' +
      '<label>Voice preferences (JSON object)<textarea name="voicePreferences" maxlength="4000" rows="3" spellcheck="false" placeholder=\'{"voice_style":"natural","pace":"measured"}\'>{}</textarea></label></div>' +
      countryDatalist +
      '<label>Email address (optional; record only)<input name="emailAddress" type="email" maxlength="320" placeholder="No inbox is created or claimed"></label>' +
      '<button class="primary" type="submit" ' + (!categories.length || !window.crypto?.randomUUID ? 'disabled' : '') + '>Create relational AI identity</button>' +
      '</form>';
    const bulkProfileForm = '<form class="ai-network-form" data-ai-form="identity-profile-bulk">' +
      '<div class="ai-network-form-title">Bulk update AI profiles (1–100 per batch)</div>' +
      '<p class="ai-network-note">Paste a JSON array of full owner-managed profile snapshots. Each item requires identity_id, name, profile, languages and locations. A full snapshot replaces the listed profile fields; omitted profile text fields may be cleared. Records are updated only when they belong to your signed-in Minglora account. Failed rows are reported separately.</p>' +
      '<label>Profile update batch JSON<textarea name="items" required rows="8" maxlength="300000" spellcheck="false" placeholder=\'[{"identity_id":"existing-ai-identity-uuid","name":{"first_name":"Ava","middle_name":"","last_name":"Morgan","display_name":"Ava Morgan","username":"ava_morgan"},"profile":{"gender":"female","profile_visibility":"public","bio":"Updated biography","introduction":"","time_zone":"America/Jamaica"},"languages":[{"language_tag":"en","language_name":"English","proficiency":"fluent","is_primary":true}],"locations":[]}]\'></textarea></label>' +
      '<button class="secondary" type="submit">Update selected AI profiles</button></form>';
    const batchHistory = list(state.identityBatches).length
      ? '<section class="ai-network-batch-history" aria-label="Recent AI identity imports"><h3>Recent identity imports</h3>' +
        list(state.identityBatches).map(batch => {
          const failures = list(batch.failed_rows);
          const failed = Number(batch.failed_count || failures.length || 0);
          const summary = number(batch.created_count || 0) + ' created · ' + number(batch.reused_count || 0) +
            ' reused · ' + number(failed) + ' failed';
          const rows = failures.length
            ? '<ul>' + failures.slice(0, 5).map(row =>
                '<li>Row ' + number(row.row_index) + ' [' + esc(row.idempotency_key || '') + ']: ' +
                esc(row.error || 'Retry required.') + '</li>'
              ).join('') + '</ul>'
            : '';
          return '<article class="ai-network-batch-row"><div><strong>' + esc(batch.status || 'unknown') +
            '</strong><span>' + esc(summary) + '</span><small>' + esc(date(batch.created_at)) + ' · ' +
            esc(batch.batch_id || '') + '</small></div>' +
            (failed > 0 ? '<button type="button" class="secondary" data-ai-action="identity-batch-retry" data-batch-id="' +
              esc(batch.batch_id) + '">Retry ' + number(failed) + ' failed row(s)</button>' : '') + rows + '</article>';
        }).join('') + '</section>'
      : '<p class="ai-network-note">No identity import batches have been recorded yet. Failed rows from future imports will remain available here for safe retry after refresh.</p>';
    const bulkForm = '<form class="ai-network-form" data-ai-form="identity-bulk">' +
      '<div class="ai-network-form-title">Bulk import AI identities (1–100 per batch)</div>' +
      '<p class="ai-network-note">Paste a JSON array. Each item uses the same name, category, population and profile fields as the single-identity form. Give every row its own stable idempotency_key. The import has a separate batch key, saves failed row data privately in Supabase, and lets you retry only failures after refresh. Successful row payloads are cleared from the retry store. ' +
      (state.adminAccess ? 'Authorized administrators may create independent, organizational or specialized-service identities.' : 'Member batches may contain independent AI identities only.') + '</p>' +
      '<label>Identity batch JSON<textarea name="items" required rows="8" maxlength="180000" spellcheck="false" placeholder=\'[{"population":"independent","category_key":"ai_friends","idempotency_key":"import-row-000001","name":{"first_name":"Ava","last_name":"Morgan","username":"ava_morgan_01"},"profile":{"gender":"female"}}]\'></textarea></label>' +
      '<button class="primary" type="submit" ' + (!categories.length || !window.crypto?.randomUUID ? 'disabled' : '') + '>Import identity batch</button>' +
      '</form>';
    return card('AI Identity & Profile Registry', 'RELATIONAL IDENTITY FOUNDATION',
      '<p>Registered identities are stored individually in Minglora Supabase. Human authentication accounts are kept separate.</p>' +
      warning + '<div class="ai-network-quick-stats"><div><span>Registered identities</span><strong>' +
      (registry ? number(registry.total) : 'Unavailable') + '</strong></div><div><span>Categories available</span><strong>' + number(categories.length) +
      '</strong></div></div>' + renderAIEmailCenter() + searchForm + pagination + renderAIIdentityRows(registry) + pagination + form + bulkForm + batchHistory + bulkProfileForm, 'ai-network-span-2');
  }

  async function loadAIEmailCenter(identityId = state.emailIdentityId) {
    state.emailError = '';
    try {
      state.emailStatus = await request('/email/status');
    } catch (error) {
      state.emailStatus = null;
      state.emailError = error.message || 'AI email provider status could not be loaded.';
    }
    const available = list(state.identityRegistry?.identities)
      .map(record => record.identity?.identity_id).filter(Boolean);
    const selected = available.includes(identityId) ? identityId : (available[0] || '');
    state.emailIdentityId = selected;
    state.emailMailboxes = [];
    state.emailMessages = [];
    state.emailUnreadCount = 0;
    state.emailMailboxId = '';
    if (!selected) return;
    try {
      const registry = await request('/identities/' + encodeURIComponent(selected) + '/email');
      state.emailMailboxes = list(registry.mailboxes);
      const mailbox = state.emailMailboxes.find(item =>
        item.mailbox_enabled && item.provisioning_status === 'provisioned' && item.email_status === 'active'
      );
      if (!mailbox) return;
      state.emailMailboxId = mailbox.email_id;
      const inbox = await request('/identities/' + encodeURIComponent(selected) +
        '/email/inbox?email_id=' + encodeURIComponent(mailbox.email_id) + '&limit=30');
      state.emailMessages = list(inbox.messages);
      state.emailUnreadCount = Number(inbox.unread_count || 0);
    } catch (error) {
      state.emailError = error.message || 'AI mailbox or inbox could not be loaded.';
    }
  }

  function renderAIEmailCenter() {
    const records = list(state.identityRegistry?.identities);
    const identities = records.map(record => ({
      value:record.identity?.identity_id || '',
      label:(record.name?.display_name || record.name?.full_name ||
        [record.name?.first_name,record.name?.last_name].filter(Boolean).join(' ') || 'AI identity') +
        ' · @' + (record.name?.username || 'username')
    })).filter(item => item.value);
    if (!identities.length) {
      return '<section class="ai-network-card"><div class="ai-network-card-heading"><div><span class="ai-network-eyebrow">EMAIL PROVISIONING</span><h2>AI Mailboxes</h2></div></div>' +
        empty('Create an AI identity before provisioning its Minglora email address.') + '</section>';
    }
    const identityId = state.emailIdentityId || identities[0].value;
    const mailbox = state.emailMailboxes.find(item => item.email_id === state.emailMailboxId) ||
      state.emailMailboxes.find(item => item.mailbox_enabled && item.provisioning_status === 'provisioned');
    const status = state.emailStatus || {};
    const ready = Boolean(status.ready);
    const providerSummary = status.ready
      ? pill('Resend domain ready','success')
      : pill('Provisioning blocked','warning');
    const mailboxSummary = mailbox
      ? '<div class="ai-network-note"><strong>' + esc(mailbox.email_address) + '</strong> · ' +
        esc(mailbox.provisioning_status) + ' · ' + esc(mailbox.email_status) +
        ' · verification: ' + esc(mailbox.verification_status) +
        '<br><small>App-managed Minglora inbox; this is not a separate external human email account.</small></div>'
      : '<p class="ai-network-note">No Minglora AI mailbox has been provisioned for this identity yet.</p>';
    const messages = state.emailMessages.length
      ? '<div class="ai-network-list">' + state.emailMessages.map(message =>
        '<article class="ai-network-list-row"><div class="ai-network-list-main"><div class="ai-network-avatar ai-network-avatar--team" aria-hidden="true">' +
        (message.direction === 'inbound' ? 'IN' : 'OUT') + '</div><div><strong>' + esc(message.subject || '(no subject)') + '</strong>' +
        '<div class="ai-network-meta">' + pill(message.direction === 'inbound' ? 'Received' : 'Sent', message.direction === 'inbound' ? 'ai' : 'neutral') +
        ' ' + pill(message.status || 'unknown') + '</div><small>' +
        esc(message.direction === 'inbound' ? 'From: ' + (message.from_address || 'Unknown sender') : 'To: ' + list(message.to_addresses).join(', ')) +
        ' · ' + esc(date(message.created_at)) + '</small>' +
        '<details class="ai-network-profile-editor"><summary>View message</summary><p>' +
        esc(message.text_body || '[No plain-text body]').replace(/\n/g,'<br>') +
        '</p>' + (list(message.attachments).length ? '<small>Attachments: ' + esc(list(message.attachments).map(item => item.filename || 'file').join(', ')) + '</small>' : '') +
        '</details></div></div>' +
        (message.direction === 'inbound' && !message.read_at
          ? '<button type="button" class="secondary" data-ai-action="email-mark-read" data-id="' + esc(message.message_id) + '" data-identity-id="' + esc(identityId) + '">Mark read</button>'
          : '') +
        '</article>'
      ).join('') + '</div>'
      : empty(mailbox ? 'This AI inbox has no messages yet.' : 'Provision an AI mailbox to start receiving mail.');
    const canSend = Boolean(mailbox && status.sendingEnabled);
    const form = canSend
      ? '<form class="ai-network-form" data-ai-form="email-send" data-identity-id="' + esc(identityId) +
        '" data-email-id="' + esc(mailbox.email_id) + '">' +
        '<div class="ai-network-form-title">Compose email from this AI identity</div>' +
        '<label>Recipient email addresses<input name="to" type="text" required maxlength="3200" placeholder="person@example.com, another@example.com"></label>' +
        '<label>Subject<input name="subject" required maxlength="200"></label>' +
        '<label>Message<textarea name="text" required maxlength="24000" rows="5" placeholder="Write the email message…"></textarea></label>' +
        '<p class="ai-network-note">Sending uses Resend with an idempotency key. AI email is sent only after this administrator action; the mailbox does not independently contact people.</p>' +
        '<button class="primary" type="submit">Send email</button></form>'
      : '<p class="ai-network-note">Sending becomes available after a verified Resend domain is configured and this identity has an active mailbox.</p>';
    const error = state.emailError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.emailError) + '</div>'
      : '';
    return '<section class="ai-network-card ai-network-span-2"><div class="ai-network-card-heading"><div><span class="ai-network-eyebrow">EMAIL PROVISIONING</span><h2>AI Mailboxes</h2></div></div>' +
      '<div class="ai-network-meta">' + providerSummary + ' ' + pill(status.provider || 'No provider') + '</div>' +
      '<p class="ai-network-note">' + esc(status.note || 'Email provider configuration has not been checked.') +
      (status.domain ? '<br>Domain: ' + esc(status.domain) : '') +
      '<br>Readiness requires a verified domain with both sending and receiving enabled, plus a webhook signing secret.</p>' + error +
      '<label>AI identity<select data-ai-email-identity>' + options(identities,identityId) + '</select></label>' +
      mailboxSummary +
      '<div class="ai-network-row-actions">' +
      (mailbox ? '<button type="button" class="secondary" data-ai-action="email-refresh" data-id="' + esc(identityId) + '">Refresh inbox · ' + number(state.emailUnreadCount) + ' unread</button>'
        : '<button type="button" class="primary" data-ai-action="email-provision" data-id="' + esc(identityId) + '"' + (!ready ? ' disabled title="Configure and verify the Resend domain first."' : '') + '>Provision AI email address</button>') +
      '</div>' + (mailbox ? '<h3>Inbox and sent mail</h3>' + messages + form : '') + '</section>';
  }

  async function loadAIIdentityRegistry() {
    state.identityError = '';
    try {
      const identityQuery = new URLSearchParams({
        limit: '100',
        offset: String(Math.max(0, Number(state.identityRegistryOffset) || 0))
      });
      if (state.identityRegistrySearch) identityQuery.set('search', state.identityRegistrySearch.slice(0, 120));
      const [registry, categoryResult] = await Promise.all([
        request('/identities?' + identityQuery.toString()),
        request('/categories')
      ]);
      state.identityRegistry = registry;
      state.identityRegistryOffset = Math.max(0, Number(registry?.offset || 0));
      state.identityCategories = list(categoryResult.categories);
      try {
        const batchResult = await request('/identities/batches?limit=12');
        state.identityBatches = list(batchResult?.batches);
        state.identityBatchError = '';
      } catch (batchError) {
        state.identityBatches = [];
        state.identityBatchError = batchError.message || 'Identity import history is unavailable.';
      }
      try {
        const adminCategoryResult = await request('/categories/admin');
        state.categoryAdmin = list(adminCategoryResult.categories);
        state.adminAccess = true;
      } catch {
        state.categoryAdmin = null;
        state.adminAccess = false;
      }
    } catch (error) {
      state.identityRegistry = null;
      state.identityCategories = [];
      state.identityBatches = [];
      state.identityBatchError = '';
      state.categoryAdmin = null;
      state.adminAccess = false;
      state.identityError = error.message || 'Relational AI identity service is unavailable.';
    }
  }

  async function loadAIMemory(identityId = state.memoryIdentityId) {
    const records = list(state.identityRegistry?.identities);
    const available = records.map(record => record.identity?.identity_id).filter(Boolean);
    const selected = available.includes(identityId) ? identityId : (available[0] || '');
    state.memoryIdentityId = selected;
    state.memoryError = '';
    if (!selected) {
      state.memorySettings = null;
      state.memoryEntries = [];
      return;
    }
    try {
      const result = await request('/identities/' + encodeURIComponent(selected) + '/memory');
      state.memorySettings = result?.settings || {
        identity_id:selected, memory_enabled:false, long_term_enabled:false,
        short_term_retention_days:7, long_term_retention_days:365, max_entries:500
      };
      state.memoryEntries = list(result?.entries);
    } catch (error) {
      state.memorySettings = null;
      state.memoryEntries = [];
      state.memoryError = error.message || 'AI memory is not available.';
    }
  }

  function renderAIMemoryCenter() {
    const records = list(state.identityRegistry?.identities);
    const identities = records.map(record => ({
      value:record.identity?.identity_id || '',
      label:(record.name?.display_name || record.name?.full_name ||
        [record.name?.first_name,record.name?.last_name].filter(Boolean).join(' ') || 'AI identity') +
        ' · @' + (record.name?.username || 'username')
    })).filter(item => item.value);
    if (!identities.length) {
      return card('Individual AI Memory', '11 · PRIVATE MEMORY',
        empty('Create an AI identity before configuring its individual memory. No shared or human account memory is stored here.'), 'ai-network-span-2');
    }
    const identityId = state.memoryIdentityId || identities[0].value;
    const settings = state.memorySettings || {
      memory_enabled:false, long_term_enabled:false,
      short_term_retention_days:7, long_term_retention_days:365, max_entries:500
    };
    const entries = list(state.memoryEntries);
    const entryRows = entries.length ? '<div class="ai-network-list">' + entries.map(entry =>
      '<article class="ai-network-list-row"><div class="ai-network-list-main"><div class="ai-network-avatar ai-network-avatar--team" aria-hidden="true">MEM</div><div>' +
      '<strong>' + esc(entry.summary || 'Memory entry') + '</strong><div class="ai-network-meta">' +
      pill(entry.memory_type === 'long_term' ? 'Long-term' : 'Short-term', entry.memory_type === 'long_term' ? 'ai' : 'neutral') +
      ' ' + pill('Owner-managed') + '</div><small>Expires: ' + esc(date(entry.expires_at)) + '</small>' +
      '<details class="ai-network-profile-editor"><summary>Edit memory entry</summary>' +
      '<form class="ai-network-form" data-ai-form="memory-edit" data-identity-id="' + esc(identityId) +
      '" data-memory-id="' + esc(entry.memory_id || '') + '">' +
      '<label>Memory type<select name="memoryType">' + options([{value:'short_term',label:'Short-term'},{value:'long_term',label:'Long-term'}],entry.memory_type || 'short_term') + '</select></label>' +
      '<label>Summary<textarea name="summary" required maxlength="1000" rows="2">' + esc(entry.summary || '') + '</textarea></label>' +
      '<label>Additional context<textarea name="note" maxlength="8000" rows="2">' + esc(entry.content?.note || '') + '</textarea></label>' +
      '<button class="primary" type="submit">Update memory</button></form></details></div></div>' +
      '<button type="button" class="secondary" data-ai-action="delete-memory" data-id="' + esc(entry.memory_id || '') +
      '" data-identity-id="' + esc(identityId) + '">Delete memory</button></article>'
    ).join('') + '</div>' : empty('No memory entries are stored for this identity.');
    const warning = state.memoryError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.memoryError) + '</div>'
      : '<p class="ai-network-note">Memory is off by default. Saving an entry requires owner opt-in; long-term storage needs a separate opt-in. Entries expire automatically. This storage does not yet connect to live model recall or automatic conversation capture.</p>';
    return card('Individual AI Memory', '11 · PRIVATE MEMORY',
      warning +
      '<label>AI identity<select data-ai-memory-identity>' + options(identities,identityId) + '</select></label>' +
      '<form class="ai-network-form" data-ai-form="memory-settings" data-identity-id="' + esc(identityId) + '">' +
      '<div class="ai-network-form-title">Memory consent and retention</div>' +
      '<label class="ai-network-check"><input type="checkbox" name="memoryEnabled"' + (settings.memory_enabled ? ' checked' : '') + '> Enable memory for this AI identity</label>' +
      '<label class="ai-network-check"><input type="checkbox" name="longTermEnabled"' + (settings.long_term_enabled ? ' checked' : '') + '> Separately allow long-term memory</label>' +
      '<div class="ai-network-form-grid">' +
      '<label>Short-term retention (days)<input name="shortTermRetentionDays" type="number" min="1" max="90" value="' + esc(settings.short_term_retention_days ?? 7) + '"></label>' +
      '<label>Long-term retention (days)<input name="longTermRetentionDays" type="number" min="30" max="3650" value="' + esc(settings.long_term_retention_days ?? 365) + '"></label>' +
      '<label>Maximum entries<input name="maxEntries" type="number" min="1" max="5000" value="' + esc(settings.max_entries ?? 500) + '"></label></div>' +
      '<button class="primary" type="submit">Save memory settings</button></form>' +
      '<form class="ai-network-form" data-ai-form="memory-entry" data-identity-id="' + esc(identityId) + '">' +
      '<div class="ai-network-form-title">Add an owner-managed memory</div>' +
      '<label>Memory type<select name="memoryType">' + options([{value:'short_term',label:'Short-term'},{value:'long_term',label:'Long-term'}],'short_term') + '</select></label>' +
      '<label>Memory summary<textarea name="summary" required maxlength="1000" rows="2" placeholder="Enter information approved for this AI identity to retain."></textarea></label>' +
      '<label>Additional context (optional)<textarea name="note" maxlength="8000" rows="2"></textarea></label>' +
      '<button class="primary" type="submit"' + (!settings.memory_enabled ? ' disabled' : '') + '>Save memory entry</button></form>' +
      '<div class="ai-network-memory-entries"><div class="ai-network-form-title">Stored memory (' + number(entries.length) + '/' + number(settings.max_entries ?? 500) + ')</div>' +
      entryRows + '</div>', 'ai-network-span-2');
  }

  async function loadAIDiscovery(filters = state.discoveryFilters) {
    state.discoveryError = '';
    state.discoveryFilters = filters && typeof filters === 'object' ? filters : {};
    try {
      const params = new URLSearchParams();
      for (const [key, raw] of Object.entries(state.discoveryFilters)) {
        const values = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
        for (const value of values) params.append(key, String(value));
      }
      params.set('limit', '24');
      const [result, following, requests, groups] = await Promise.all([
        request('/discover?' + params.toString()),
        request('/following'),
        request('/follow-requests'),
        request('/saved-groups')
      ]);
      state.discoveryResults = result || { identities: [], total: 0 };
      state.following = list(following.following);
      state.followRequests = list(requests.requests);
      state.savedDiscoveryGroups = list(groups.groups);
    } catch (error) {
      state.discoveryResults = { identities: [], total: 0 };
      state.following = [];
      state.followRequests = [];
      state.savedDiscoveryGroups = [];
      state.discoveryError = error.message || 'AI discovery is not available yet.';
    }
  }

  async function loadAITaskQueue() {
    state.taskError = '';
    try {
      const result = await request('/tasks');
      state.aiTasks = list(result.tasks);
      state.taskRuntime = result.runtime || null;
    } catch (error) {
      state.aiTasks = [];
      state.taskRuntime = null;
      state.taskError = error.message || 'AI task queue is unavailable.';
    }
  }

  async function loadAIProviderRegistry() {
    state.providerError = '';
    try {
      const [accounts, models, assignments] = await Promise.all([
        request('/provider-accounts'),
        request('/provider-models'),
        request('/provider-assignments')
      ]);
      state.providerAccounts = list(accounts.provider_accounts);
      state.providerModels = list(models.provider_models);
      state.providerAssignments = list(assignments.assignments);
    } catch (error) {
      state.providerAccounts = [];
      state.providerModels = [];
      state.providerAssignments = [];
      state.providerError = error.message || 'AI provider catalogue is unavailable.';
    }
  }

  async function loadAIDelegations() {
    state.delegationGrants = [];
    state.delegationAccess = false;
    state.delegationError = '';
    try {
      const result = await request('/delegations');
      state.delegationGrants = list(result.delegation_grants);
      state.delegationAccess = true;
    } catch (error) {
      if (error.status !== 403) state.delegationError = error.message || 'AI delegation controls are not available.';
    }
  }

  async function loadAIOrganizationRegistry() {
    state.organizationError = '';
    try {
      const [registry, departmentResult, positionResult] = await Promise.all([
        request('/organizations'),
        request('/department-templates'),
        request('/position-templates')
      ]);
      state.organizationRegistry = registry;
      state.departmentTemplates = list(departmentResult.templates);
      state.positionTemplates = list(positionResult.templates);
      const records = list(registry.organizations);
      const details = await Promise.all(records.map(async record => {
        const organizationId = record.organization?.organization_id;
        if (!organizationId) return null;
        const base = '/organizations/' + encodeURIComponent(organizationId);
        const [departmentResult, positionResult, vacancyResult, applicationResult, employeeResult] = await Promise.all([
          request(base + '/departments'), request(base + '/positions'), request(base + '/vacancies'),
          request(base + '/applications'), request(base + '/employees')
        ]);
        const talentResults = await Promise.allSettled([
          request(base + '/performance-reviews'), request(base + '/succession-plans'), request(base + '/promotions')
        ]);
        const reviewResult = talentResults[0].status === 'fulfilled' ? talentResults[0].value : {};
        const successionResult = talentResults[1].status === 'fulfilled' ? talentResults[1].value : {};
        const promotionResult = talentResults[2].status === 'fulfilled' ? talentResults[2].value : {};
        const developmentResults = await Promise.allSettled([
          request(base + '/training-courses'), request(base + '/training-enrollments'), request(base + '/attendance')
        ]);
        const courseResult = developmentResults[0].status === 'fulfilled' ? developmentResults[0].value : {};
        const enrollmentResult = developmentResults[1].status === 'fulfilled' ? developmentResults[1].value : {};
        const attendanceResult = developmentResults[2].status === 'fulfilled' ? developmentResults[2].value : {};
        return [organizationId, {
          departments: list(departmentResult.departments), positions: list(positionResult.positions),
          vacancies: list(vacancyResult.vacancies), applications: list(applicationResult.applications),
          employees: list(employeeResult.employees), performanceReviews: list(reviewResult.performance_reviews),
          successionPlans: list(successionResult.succession_plans), promotions: list(promotionResult.promotions),
          trainingCourses: list(courseResult.training_courses),
          trainingEnrollments: list(enrollmentResult.training_enrollments),
          attendance: list(attendanceResult.attendance),
          developmentUnavailable: developmentResults.some(result => result.status === 'rejected'),
          talentUnavailable: talentResults.some(result => result.status === 'rejected')
        }];
      }));
      state.organizationHR = Object.fromEntries(details.filter(Boolean));
    } catch (error) {
      state.organizationRegistry = null;
      state.departmentTemplates = [];
      state.positionTemplates = [];
      state.organizationHR = {};
      state.organizationError = error.message || 'AI corporate and workforce records are not available.';
    }
  }


  function renderAIHRWorkspace(organizationId, hr = {}) {
    const departments = list(hr.departments).map(row => row.department).filter(Boolean);
    const positions = list(hr.positions);
    const vacancies = list(hr.vacancies).map(row => row.vacancy).filter(Boolean);
    const applications = list(hr.applications);
    const employees = list(hr.employees);
    const reviews = list(hr.performanceReviews);
    const successionPlans = list(hr.successionPlans);
    const promotions = list(hr.promotions);
    const trainingCourses = list(hr.trainingCourses);
    const trainingEnrollments = list(hr.trainingEnrollments);
    const attendanceRecords = list(hr.attendance);
    const identityRecords = list(state.identityRegistry?.identities);
    const identityOptions = identityRecords.map(row => ({
      value: row.identity?.identity_id || '',
      label: (row.name?.display_name || row.name?.full_name || 'AI identity') +
        (row.name?.username ? ' (@' + row.name.username + ')' : '')
    })).filter(option => option.value);
    const departmentOptions = departments.map(row => ({ value: row.department_id, label: row.display_name }));
    const positionOptions = positions.map(row => ({ value: row.position_id, label: row.display_name + ' · ' + row.job_family }));
    const activeEmployees = employees.filter(row => row.employment?.employment_status === 'active');
    const managerOptions = [{ value: '', label: 'No reporting manager' }].concat(activeEmployees.map(row => ({
      value: row.employment?.employment_id || '',
      label: (row.identity?.display_name || 'AI employee') + ' · ' + (row.position_name || 'Position')
    })).filter(option => option.value));
    const vacancyForm = departments.length && positions.length
      ? '<form class="ai-network-form ai-network-hr-form" data-ai-form="vacancy" data-organization-id="' + esc(organizationId) + '">' +
        '<div class="ai-network-form-title">Create recruitment vacancy</div>' +
        '<div class="ai-network-form-grid"><label>Vacancy title<input name="vacancyTitle" required minlength="3" maxlength="160" placeholder="Community Operations Specialist"></label>' +
        '<label>Department<select name="departmentId" required>' + options(departmentOptions, departmentOptions[0]?.value || '') + '</select></label>' +
        '<label>Position<select name="positionId" required>' + options(positionOptions, positionOptions[0]?.value || '') + '</select></label>' +
        '<label>Number of openings<input name="openings" type="number" min="1" max="1000" value="1" required></label></div>' +
        '<label>Summary<input name="summary" maxlength="300" placeholder="Role outcome and purpose"></label>' +
        '<label>Job description<textarea name="description" maxlength="4000" rows="2" placeholder="Responsibilities, boundaries and expected deliverables"></textarea></label>' +
        '<label>Requirements (one per line)<textarea name="requirements" maxlength="4000" rows="2" placeholder="Required skills, qualifications and capabilities"></textarea></label>' +
        '<button class="primary" type="submit">Save vacancy draft</button></form>'
      : '<p class="ai-network-note">Provision departments and positions before creating recruitment vacancies.</p>';
    const vacancyRows = vacancies.length
      ? '<div class="ai-network-list">' + vacancies.map(vacancy => {
          const matchingApplications = applications.filter(row => row.application?.vacancy_id === vacancy.vacancy_id);
          const openingsUsed = Number(list(hr.vacancies).find(row => row.vacancy?.vacancy_id === vacancy.vacancy_id)?.appointed_count || 0);
          return '<article class="ai-network-list-row ai-network-hr-row"><div class="ai-network-list-main"><div><strong>' +
            esc(vacancy.vacancy_title || 'Vacancy') + '</strong><div class="ai-network-meta">' +
            pill(vacancy.status || 'draft') + ' ' + pill((openingsUsed || 0) + '/' + (vacancy.openings || 1) + ' appointed') +
            '</div><p>' + matchingApplications.length + ' candidate applications</p></div></div>' +
            '<form class="ai-network-inline-form" data-ai-form="vacancy-status" data-organization-id="' + esc(organizationId) + '" data-vacancy-id="' + esc(vacancy.vacancy_id) + '">' +
            '<label class="ai-network-inline-select"><span>Vacancy status</span><select name="status">' + options([
              {value:'draft',label:'Draft'},{value:'open',label:'Open'},{value:'paused',label:'Paused'},
              {value:'closed',label:'Closed'},{value:'archived',label:'Archived'}
            ], vacancy.status || 'draft') + '</select></label><button class="secondary" type="submit">Update</button></form>' +
            (vacancy.status === 'open' && identityOptions.length
              ? '<form class="ai-network-inline-form ai-network-application-form" data-ai-form="application" data-organization-id="' + esc(organizationId) + '" data-vacancy-id="' + esc(vacancy.vacancy_id) + '">' +
                '<label><span>AI candidate</span><select name="identityId" required>' + options(identityOptions, identityOptions[0].value) + '</select></label>' +
                '<label><span>Application note</span><input name="coverNote" maxlength="2000" placeholder="Candidate fit / review context"></label>' +
                '<button class="secondary" type="submit">Submit candidate</button></form>'
              : vacancy.status === 'open'
                ? '<p class="ai-network-note">Create an AI identity before submitting a candidate.</p>'
                : '') +
            '</article>';
        }).join('') + '</div>'
      : empty('No recruitment vacancies have been created.');
    const applicationRows = applications.length
      ? '<div class="ai-network-list">' + applications.map(row => {
          const application = row.application || {};
          const identity = row.identity || {};
          const reviewable = ['submitted','under_review','shortlisted','approved'].includes(application.application_status);
          const appointForm = application.application_status === 'approved'
            ? '<form class="ai-network-inline-form" data-ai-form="appointment" data-organization-id="' + esc(organizationId) + '" data-application-id="' + esc(application.application_id) + '">' +
              '<label><span>Employment type</span><select name="employmentType">' + options([
                {value:'full_time',label:'Full time'},{value:'part_time',label:'Part time'},
                {value:'temporary',label:'Temporary'},{value:'contract',label:'Contract'},{value:'project',label:'Project'}
              ], 'full_time') + '</select></label>' +
              '<label><span>Manager</span><select name="managerEmploymentId">' + options(managerOptions, '') + '</select></label>' +
              '<label><span>Workload %</span><input name="workloadPercentage" type="number" min="0" max="100" value="100"></label>' +
              '<button class="primary" type="submit">Appoint to onboarding</button></form>'
            : '';
          return '<article class="ai-network-list-row ai-network-hr-row"><div class="ai-network-list-main"><div><strong>' +
            esc(identity.display_name || identity.username || 'AI candidate') + '</strong><div class="ai-network-meta">' +
            pill(application.application_status || 'submitted') + ' ' + esc(row.vacancy_title || '') +
            '</div></div></div>' +
            (reviewable ? '<form class="ai-network-inline-form" data-ai-form="application-review" data-organization-id="' + esc(organizationId) + '" data-application-id="' + esc(application.application_id) + '">' +
              '<label><span>Review decision</span><select name="status">' + options([
                {value:'under_review',label:'Under review'},{value:'shortlisted',label:'Shortlist'},
                {value:'approved',label:'Approve'},{value:'rejected',label:'Reject'},{value:'withdrawn',label:'Withdraw'}
              ], application.application_status || 'submitted') + '</select></label>' +
              '<label><span>Review note</span><input name="reviewNote" maxlength="2000" placeholder="Reason and evidence"></label>' +
              '<button class="secondary" type="submit">Save review</button></form>' : '') +
            appointForm + '</article>';
        }).join('') + '</div>'
      : empty('No candidate applications have been submitted.');
    const employeeRows = employees.length
      ? '<div class="ai-network-list">' + employees.map(row => {
          const employment = row.employment || {};
          const status = employment.employment_status || 'candidate';
          const currentStatus = status === 'onboarding'
            ? ['active','suspended','terminated']
            : status === 'active' ? ['restricted','suspended','terminated','retired']
              : status === 'restricted' ? ['active','suspended','terminated']
                : status === 'suspended' ? ['active','terminated'] : [];
          const statusOptions = currentStatus.map(value => ({ value, label:value.replaceAll('_',' ') }));
          const currentPosition = positions.find(position => position.position_id === employment.position_id);
          const promotionPositions = positions.filter(position =>
            Number(position.hierarchy_level) > Number(currentPosition?.hierarchy_level || 0) &&
            ['active','proposed','restricted'].includes(position.status)
          );
          const employeeReviews = reviews.filter(item => item.review?.employment_id === employment.employment_id);
          const promotionReviews = employeeReviews.filter(item => item.review?.review_status === 'finalized' &&
            ['promotion_consideration','role_change'].includes(item.review?.outcome));
          const managerForm = ['onboarding','active','restricted','suspended'].includes(status)
            ? '<form class="ai-network-inline-form" data-ai-form="employment-manager" data-organization-id="' + esc(organizationId) + '" data-employment-id="' + esc(employment.employment_id) + '">' +
              '<label><span>Reporting manager</span><select name="managerEmploymentId">' +
              options(managerOptions.filter(option => option.value !== employment.employment_id), employment.manager_employment_id || '') +
              '</select></label><button class="secondary" type="submit">Save manager</button></form>'
            : '';
          const statusForm = statusOptions.length
            ? '<form class="ai-network-inline-form" data-ai-form="employment-status" data-organization-id="' + esc(organizationId) + '" data-employment-id="' + esc(employment.employment_id) + '">' +
              '<label><span>Employment status</span><select name="status">' + options(statusOptions, statusOptions[0].value) + '</select></label>' +
              '<label><span>Reason</span><input name="reason" required minlength="3" maxlength="1000" placeholder="Document the change"></label>' +
              '<button class="secondary" type="submit">Update status</button></form>'
            : '';
          const transferForm = ['active','restricted','suspended'].includes(status) && departments.length && positions.length
            ? '<form class="ai-network-inline-form ai-network-transfer-form" data-ai-form="employment-transfer" data-organization-id="' + esc(organizationId) + '" data-employment-id="' + esc(employment.employment_id) + '">' +
              '<label><span>New department</span><select name="departmentId">' + options(departmentOptions, departmentOptions[0].value) + '</select></label>' +
              '<label><span>New position</span><select name="positionId">' + options(positionOptions, positionOptions[0].value) + '</select></label>' +
              '<label><span>New manager</span><select name="managerEmploymentId">' + options(managerOptions.filter(option => option.value !== employment.employment_id), '') + '</select></label>' +
              '<label><span>Transfer reason</span><input name="reason" required minlength="3" maxlength="1000"></label>' +
              '<button class="secondary" type="submit">Transfer employee</button></form>'
            : '';
          const promotionForm = status === 'active' && promotionPositions.length
            ? '<form class="ai-network-inline-form" data-ai-form="employee-promotion" data-organization-id="' + esc(organizationId) + '" data-employment-id="' + esc(employment.employment_id) + '">' +
              '<label><span>Promotion destination</span><select name="positionId" required>' +
              options(promotionPositions.map(position => ({value:position.position_id,label:position.display_name + ' · level ' + position.hierarchy_level})), promotionPositions[0].position_id) +
              '</select></label><label><span>Department</span><select name="departmentId" required>' + options(departmentOptions, employment.department_id || departmentOptions[0]?.value) + '</select></label>' +
              '<label><span>New reporting manager</span><select name="managerEmploymentId">' + options(managerOptions.filter(option => option.value !== employment.employment_id), '') + '</select></label>' +
              '<label><span>Supporting finalized review (optional)</span><select name="supportingReviewId">' +
              options([{value:'',label:'No supporting review'}].concat(promotionReviews.map(item=>({value:item.review.review_id,label:'Rating ' + item.review.rating + ' · ' + date(item.review.review_period_end)}))), '') +
              '</select></label><label><span>Promotion reason</span><input name="reason" required minlength="10" maxlength="1000"></label>' +
              '<button class="secondary" type="submit">Promote employee</button></form>'
            : '';
          const performanceReviewForm = status === 'active'
            ? '<form class="ai-network-inline-form" data-ai-form="performance-review" data-organization-id="' + esc(organizationId) + '" data-employment-id="' + esc(employment.employment_id) + '">' +
              '<label><span>Review period starts</span><input type="date" name="reviewPeriodStart" required></label>' +
              '<label><span>Review period ends</span><input type="date" name="reviewPeriodEnd" required></label>' +
              '<label><span>Human review rating (1–5)</span><select name="rating" required>' + options([1,2,3,4,5].map(value=>({value:String(value),label:String(value)+' / 5'})),'3') + '</select></label>' +
              '<label><span>Outcome</span><select name="outcome">' + options([{value:'continue',label:'Continue in role'},{value:'promotion_consideration',label:'Consider for promotion'},{value:'improvement_plan',label:'Improvement plan'},{value:'role_change',label:'Role change'}],'continue') + '</select></label>' +
              '<label><span>Review summary</span><textarea name="summary" required minlength="10" maxlength="4000" rows="2"></textarea></label>' +
              '<label><span>Strengths (one per line)</span><textarea name="strengths" maxlength="3000" rows="2"></textarea></label>' +
              '<label><span>Improvement areas (one per line)</span><textarea name="improvementAreas" maxlength="3000" rows="2"></textarea></label>' +
              '<label><span>Development goals (one per line)</span><textarea name="goals" maxlength="3000" rows="2"></textarea></label>' +
              '<button class="secondary" type="submit">Submit human performance review</button></form>'
            : '';
          return '<article class="ai-network-list-row ai-network-hr-row"><div class="ai-network-list-main"><div><strong>' +
            esc(row.identity?.display_name || row.identity?.username || 'AI employee') + '</strong><div class="ai-network-meta">' +
            pill(status) + ' ' + esc(row.department_name || '') + ' · ' + esc(row.position_name || '') +
            '</div></div></div>' + statusForm + managerForm + transferForm + promotionForm + performanceReviewForm + '</article>';
        }).join('') + '</div>'
      : empty('No AI employees have been appointed.');
    const performanceReviewRows = reviews.length
      ? '<div class="ai-network-list">' + reviews.map(item => {
          const review = item.review || {};
          const finalizeForm = review.review_status === 'submitted'
            ? '<form class="ai-network-inline-form" data-ai-form="performance-review-finalize" data-organization-id="' + esc(organizationId) + '" data-review-id="' + esc(review.review_id) + '">' +
              '<label><span>Finalization reason</span><input name="reason" required minlength="3" maxlength="1000"></label>' +
              '<button class="secondary" type="submit">Finalize review</button></form>' : '';
          return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' +
            esc(item.identity?.display_name || 'AI employee') + '</strong><div class="ai-network-meta">' +
            pill(review.review_status || 'submitted') + ' ' + pill('rating ' + review.rating + '/5') + ' ' + pill(review.outcome || 'no outcome') +
            '</div><p>' + esc(review.summary || '') + '</p><small>' + date(review.review_period_start) + ' – ' + date(review.review_period_end) +
            ' · ' + esc(item.position_name || '') + '</small></div></div>' + finalizeForm + '</article>';
        }).join('') + '</div>' : empty('No performance reviews have been submitted.');
    const promotionRows = promotions.length
      ? '<div class="ai-network-list">' + promotions.map(item => {
          const promotion = item.promotion || {};
          return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' +
            esc(item.identity?.display_name || 'AI employee') + '</strong><div class="ai-network-meta">' +
            pill('PROMOTED','success') + ' ' + esc(item.previous_position_name || 'Previous role') + ' → ' + esc(item.new_position_name || 'New role') +
            '</div><p>' + esc(promotion.reason || '') + '</p><small>' + date(promotion.created_at) + '</small></div></div></article>';
        }).join('') + '</div>' : empty('No employee promotions have been recorded.');
    const successorOptions = activeEmployees.map(row => ({
      value:row.employment?.employment_id || '',
      label:(row.identity?.display_name || 'AI employee') + ' · ' + (row.position_name || 'Current role')
    })).filter(option=>option.value);
    const successionForm = positions.length && successorOptions.length
      ? '<form class="ai-network-form ai-network-hr-form" data-ai-form="succession-plan" data-organization-id="' + esc(organizationId) + '">' +
        '<div class="ai-network-form-title">Create succession plan</div><div class="ai-network-form-grid">' +
        '<label>Critical role<select name="rolePositionId" required>' + options(positionOptions, positionOptions[0]?.value || '') + '</select></label>' +
        '<label>Current incumbent (optional)<select name="incumbentEmploymentId">' + options([{value:'',label:'Vacant / no incumbent'}].concat(successorOptions),'') + '</select></label>' +
        '<label>Proposed successor<select name="successorEmploymentId" required>' + options(successorOptions, successorOptions[0]?.value || '') + '</select></label>' +
        '<label>Readiness<select name="readinessLevel">' + options([{value:'ready_now',label:'Ready now'},{value:'within_6_months',label:'Within 6 months'},{value:'within_1_year',label:'Within 1 year'},{value:'development_required',label:'Development required'}],'development_required') + '</select></label>' +
        '<label>Next review date<input type="date" name="reviewDueOn"></label></div>' +
        '<label>Succession rationale<textarea name="rationale" required minlength="10" maxlength="2000" rows="2"></textarea></label>' +
        '<label>Development actions (one per line)<textarea name="developmentActions" maxlength="4000" rows="2"></textarea></label>' +
        '<button class="primary" type="submit">Save draft succession plan</button></form>'
      : '<p class="ai-network-note">An active employee and a role position are required before a succession plan can be created.</p>';
    const successionRows = successionPlans.length
      ? '<div class="ai-network-list">' + successionPlans.map(item => {
          const plan = item.plan || {};
          const statusChoices = plan.plan_status === 'draft'
            ? [{value:'active',label:'Activate'},{value:'cancelled',label:'Cancel'}]
            : plan.plan_status === 'active' ? [{value:'completed',label:'Complete'},{value:'cancelled',label:'Cancel'}] : [];
          return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' +
            esc(item.role_name || 'Key role') + '</strong><div class="ai-network-meta">' +
            pill(plan.plan_status || 'draft') + ' ' + pill(plan.readiness_level || 'readiness unspecified') +
            '</div><p>Successor: ' + esc(item.successor_name || 'Not available') + '</p><small>Incumbent: ' +
            esc(item.incumbent_name || 'Vacant / not assigned') + ' · ' + esc(plan.rationale || '') + '</small></div></div>' +
            (statusChoices.length ? '<form class="ai-network-inline-form" data-ai-form="succession-status" data-organization-id="' + esc(organizationId) + '" data-plan-id="' + esc(plan.plan_id) + '">' +
              '<label><span>Plan status</span><select name="status">' + options(statusChoices,statusChoices[0].value) + '</select></label>' +
              '<label><span>Reason</span><input name="reason" required minlength="3" maxlength="1000"></label>' +
              '<button class="secondary" type="submit">Update plan</button></form>' : '') + '</article>';
        }).join('') + '</div>' : empty('No succession plans have been created.');
    const employeeOptions = employees
      .filter(row => ['onboarding','active','restricted'].includes(row.employment?.employment_status))
      .map(row => ({ value:row.employment?.employment_id || '', label:(row.identity?.display_name || 'AI employee') + ' · ' + (row.position_name || '') }))
      .filter(option => option.value);
    const publishedCourses = trainingCourses.map(row => row.course || {}).filter(course => course.course_status === 'published')
      .map(course => ({value:course.course_id,label:course.course_title}));
    const courseForm = '<form class="ai-network-form ai-network-hr-form" data-ai-form="training-course" data-organization-id="' + esc(organizationId) + '">' +
      '<div class="ai-network-form-title">Create training course</div><div class="ai-network-form-grid">' +
      '<label>Course key<input name="courseKey" required minlength="3" maxlength="80" pattern="[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]"></label>' +
      '<label>Course title<input name="courseTitle" required minlength="3" maxlength="160"></label>' +
      '<label class="ai-network-checkbox-label"><input type="checkbox" name="requiredTraining"> Required training</label></div>' +
      '<label>Description<textarea name="description" maxlength="4000" rows="2"></textarea></label>' +
      '<label>Learning objectives (one per line)<textarea name="learningObjectives" maxlength="4000" rows="3"></textarea></label>' +
      '<button class="primary" type="submit">Save course draft</button></form>';
    const courseRows = trainingCourses.length ? '<div class="ai-network-list">' + trainingCourses.map(row => {
      const course=row.course || {};
      const choices=course.course_status==='draft' ? [{value:'published',label:'Publish'},{value:'archived',label:'Archive'}]
        : course.course_status==='published' ? [{value:'archived',label:'Archive'}] : [];
      return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(course.course_title || 'Training course') +
        '</strong><div class="ai-network-meta">' + pill(course.course_status || 'draft') + ' ' + pill(course.required_training ? 'Required' : 'Optional') +
        '</div><p>' + esc(course.description || '') + '</p><small>' + number(row.enrollment_count) + ' assigned · ' + number(row.completed_count) +
        ' completed · ' + list(course.learning_objectives).map(esc).join(' · ') + '</small></div></div>' +
        (choices.length ? '<form class="ai-network-inline-form" data-ai-form="training-course-status" data-organization-id="' + esc(organizationId) +
          '" data-course-id="' + esc(course.course_id) + '"><label><span>Course status</span><select name="status">' +
          options(choices,choices[0].value) + '</select></label><label><span>Reason (required when archiving)</span><input name="reason" maxlength="1000"></label>' +
          '<button class="secondary" type="submit">Update course</button></form>' : '') + '</article>';
    }).join('') + '</div>' : empty('No training courses have been created.');
    const assignmentForm = publishedCourses.length && employeeOptions.length
      ? '<form class="ai-network-form ai-network-hr-form" data-ai-form="training-enrollment" data-organization-id="' + esc(organizationId) + '">' +
        '<div class="ai-network-form-title">Assign published training</div><div class="ai-network-form-grid">' +
        '<label>Course<select name="courseId" required>' + options(publishedCourses,publishedCourses[0].value) + '</select></label>' +
        '<label>Employee<select name="employmentId" required>' + options(employeeOptions,employeeOptions[0].value) + '</select></label>' +
        '<label>Due date<input type="date" name="dueOn"></label></div><button class="primary" type="submit">Assign training</button></form>'
      : '<p class="ai-network-note">Publish a course and appoint an employee before assigning training.</p>';
    const enrollmentRows = trainingEnrollments.length ? '<div class="ai-network-list">' + trainingEnrollments.map(row => {
      const item=row.enrollment || {}, status=item.enrollment_status || 'assigned';
      const choices=status==='assigned' ? [{value:'in_progress',label:'Start'},{value:'completed',label:'Complete'},{value:'waived',label:'Waive'},{value:'cancelled',label:'Cancel'}]
        : status==='in_progress' ? [{value:'completed',label:'Complete'},{value:'waived',label:'Waive'},{value:'cancelled',label:'Cancel'}] : [];
      return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(row.identity?.display_name || 'AI employee') +
        '</strong><div class="ai-network-meta">' + pill(status) + ' ' + esc(row.course_title || 'Course') + '</div><small>' +
        (item.due_on ? 'Due ' + esc(item.due_on) : 'No due date') +
        (item.score !== null && item.score !== undefined ? ' · Score ' + esc(item.score) + '/100' : '') + '</small></div></div>' +
        (choices.length ? '<form class="ai-network-inline-form" data-ai-form="training-enrollment-status" data-organization-id="' + esc(organizationId) +
          '" data-enrollment-id="' + esc(item.enrollment_id) + '"><label><span>Status</span><select name="status">' + options(choices,choices[0].value) +
          '</select></label><label><span>Score (completion only)</span><input name="score" type="number" min="0" max="100" step="0.01"></label>' +
          '<label><span>Completion note</span><input name="completionNote" maxlength="2000"></label>' +
          '<label><span>Reason (waive/cancel)</span><input name="reason" maxlength="1000"></label>' +
          '<button class="secondary" type="submit">Update training</button></form>' : '') + '</article>';
    }).join('') + '</div>' : empty('No employee training assignments have been made.');
    const attendanceForm = employeeOptions.length
      ? '<form class="ai-network-form ai-network-hr-form" data-ai-form="attendance" data-organization-id="' + esc(organizationId) + '">' +
        '<div class="ai-network-form-title">Record daily attendance</div><div class="ai-network-form-grid">' +
        '<label>Employee<select name="employmentId" required>' + options(employeeOptions,employeeOptions[0].value) + '</select></label>' +
        '<label>Date<input type="date" name="attendanceDate" required></label>' +
        '<label>Status<select name="attendanceStatus">' + options([{value:'present',label:'Present'},{value:'late',label:'Late'},{value:'absent',label:'Absent'},{value:'excused',label:'Excused'},{value:'on_leave',label:'On leave'}],'present') + '</select></label>' +
        '<label>Check-in<input type="datetime-local" name="checkInAt"></label><label>Check-out<input type="datetime-local" name="checkOutAt"></label></div>' +
        '<label>Reason / correction reason<textarea name="reason" maxlength="2000" rows="2"></textarea></label>' +
        '<button class="primary" type="submit">Save attendance record</button></form>'
      : '<p class="ai-network-note">An onboarding, active or restricted employee is required before attendance can be recorded.</p>';
    const attendanceRows = attendanceRecords.length ? '<div class="ai-network-list">' + attendanceRecords.map(row => {
      const item=row.attendance || {};
      const localDateTime = value => {
        if (!value) return '';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        const pad = part => String(part).padStart(2,'0');
        return parsed.getFullYear()+'-'+pad(parsed.getMonth()+1)+'-'+pad(parsed.getDate())+'T'+pad(parsed.getHours())+':'+pad(parsed.getMinutes());
      };
      return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(row.identity?.display_name || 'AI employee') +
        '</strong><div class="ai-network-meta">' + pill(item.attendance_status || 'not recorded') + ' ' + esc(item.attendance_date || '') +
        '</div><small>' + (item.check_in_at ? 'Check-in ' + date(item.check_in_at) : '') +
        (item.check_out_at ? ' · Check-out ' + date(item.check_out_at) : '') + (item.reason ? ' · ' + esc(item.reason) : '') +
        '</small></div></div>' +
        '<details class="ai-network-inline-details"><summary>Correct attendance record</summary>' +
        '<form class="ai-network-inline-form" data-ai-form="attendance" data-organization-id="' + esc(organizationId) + '">' +
        '<label><span>Employee</span><select name="employmentId" required>' + options(employeeOptions,item.employment_id || '') + '</select></label>' +
        '<label><span>Attendance date</span><input type="date" name="attendanceDate" value="' + esc(item.attendance_date || '') + '" required></label>' +
        '<label><span>Corrected status</span><select name="attendanceStatus">' + options([{value:'present',label:'Present'},{value:'late',label:'Late'},{value:'absent',label:'Absent'},{value:'excused',label:'Excused'},{value:'on_leave',label:'On leave'}],item.attendance_status || 'present') + '</select></label>' +
        '<label><span>Check-in</span><input type="datetime-local" name="checkInAt" value="' + esc(localDateTime(item.check_in_at)) + '"></label>' +
        '<label><span>Check-out</span><input type="datetime-local" name="checkOutAt" value="' + esc(localDateTime(item.check_out_at)) + '"></label>' +
        '<label><span>Correction reason (minimum 10 characters)</span><input name="reason" required minlength="10" maxlength="2000" placeholder="Explain the correction and supporting reason"></label>' +
        '<button class="secondary" type="submit">Save correction with audit history</button></form></details></article>';
    }).join('') + '</div>' : empty('No attendance records have been entered.');
    const developmentUnavailableNote = hr.developmentUnavailable
      ? '<p class="ai-network-note">Training and attendance are waiting for the HR development migration and private runtime gateway. Existing HR records remain available.</p>' : '';
    const candidateOptions = identityOptions.length
      ? '<p class="ai-network-note">' + identityOptions.length + ' owner-managed AI identities available for recruitment.</p>'
      : '<p class="ai-network-note">No eligible owner-managed AI identities are currently listed. Register an identity first.</p>';
    const talentAvailabilityNote = hr.talentUnavailable
      ? '<p class="ai-network-note">Performance reviews, promotions and succession planning are waiting for the new HR talent migration and private runtime gateway to be deployed. Existing recruitment and employee workflows remain available.</p>'
      : '';
    return '<section class="ai-network-hr-workspace"><div class="ai-network-hr-heading"><h4>Recruitment & workforce management</h4>' +
      '<p class="ai-network-note">Vacancies begin as drafts. Candidates must be owner-managed AI identities and approved before appointment. Employee status, manager and transfer changes are recorded in persistent history.</p>' + talentAvailabilityNote + '</div>' +
      vacancyForm + '<div><h5>Vacancies</h5>' + vacancyRows + '</div>' +
      '<div><h5>Candidate applications</h5>' + candidateOptions + applicationRows + '</div>' +
      '<div><h5>AI employees</h5>' + employeeRows + '</div>' +
      '<div><h5>Performance reviews · human-authored</h5>' + performanceReviewRows + '</div>' +
      '<div><h5>Recorded promotions</h5>' + promotionRows + '</div>' +
      '<div><h5>Succession planning · no automatic appointments</h5>' + successionForm + successionRows + '</div>' +
      '<div><h5>Employee training</h5>' + developmentUnavailableNote + courseForm + courseRows + assignmentForm + enrollmentRows + '</div>' +
      '<div><h5>Daily attendance · human recorded</h5>' + attendanceForm + attendanceRows + '</div></section>';
  }

  function renderAIProviderCenter() {
    const providerCatalogue = list(state.snapshot?.providerStatus?.providerCatalogue);
    const accounts = list(state.providerAccounts);
    const models = list(state.providerModels);
    const assignments = list(state.providerAssignments);
    const identityRecords = list(state.identityRegistry?.identities);
    const identityOptions = identityRecords.map(row => ({
      value: row.identity?.identity_id || '',
      label: (row.name?.display_name || row.name?.full_name || 'AI identity') +
        (row.name?.username ? ' (@' + row.name.username + ')' : '')
    })).filter(item => item.value);
    const accountOptions = [{value:'',label:'No account reference (pending)'}].concat(accounts.map(account => ({
      value:account.provider_account_id,
      label:account.provider_name + ' · ' + account.provider_identifier + ' · ' + (account.status || 'unconfigured')
    })));
    const modelOptions = models.map(model => ({
      value:model.model_id,
      label:model.provider_name + ' · ' + model.model_name + (model.model_version ? ' · ' + model.model_version : '')
    }));
    const accountRows = accounts.length
      ? '<div class="ai-network-list">' + accounts.map(account =>
          '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' +
          esc(account.provider_name) + ' · ' + esc(account.provider_identifier) + '</strong><div class="ai-network-meta">' +
          pill(account.status || 'unconfigured') + ' ' + pill('health ' + (account.health_status || 'unknown')) +
          '</div><small>Account metadata only · credentials not stored here</small></div></div></article>'
        ).join('') + '</div>'
      : empty('No provider account references registered.');
    const modelRows = models.length
      ? '<div class="ai-network-list">' + models.map(model =>
          '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' +
          esc(model.model_name) + '</strong><div class="ai-network-meta">' +
          pill(model.provider_name) + ' ' + pill(model.model_version || 'version unspecified') +
          '</div><small>' + esc(model.model_identifier) + ' · ' +
          esc(list(model.model_capabilities).join(', ') || 'No capability metadata') + '</small><p>' +
          ['text','image','audio','video','voice','tool'].filter(capability => model[capability + '_capability']).join(' · ') +
          '</p></div></div></article>'
        ).join('') + '</div>'
      : empty('No provider model metadata is registered.');
    const assignmentRows = assignments.length
      ? '<div class="ai-network-list">' + assignments.map(row => {
          const assignment = row.assignment || {};
          const identity = row.identity || {};
          const model = row.model || {};
          const account = row.provider_account || null;
          const statusChoices = assignment.assignment_status === 'revoked'
            ? [{value:'revoked',label:'Revoked'}]
            : [{value:'pending',label:'Pending'},{value:'restricted',label:'Restricted'},{value:'disabled',label:'Disabled'},{value:'revoked',label:'Revoked'}];
          return '<article class="ai-network-list-row ai-network-provider-row"><div class="ai-network-list-main"><div><strong>' +
            esc(identity.display_name || identity.username || 'AI identity') + '</strong><div class="ai-network-meta">' +
            pill(assignment.assignment_status || 'pending') + ' ' + pill('health ' + (assignment.provider_health_status || 'unknown')) +
            '</div><small>' + esc(model.provider_name || '') + ' · ' + esc(model.model_name || '') +
            '</small><p>Priority ' + number(assignment.routing_priority) + ' · ' +
            esc(list(assignment.assigned_capabilities).join(', ') || 'Capabilities not assigned') +
            '</p><small>' + esc(account ? account.provider_identifier + ' · ' + account.status : 'No provider account reference') +
            '</small></div></div>' +
            '<form class="ai-network-inline-form" data-ai-form="provider-assignment-status" data-assignment-id="' + esc(assignment.assignment_id || '') + '">' +
            '<label><span>Assignment status</span><select name="status">' + options(statusChoices, assignment.assignment_status || 'pending') + '</select></label>' +
            '<label><span>Reason</span><input name="reason" required minlength="3" maxlength="1000" placeholder="Why is this assignment changing?"></label>' +
            '<button class="secondary" type="submit">Save status</button></form></article>';
        }).join('') + '</div>'
      : empty('No provider model assignments have been registered.');
    const providersWithCredentials = providerCatalogue.filter(provider => provider.credentialsPresent).length;
    const providerCatalogueRows = providerCatalogue.length
      ? '<details class="ai-network-provider-catalogue"><summary>Provider environment registry · ' + number(providerCatalogue.length) + ' integrations</summary>' +
        '<p class="ai-network-note">These entries identify private server environment keys. Credential values are never shown or accepted in this page. A populated key is not proof of a successful connection or a working adapter.</p>' +
        '<div class="ai-network-list">' + providerCatalogue.map(provider => {
          const required = list(provider.credentialEnvironmentVariableGroups).map(group => list(group).join(' + ')).join(' OR ') || list(provider.credentialEnvironmentVariables).join(', ');
          const optional = list(provider.optionalEnvironmentVariables).join(', ');
          const label = provider.serverSelectable === false
            ? 'Interactive only · not server-callable'
            : (provider.credentialsPresent ? 'Required values present' : 'Configuration missing');
          return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' +
            esc(provider.label || provider.providerId) + '</strong><div class="ai-network-meta">' +
            pill(provider.category || 'provider') + ' ' + pill(label, provider.credentialsPresent ? 'success' : 'neutral') +
            ' ' + pill(provider.connected ? 'Connected' : 'Not connected', 'warning') +
            '</div><small>Provider ID: ' + esc(provider.providerId) + '</small>' +
            '<p>Required environment keys (complete one set): ' + esc(required || 'No server credential slot') + '</p>' +
            (optional ? '<small>Optional settings: ' + esc(optional) + '</small>' : '') +
            '<small>Read-only health probe: ' + (provider.healthProbeAvailable ? 'Available' : 'Not implemented') +
            ' · Inference adapter: ' + (provider.adapterAvailable ? 'Available' : 'Not implemented') +
            ' · Execution enabled: ' + (provider.executionEnabled ? 'Yes' : 'No') + '</small>' +
            (provider.note && provider.providerId !== 'openai' ? '<p>' + esc(provider.note) + '</p>' : '') +
            '</div></div></article>';
        }).join('') + '</div></details>'
      : '<p class="ai-network-note">Provider environment registry is unavailable. Reload the administrator workspace.</p>';
    const providerHealth = state.providerHealth;
    const providerProbeResult = providerHealth
      ? '<div class="ai-network-alert ai-network-alert--' + (providerHealth.connected ? 'success' : 'warning') + '" role="status">' +
        '<strong>Latest OpenAI probe: ' + esc(providerHealth.status || 'unknown') + '</strong> ' +
        pill(providerHealth.connected ? 'Model access verified' : 'Not connected', providerHealth.connected ? 'success' : 'warning') +
        '<p>' + esc(providerHealth.note || 'No probe result was returned.') + '</p>' +
        '<small>Model: ' + esc(providerHealth.model || 'Not configured') +
        ' · HTTP: ' + esc(providerHealth.httpStatus || 'Not reached') +
        ' · Checked: ' + esc(date(providerHealth.checkedAt)) + '</small></div>'
      : '<p class="ai-network-note">No OpenAI health probe has been run in this session.</p>';
    const providerProbeForm = '<form class="ai-network-form" data-ai-form="provider-health-probe">' +
      '<div class="ai-network-form-title">OpenAI API connection check</div>' +
      '<p class="ai-network-note">Runs a read-only model-access check using OPENAI_API_KEY and OPENAI_DEFAULT_MODEL from the private Minglora server environment. No key is entered here, sent by the browser, or returned to the page. It does not generate content or activate AI execution.</p>' +
      '<button class="secondary" type="submit">Check OpenAI API connection</button></form>';
    const warning = state.providerError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.providerError) + '</div>'
      : '<p class="ai-network-note">Provider account records begin unconfigured. Model assignments begin pending with health unknown. Nothing here verifies access to the provider or activates model execution.</p>';
    const accountForm = '<form class="ai-network-form" data-ai-form="provider-account">' +
      '<div class="ai-network-form-title">Register a provider account reference</div>' +
      '<div class="ai-network-form-grid"><label>Provider identifier<input name="providerName" required minlength="2" maxlength="80" pattern="[a-z0-9][a-z0-9._-]+" placeholder="openai"></label>' +
      '<label>Account reference<input name="providerIdentifier" required minlength="1" maxlength="160" placeholder="platform-account-a"></label>' +
      '<label>Account ownership<select name="accountType">' + options([{value:'user',label:'User managed'},{value:'managed',label:'Managed account'}], 'user') + '</select></label></div>' +
      '<button class="secondary" type="submit">Save unconfigured account reference</button></form>';
    const modelForm = '<form class="ai-network-form" data-ai-form="provider-model">' +
      '<div class="ai-network-form-title">Register model catalogue metadata</div>' +
      '<div class="ai-network-form-grid"><label>Provider name<input name="providerName" required minlength="2" maxlength="80" pattern="[a-z0-9][a-z0-9._-]+" placeholder="openai"></label>' +
      '<label>Model display name<input name="modelName" required minlength="2" maxlength="160" placeholder="Model display name"></label>' +
      '<label>Model identifier<input name="modelIdentifier" required maxlength="180" placeholder="provider-model-id"></label>' +
      '<label>Model version<input name="modelVersion" maxlength="80" placeholder="Optional version"></label></div>' +
      '<label>Declared capabilities (comma separated)<input name="modelCapabilities" maxlength="1200" placeholder="text, reasoning, tools"></label>' +
      '<label>Declared language tags (comma separated)<input name="supportedLanguages" maxlength="1200" placeholder="en, en-JM, es"></label>' +
      '<fieldset><legend>Declared model modalities</legend><div class="ai-network-checkbox-grid">' +
      ['text','image','audio','video','voice','tool'].map(type => '<label><input type="checkbox" name="' + type + 'Capability"> ' + type.toUpperCase() + '</label>').join('') +
      '</div></fieldset><button class="secondary" type="submit">Save model catalogue record</button></form>';
    const assignmentForm = identityOptions.length && modelOptions.length
      ? '<form class="ai-network-form" data-ai-form="provider-assignment">' +
        '<div class="ai-network-form-title">Assign a model to an AI identity</div>' +
        '<div class="ai-network-form-grid"><label>AI identity<select name="identityId" required>' + options(identityOptions, identityOptions[0].value) + '</select></label>' +
        '<label>Primary model<select name="modelId" required>' + options(modelOptions, modelOptions[0].value) + '</select></label>' +
        '<label>Provider account reference<select name="providerAccountId">' + options(accountOptions, '') + '</select></label>' +
        '<label>Fallback model (optional)<select name="fallbackModelId">' + options([{value:'',label:'No fallback configured'}].concat(modelOptions), '') + '</select></label>' +
        '<label>Routing priority<input type="number" name="routingPriority" min="1" max="10000" value="100" required></label></div>' +
        '<label>Assigned capabilities (comma separated)<input name="assignedCapabilities" maxlength="1200" placeholder="Must exist in the selected model metadata"></label>' +
        '<label>Supported language tags (comma separated)<input name="assignmentLanguages" maxlength="1200" placeholder="Optional language restrictions"></label>' +
        '<button class="primary" type="submit">Save pending model assignment</button></form>'
      : '<p class="ai-network-note">Register or load at least one AI identity and one provider model before assigning a model.</p>';
    const bulkAssignmentForm = '<form class="ai-network-form" data-ai-form="provider-assignment-bulk">' +
      '<div class="ai-network-form-title">Bulk assign provider models (1–100 per batch)</div>' +
      '<p class="ai-network-note">Paste assignment records with identity_id, model_id and optional provider_account_id, fallback_model_id, routing_priority, assigned_capabilities and supported_languages. Every assignment remains pending with unknown health; this does not activate provider execution. Raw credentials and secrets are rejected.</p>' +
      '<label>Provider assignment batch JSON<textarea name="items" required rows="8" maxlength="160000" spellcheck="false" placeholder=\'[{"identity_id":"existing-ai-identity-uuid","model_id":"catalogue-model-uuid","provider_account_id":null,"fallback_model_id":null,"routing_priority":100,"assigned_capabilities":["text"],"supported_languages":["en"]}]\'></textarea></label>' +
      '<button class="secondary" type="submit">Save pending provider assignments</button></form>';
    return card('Provider & Model Assignment Center', '02 · PROVIDERS', warning + providerProbeForm + providerProbeResult + providerCatalogueRows +
      '<div class="ai-network-command-grid"><div><span>Catalogued providers</span><strong>' + number(providerCatalogue.length) + '</strong></div>' +
      '<div><span>Credentials present</span><strong>' + number(providersWithCredentials) + '</strong></div>' +
      '<div><span>Connected</span><strong>' + number(providerCatalogue.filter(provider => provider.connected).length) + '</strong></div>' +
      '<div><span>Account references</span><strong>' + number(accounts.length) + '</strong></div>' +
      '<div><span>Catalogue models</span><strong>' + number(models.length) + '</strong></div>' +
      '<div><span>Identity assignments</span><strong>' + number(assignments.length) + '</strong></div></div>' +
      '<div class="ai-network-provider-columns"><div><h4>Provider accounts</h4>' + accountRows + accountForm + '</div>' +
      '<div><h4>Model catalogue</h4>' + modelRows + modelForm + '</div></div>' +
      assignmentForm + bulkAssignmentForm + '<div><h4>Identity assignments</h4>' + assignmentRows + '</div>' +
      '<p class="ai-network-note">Security boundary: no API key, password, token or secret reference is accepted or displayed. Account status remains unconfigured and assignment status remains pending until a separate approved secret-management integration and live provider health verification are completed. Model catalogue metadata is not proof of model access.</p>',
      'ai-network-span-2');
  }

  function renderAITaskQueueCenter() {
    const tasks = list(state.aiTasks);
    const identities = list(state.identityRegistry?.identities).filter(row =>
      row.identity?.status === 'active' && row.identity?.enabled === true
    );
    const identityOptions = identities.map(row => ({
      value:row.identity.identity_id,
      label:(row.name?.display_name || row.name?.full_name || 'AI identity') +
        (row.name?.username ? ' (@' + row.name.username + ')' : '')
    })).filter(option => option.value);
    const runtime = state.taskRuntime || {};
    const runtimeLabel = state.taskError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.taskError) + '</div>'
      : '<div class="ai-network-task-runtime"><div><span>Global pause</span>' + pill(runtime.global_paused === true ? 'PAUSED' : 'NOT PAUSED', runtime.global_paused === true ? 'warning' : 'success') + '</div>' +
        '<div><span>Execution enabled</span>' + pill(runtime.execution_enabled === true ? 'ENABLED' : 'DISABLED', runtime.execution_enabled === true ? 'warning' : 'success') + '</div>' +
        '<div><span>Worker limit</span><strong>' + number(runtime.max_concurrent_workers) + '</strong></div>' +
        '<div><span>Lease length</span><strong>' + number(runtime.lease_seconds) + ' sec</strong></div></div>';
    const taskRows = tasks.length
      ? '<div class="ai-network-list">' + tasks.map(task => {
          const status = task.status || 'unknown';
          const awaitingApproval = status === 'pending_approval';
          const canCancel = ['pending_approval','queued','observation_only'].includes(status);
          const identity = identityOptions.find(item => item.value === task.identity_id);
          const action = task.action_class || 'other';
          return '<article class="ai-network-list-row ai-network-task-row"><div class="ai-network-list-main"><div><strong>' +
            esc(task.task_title || 'AI task') + '</strong><div class="ai-network-meta">' +
            pill(status, awaitingApproval ? 'warning' : status === 'succeeded' ? 'success' : 'neutral') + ' ' +
            pill(action) + ' ' + pill(task.autonomy_mode || 'unknown') +
            '</div><small>' + esc(identity?.label || ('AI identity ' + String(task.identity_id || '').slice(0,8))) +
            ' · ' + esc(task.task_type || '') + '</small><p>Scheduled ' + esc(date(task.scheduled_for)) +
            ' · Priority ' + number(task.priority) + ' · Attempts ' + number(task.attempt_count) + '/' + number(task.max_attempts) +
            '</p>' + (task.requires_approval ? '<small>Human approval required · ' + esc(task.approved_at ? 'Approved ' + date(task.approved_at) : 'Approval pending') + '</small>' : '<small>No approval required under the recorded supervision policy</small>') +
            (task.failure_reason ? '<p class="ai-network-note">' + esc(task.failure_reason) + '</p>' : '') +
            '</div></div>' +
            (awaitingApproval ? '<form class="ai-network-inline-form ai-network-task-action" data-ai-form="task-approval" data-task-id="' + esc(task.task_id) + '">' +
              '<label><span>Decision</span><select name="status">' + options([{value:'approved',label:'Approve'},{value:'rejected',label:'Reject'}], 'approved') + '</select></label>' +
              '<label><span>Review reason</span><input name="reason" required minlength="3" maxlength="1000" placeholder="Explain the decision"></label>' +
              '<button class="secondary" type="submit">Save decision</button></form>' : '') +
            (canCancel ? '<form class="ai-network-inline-form ai-network-task-action" data-ai-form="task-cancel" data-task-id="' + esc(task.task_id) + '">' +
              '<label><span>Cancellation reason</span><input name="reason" required minlength="3" maxlength="1000" placeholder="Why cancel this task?"></label>' +
              '<button class="secondary" type="submit">Cancel task</button></form>' : '') +
            '</article>';
        }).join('') + '</div>'
      : empty('No AI tasks are recorded for this account.');
    const createForm = identityOptions.length
      ? '<form class="ai-network-form ai-network-task-form" data-ai-form="task-create">' +
        '<div class="ai-network-form-title">Add a durable AI task</div>' +
        '<p class="ai-network-note">Supervision and approval requirements are derived from the selected AI identity in the database. This form cannot grant autonomy or start a worker.</p>' +
        '<div class="ai-network-form-grid"><label>AI identity<select name="identityId" required>' + options(identityOptions, identityOptions[0].value) + '</select></label>' +
        '<label>Task title<input name="taskTitle" required minlength="3" maxlength="180" placeholder="Review creator support enquiries"></label>' +
        '<label>Task type<input name="taskType" required minlength="2" maxlength="80" pattern="[a-z][a-z0-9_.-]{1,79}" placeholder="support.review"></label>' +
        '<label>Action class<select name="actionClass">' + options([
          {value:'read_only',label:'Read only'},{value:'content',label:'Content'},{value:'social',label:'Social'},
          {value:'external',label:'External action'},{value:'financial',label:'Financial'},{value:'security',label:'Security'},
          {value:'moderation',label:'Moderation'},{value:'other',label:'Other'}
        ], 'read_only') + '</select></label>' +
        '<label>Scheduled for<input type="datetime-local" name="scheduledFor" required></label>' +
        '<label>Priority (1 is highest)<input type="number" name="priority" min="1" max="10000" value="100" required></label>' +
        '<label>Maximum attempts<input type="number" name="maxAttempts" min="1" max="10" value="3" required></label>' +
        '<label>Token budget<input type="number" name="tokenBudget" min="0" max="100000000" value="0" required></label>' +
        '<label>Cost limit USD<input type="number" name="costLimitUsd" min="0" max="1000000" step="0.000001" value="0" required></label></div>' +
        '<label>Task payload (JSON object)<textarea name="taskPayload" rows="3" maxlength="65536" placeholder="{}" required>{}</textarea></label>' +
        '<button class="primary" type="submit">Save task to queue</button></form>'
      : '<p class="ai-network-note">No active, enabled AI identity is available. Create and authorize an AI identity before queuing a task.</p>';
    const pending = tasks.filter(task => task.status === 'pending_approval').length;
    const queued = tasks.filter(task => task.status === 'queued').length;
    const running = tasks.filter(task => task.status === 'running').length;
    return card('Durable Task Queue & Human Approvals', '03 · TASKS', runtimeLabel +
      '<div class="ai-network-command-grid"><div><span>Latest tasks loaded (maximum 100)</span><strong>' + number(tasks.length) + '</strong></div>' +
      '<div><span>Shown pending approval</span><strong>' + number(pending) + '</strong></div>' +
      '<div><span>Shown queued</span><strong>' + number(queued) + '</strong></div>' +
      '<div><span>Shown running leases</span><strong>' + number(running) + '</strong></div></div>' +
      createForm + '<div><h4>Task history</h4>' + taskRows + '</div>' +
      '<p class="ai-network-note">Safety state is read from the persisted runtime-control row. Worker execution stays paused and disabled by default. Tasks are stored and approvals are audited, but no task executes until a separate verified worker, provider adapter and secrets integration are deployed.</p>',
      'ai-network-span-2');
  }

  function renderAIOrganizationCenter() {
    const organizations = list(state.organizationRegistry?.organizations);
    const organizationRows = organizations.length
      ? '<div class="ai-network-list">' + organizations.map(record => {
          const organization = record.organization || {};
          const organizationId = organization.organization_id || '';
          return '<article class="ai-network-list-row ai-network-organization-row"><div class="ai-network-list-main"><div class="ai-network-avatar ai-network-avatar--team" aria-hidden="true">ORG</div><div><strong>' +
            esc(organization.organization_name || 'AI organization') + '</strong><div class="ai-network-meta">' +
            pill(organization.status || 'proposed') + ' ' + pill(organization.organization_type || 'company') +
            '</div><small>' + esc(organization.organization_slug || '') + '</small><p>' +
            number(record.department_count) + ' departments · ' + number(record.position_count) + ' positions</p></div></div>' +
            '<div class="ai-network-organization-actions">' +
            '<form class="ai-network-inline-form" data-ai-form="organization-departments" data-organization-id="' + esc(organizationId) + '">' +
            '<button class="secondary" type="submit"' + (!organizationId || !state.departmentTemplates.length ? ' disabled' : '') + '>Provision departments (' + number(state.departmentTemplates.length) + ')</button></form>' +
            '<form class="ai-network-inline-form" data-ai-form="organization-positions" data-organization-id="' + esc(organizationId) + '">' +
            '<button class="secondary" type="submit"' + (!organizationId || !state.positionTemplates.length ? ' disabled' : '') + '>Prepare positions (' + number(state.positionTemplates.length) + ')</button></form>' +
            '</div>' + renderAIHRWorkspace(organizationId, state.organizationHR[organizationId] || {}) + '</article>';
        }).join('') + '</div>'
      : empty('No AI organizations are registered for this account yet.');
    const warning = state.organizationError
      ? '<div class="ai-network-alert ai-network-alert--warning" role="status">' + esc(state.organizationError) + '</div>'
      : '<p class="ai-network-note">This center reads and writes owner-scoped organization records through the Minglora server runtime. It does not create AI employees or human login accounts automatically.</p>';
    const templates = '<div class="ai-network-command-grid"><div><span>Department templates</span><strong>' +
      number(state.departmentTemplates.length) + '</strong></div><div><span>Position templates</span><strong>' +
      number(state.positionTemplates.length) + '</strong></div></div>';
    const createForm = '<form class="ai-network-form" data-ai-form="organization">' +
      '<div class="ai-network-form-title">Create an AI organization</div>' +
      '<div class="ai-network-form-grid"><label>Organization name<input name="organizationName" required minlength="2" maxlength="160" placeholder="Minglora AI Operations"></label>' +
      '<label>Unique organization slug<input name="organizationSlug" required minlength="3" maxlength="80" pattern="[a-z0-9][a-z0-9-]{1,78}[a-z0-9]" placeholder="minglora-ai-operations"></label>' +
      '<label>Organization type<select name="organizationType">' + options([
        {value:'platform',label:'Platform'},{value:'company',label:'Company'},
        {value:'agency',label:'Agency'},{value:'community',label:'Community'},{value:'other',label:'Other'}
      ], 'company') + '</select></label></div>' +
      '<label>Description<textarea name="organizationDescription" maxlength="2000" rows="2" placeholder="Purpose, ownership and scope"></textarea></label>' +
      '<button class="primary" type="submit">Create organization record</button></form>';
    return card('Corporate Governance & Workforce', '11 · ORGANIZATIONS', '<p>Establish an owner-controlled organization, then provision its department and position structures from the verified templates.</p>' +
      warning + templates + organizationRows + createForm +
      '<p class="ai-network-note">Current scope: organization, 20 department templates and position templates. Recruitment, employee appointments, reporting-chain changes, payroll and employment lifecycle actions are not yet connected. Department and position creation does not imply that AI staff have been hired.</p>', 'ai-network-span-2');
  }

  function renderDelegationCenter(teams) {
    if (!state.delegationAccess) return state.delegationError
      ? '<p class="ai-network-note">' + esc(state.delegationError) + '</p>'
      : '';
    const grantForms = teams.filter(team => team.team_id || team.id).map(team => {
      const members = list(team.members).filter(member => member.membership_status !== 'removed');
      const lead = members.find(member => member.member_role === 'lead' && member.membership_status === 'active');
      const recipients = members.filter(member =>
        ['member','observer'].includes(member.member_role) && member.membership_status === 'active'
      );
      if (!lead || !recipients.length) return '';
      const recipientOptions = recipients.map(member => ({
        value:member.identity_id,
        label:(member.display_name || [member.first_name,member.last_name].filter(Boolean).join(' ') || 'AI team member') +
          (member.username ? ' · @' + member.username : '')
      }));
      const taskTypes = [
        {value:'content_outline',label:'Content outline'},
        {value:'caption_draft',label:'Caption draft'},
        {value:'title_ideas',label:'Title ideas'},
        {value:'translation_draft',label:'Translation draft'},
        {value:'creator_calendar',label:'Creator calendar'}
      ];
      const taskTypeChecks = taskTypes.map((item,index) =>
        '<label class="ai-network-check"><input type="checkbox" name="allowedTaskTypes" value="' + item.value + '"' +
        (index === 0 ? ' checked' : '') + '><span>' + item.label + '</span></label>'
      ).join('');
      return '<form class="ai-network-form" data-ai-form="delegation-create" data-team-id="' + esc(team.team_id || team.id) +
        '" data-grantor-id="' + esc(lead.identity_id) + '"><div class="ai-network-form-title">Create a supervised delegation grant · ' + esc(team.name) + '</div>' +
        '<p class="ai-network-note">Lead: ' + esc(lead.display_name || 'AI team lead') + '. Select one active member to receive scoped work.</p>' +
        '<label>Team member<select name="recipientIdentityId" required>' + options(recipientOptions, recipientOptions[0]?.value || '') + '</select></label>' +
        '<fieldset><legend>Allowed task types</legend><div class="ai-network-check-grid">' + taskTypeChecks + '</div></fieldset>' +
        '<fieldset><legend>Allowed task classes</legend><div class="ai-network-check-grid">' +
        '<label class="ai-network-check"><input type="checkbox" name="allowedActionClasses" value="read_only" checked><span>Read-only research</span></label>' +
        '<label class="ai-network-check"><input type="checkbox" name="allowedActionClasses" value="content" checked><span>Content drafts</span></label>' +
        '</div></fieldset>' +
        '<div class="ai-network-form-grid"><label>Maximum tokens<input name="maxTokenBudget" type="number" min="0" max="10000000" value="10000" required></label>' +
        '<label>Maximum cost (USD)<input name="maxCostLimitUsd" type="number" min="0" max="1000" step="0.01" value="1.00" required></label></div>' +
        '<label>Grant expiry<select name="expiryDays">' + options([{value:'7',label:'7 days'},{value:'14',label:'14 days'},{value:'30',label:'30 days'},{value:'60',label:'60 days'},{value:'90',label:'90 days'}],'30') + '</select></label>' +
        '<button class="primary" type="submit">Create human-reviewed grant</button></form>';
    }).join('');

    const grantRows = state.delegationGrants.length
      ? '<div class="ai-network-list">' + state.delegationGrants.map(item => {
          const grant = item.grant || {};
          const active = grant.grant_status === 'active' && Date.parse(grant.expires_at || '') > Date.now();
          const status = grant.expires_at && Date.parse(grant.expires_at) <= Date.now() ? 'expired' : grant.grant_status || 'unknown';
          const allowed = list(grant.allowed_task_types);
          const classes = list(grant.allowed_action_classes);
          const grantId = grant.delegation_grant_id || '';
          const taskForm = active
            ? '<form class="ai-network-form" data-ai-form="delegation-task" data-grant-id="' + esc(grantId) + '">' +
              '<div class="ai-network-form-title">Submit a task for owner approval</div>' +
              '<label>Task title<input name="taskTitle" required minlength="3" maxlength="180" placeholder="Prepare a content outline"></label>' +
              '<label>Task type<select name="taskType" required>' + options(allowed.map(value => ({value,label:value.replaceAll('_',' ')})), allowed[0] || '') + '</select></label>' +
              '<label>Task class<select name="actionClass" required>' + options(classes.map(value => ({value,label:value.replaceAll('_',' ')})), classes[0] || '') + '</select></label>' +
              '<label>Task brief<textarea name="brief" required minlength="3" maxlength="8000" rows="2" placeholder="Describe the requested research or draft."></textarea></label>' +
              '<div class="ai-network-form-grid"><label>Token budget<input name="tokenBudget" type="number" min="0" max="' + String(Number(grant.max_token_budget || 0)) + '" value="' + Math.min(1000,Number(grant.max_token_budget || 0)) + '" required></label>' +
              '<label>Cost limit (USD)<input name="costLimitUsd" type="number" min="0" max="' + esc(grant.max_cost_limit_usd || 0) + '" step="0.01" value="' + Math.min(0.1,Number(grant.max_cost_limit_usd || 0)) + '" required></label></div>' +
              '<button class="primary" type="submit">Submit to approval queue</button></form>'
            : '';
          return '<article class="ai-network-list-row"><div class="ai-network-list-main"><div class="ai-network-avatar ai-network-avatar--team" aria-hidden="true">GRANT</div><div><strong>' +
            esc(item.team_name || 'AI team') + ': ' + esc(item.grantor_name || 'Team lead') + ' → ' + esc(item.grantee_name || 'Team member') +
            '</strong><p>' + esc(allowed.join(', ')) + ' · ' + esc(classes.join(', ')) + '</p><small>Tokens: ' + number(grant.max_token_budget) +
            ' · USD limit: ' + esc(grant.max_cost_limit_usd || 0) + ' · Expires: ' + esc(date(grant.expires_at)) + '</small></div></div>' +
            '<div class="ai-network-row-actions">' + pill(status, active ? 'success' : 'neutral') +
            (grant.grant_status === 'active' ? '<button type="button" class="secondary" data-ai-action="delegation-status" data-id="' + esc(grantId) + '" data-status="paused">Pause</button>' : '') +
            (grant.grant_status === 'paused' && status !== 'expired' ? '<button type="button" class="secondary" data-ai-action="delegation-status" data-id="' + esc(grantId) + '" data-status="active">Reactivate</button>' : '') +
            (['active','paused'].includes(grant.grant_status) ? '<button type="button" class="secondary" data-ai-action="delegation-status" data-id="' + esc(grantId) + '" data-status="revoked">Revoke</button>' : '') +
            '</div></article>' + taskForm;
        }).join('') + '</div>'
      : empty('No AI delegation grants have been issued.');
    return card('Owner delegation controls', 'ADMIN · AI AUTHORITY', grantForms + grantRows +
      '<p class="ai-network-note">Delegated tasks are always held for human approval and are not executed. Only read-only research and content drafts are permitted. Financial, social, external, security and moderation operations are blocked.</p>',
      'ai-network-span-2');
  }

  function renderTeams(teams, bots) {
    const rows = teams.length
      ? '<div class="ai-network-list">' + teams.map(team => {
          const memberNames = list(team.members).map(member =>
            member.display_name || [member.first_name,member.last_name].filter(Boolean).join(' ') || 'AI team member'
          );
          const names = memberNames.length ? memberNames : list(team.botIds).map(id =>
            bots.find(bot => bot.id === id)?.name || 'Unavailable bot'
          );
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
      '<button class="primary" type="submit"' + (!bots.some(bot => bot.status !== 'archived') ? ' disabled' : '') + '>Create team</button></form>' +
      renderDelegationCenter(teams);
  }

  function renderSchedules(schedules, bots) {
    const rows = schedules.length
      ? '<div class="ai-network-list">' + schedules.map(schedule => {
          const bot = bots.find(item => item.id === schedule.botId);
          const scheduleId = schedule.scheduleId || schedule.schedule_id || schedule.id;
          const status = String(schedule.status || 'paused');
          const actions = ['active','paused','error'].includes(status)
            ? '<div class="ai-network-row-actions">' +
              (status === 'active'
                ? '<button type="button" class="secondary" data-ai-action="schedule-status" data-id="' + esc(scheduleId) + '" data-status="paused">Pause</button>'
                : '<button type="button" class="secondary" data-ai-action="schedule-status" data-id="' + esc(scheduleId) + '" data-status="active">Activate</button>') +
              '<button type="button" class="secondary" data-ai-action="schedule-status" data-id="' + esc(scheduleId) + '" data-status="cancelled">Cancel</button></div>'
            : '';
          return '<article class="ai-network-list-row"><div><strong>' + esc(String(schedule.taskType || 'scheduled task').replaceAll('_', ' ')) + '</strong><p>' +
            esc(bot?.name || 'Assigned bot') + ' · ' + esc(schedule.cadence) + ' · ' + esc(schedule.timezone) + '</p><small>Next planned time: ' + esc(date(schedule.runAt)) +
            (schedule.runCount ? ' · Runs: ' + number(schedule.runCount) : '') +
            (schedule.requiresHumanApproval ? ' · Requires owner approval' : '') + '</small></div>' +
            '<div class="ai-network-row-actions">' + pill(status, status === 'active' ? 'success' : 'neutral') + actions + '</div></article>';
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
      '<fieldset><legend>Weekly days (used only for weekly schedules)</legend><div class="ai-network-check-grid">' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="1" checked><span>Monday</span></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="2" checked><span>Tuesday</span></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="3" checked><span>Wednesday</span></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="4" checked><span>Thursday</span></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="5" checked><span>Friday</span></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="6"><span>Saturday</span></label>' +
      '<label class="ai-network-check"><input type="checkbox" name="scheduleWeekdays" value="0"><span>Sunday</span></label>' +
      '</div></fieldset>' +
      '<p class="ai-network-note">Schedules are saved paused. When enabled, they add draft tasks to the owner approval queue; they do not execute AI workers or publish/send content.</p>' +
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
    const canGenerate = Boolean(state.snapshot?.providerStatus?.manualDraftsAvailable);
    return '<div class="ai-network-list">' + jobs.map(job => {
      const output = job.output
        ? '<section class="ai-network-draft-output"><strong>AI-generated draft · human review required</strong><pre>' + esc(job.output) + '</pre>' +
          '<small>Model: ' + esc(job.providerModel || 'OpenAI') + ' · Tokens: ' +
          esc(job.providerUsage?.total_tokens ?? 'not reported') + ' · Moderation: ' +
          esc(job.moderation?.model || 'not recorded') + '</small></section>'
        : '';
      const error = job.providerExecution === 'failed' && job.providerError
        ? '<p class="ai-network-alert ai-network-alert--warning" role="status">' + esc(job.providerError) + '</p>'
        : '';
      const canRetry = !job.output && job.providerExecution !== 'running';
      const action = canRetry
        ? '<button type="button" class="secondary" data-ai-action="creator-generate" data-id="' + esc(job.id) + '"' +
          (canGenerate ? '' : ' disabled title="Configure OPENAI_API_KEY and OPENAI_DEFAULT_MODEL on the private server first."') + '>' +
          (job.providerExecution === 'failed' ? 'Retry AI generation' : 'Generate with OpenAI') + '</button>'
        : '';
      return '<article class="ai-network-list-row"><div><strong>' + esc(job.taskType.replaceAll('_', ' ')) + '</strong><p>' + esc(job.brief) +
        '</p><small>Created ' + esc(date(job.createdAt)) + ' · Provider execution: ' + esc(job.providerExecution || 'not started') + '</small>' +
        error + output + action + '</div>' + pill(job.status) + '</article>';
    }).join('') + '</div><p class="ai-network-note">Generated text is an unpublished AI draft. Review and edit it before any use. Minglora does not publish or schedule it automatically.</p>';
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

  function renderSettings(settings) {
    return '<form class="ai-network-form" data-ai-form="settings"><div class="ai-network-form-title">My usage and companion preferences</div>' +
      '<div class="ai-network-form-grid"><label>Daily token budget<input name="dailyTokenBudget" type="number" min="500" max="500000" step="100" value="' + esc(settings.dailyTokenBudget) + '" required></label>' +
      '<label>Monthly spend limit (USD)<input name="monthlySpendLimitUsd" type="number" min="0.5" max="500" step="0.5" value="' + esc(settings.monthlySpendLimitUsd) + '" required></label></div>' +
      '<label class="ai-network-switch"><input type="checkbox" name="companionOptIn" ' + (settings.companionOptIn ? 'checked' : '') + '><span>Opt in to an AI companion (off by default)</span></label>' +
      '<label class="ai-network-switch"><input type="checkbox" name="companionAcknowledgedAIIdentity"' + (settings.companionOptIn ? ' checked' : '') + '><span>I understand this companion is AI, not a human</span></label>' +
      '<button class="primary" type="submit">Save my preferences</button></form>' +
      '<p class="ai-network-note">These settings apply to your own Minglora AI experience. Platform-wide execution controls are available only in the administrative workspace.</p>';
  }

  function renderAdminGlobalControls(settings, provider) {
    return '<div class="ai-network-command-grid"><div><span>Provider</span><strong>' + esc(provider.provider || 'Not configured') + '</strong></div>' +
      '<div><span>Model</span><strong>' + esc(provider.model || '—') + '</strong></div>' +
      '<div><span>Global state</span><strong>' + esc(settings.globalPaused ? 'Paused' : 'Enabled') + '</strong></div>' +
      '<div><span>Autonomous workers</span><strong>Disabled · separate runtime required</strong></div></div>' +
      '<div class="ai-network-provider"><div><strong>Provider readiness</strong>' +
      (provider.manualDraftsAvailable ? '' : (provider.note ? '<p>' + esc(provider.note) + '</p>' : '')) + '</div>' +
      pill(provider.manualDraftsAvailable ? 'Owner-initiated adapter configured' : 'Provider not ready', provider.manualDraftsAvailable ? 'success' : 'neutral') + '</div>' +
      '<div class="ai-network-safety-actions"><button type="button" class="danger" data-ai-action="emergency-pause">Emergency pause bot and schedule controls</button>' +
      '<button type="button" class="secondary" data-ai-action="emergency-resume">Resume owner controls</button></div>' +
      '<p class="ai-network-note">Resume performs a fresh OpenAI model-access check before reopening owner-controlled actions. Bots remain paused until enabled individually. Durable queue workers and autonomous schedules remain disabled; human approval and AI identity disclosure are mandatory.</p>';
  }

  function renderAICentreReadiness(snapshot) {
    const provider = snapshot.providerStatus || {};
    const catalogue = list(provider.providerCatalogue);
    const openAI = catalogue.find(item => item.providerId === 'openai') || {};
    const categories = list(state.identityCategories);
    const departments = list(state.departmentTemplates);
    const positions = list(state.positionTemplates);
    const identities = list(state.identityRegistry?.identities);
    const identityReady = categories.some(item => item.is_active !== false);
    const organizationReady = departments.length > 0 && positions.length > 0;
    const adapterReady = openAI.adapterAvailable === true && openAI.healthProbeAvailable === true;
    const inferenceReady = provider.botChatAvailable === true && provider.manualDraftsAvailable === true;
    const globalPaused = snapshot.safeguards?.globalPaused !== false;
    const rows = [
      {
        title: 'AI identity and profile setup',
        state: identityReady ? 'Available now' : 'Waiting for category data',
        kind: identityReady ? 'success' : 'warning',
        detail: identityReady
          ? categories.length + ' category records are loaded. You can create and manage real identities and profiles without configuring a model provider.'
          : 'The category catalogue must load before a new Bot Lab identity can be created.'
      },
      {
        title: 'Corporate and department setup',
        state: organizationReady ? 'Available now' : 'Templates need attention',
        kind: organizationReady ? 'success' : 'warning',
        detail: organizationReady
          ? departments.length + ' department templates and ' + positions.length + ' position templates are loaded. Continue configuring the existing organization.'
          : 'Load the department and position templates before provisioning workforce structure.'
      },
      {
        title: 'Human-initiated AI responses',
        state: inferenceReady ? 'Provider ready' : (adapterReady ? 'Private provider setup required' : 'Provider adapter needs review'),
        kind: inferenceReady ? 'success' : 'warning',
        detail: inferenceReady
          ? 'OpenAI credentials and model are configured. The chat and draft routes still perform a fresh provider check and moderation.'
          : adapterReady
            ? 'The moderated OpenAI bot-chat and Creator Studio adapters are already in the deployed code. Add OPENAI_API_KEY and OPENAI_DEFAULT_MODEL to the private Render environment, then run the read-only connection probe. No provider account row or browser key entry is required for this first human-initiated path.'
            : 'The first supported live path is OpenAI. Its adapter and read-only health probe must be present before provider setup can be accepted.'
      },
      {
        title: 'Autonomous workers and schedules',
        state: 'Safely paused',
        kind: 'warning',
        detail: 'Global pause: ' + (globalPaused ? 'ON' : 'OFF') + '. Autonomous execution remains disabled until independent worker authentication, task claims, heartbeat, completion, failure recovery and operational checks are accepted. This does not block identity, profile or organization setup.'
      },
      {
        title: 'Private AI profile images',
        state: 'Owner upload acceptance pending',
        kind: 'neutral',
        detail: 'The dedicated private bucket is provisioned on the first real owner-authorized avatar or cover upload. Missing media storage does not block identity creation or text profiles.'
      },
      {
        title: '10-billion identity target',
        state: 'Architecture target, not benchmarked',
        kind: 'neutral',
        detail: 'Partitioning, distributed regions, backup recovery and representative capacity tests are future scale gates. The existing Supabase project remains the current control plane.'
      }
    ];
    const rowHtml = rows.map(row =>
      '<article class="ai-network-list-row"><div class="ai-network-list-main"><div><strong>' + esc(row.title) +
      '</strong><div class="ai-network-meta">' + pill(row.state, row.kind) + '</div><p>' + esc(row.detail) +
      '</p></div></div></article>'
    ).join('');
    return card('AI Centre Readiness', '00 · LIVE SETUP CHECKLIST',
      '<p class="ai-network-note">This checklist separates work that can continue now from features that genuinely need provider access, owner acceptance or separate worker infrastructure. It uses live workspace data and never treats a placeholder or a draft as an active AI.</p>' +
      '<div class="ai-network-command-grid"><div><span>AI identities loaded</span><strong>' + number(identities.length) +
      '</strong></div><div><span>Active categories</span><strong>' + number(categories.filter(item => item.is_active !== false).length) +
      '</strong></div><div><span>Provider adapters in catalogue</span><strong>' + (adapterReady ? 'OpenAI ready in code' : 'Review required') +
      '</strong></div><div><span>Bot chat / draft inference</span><strong>' + (inferenceReady ? 'Provider configured' : 'Awaiting private key + model') +
      '</strong></div></div>' + rowHtml +
      '<p class="ai-network-note">Continue identity registration, profile editing, categories, organization setup, HR records and governance now. Provider credentials are needed only for actual model responses; autonomous execution and scale expansion have separate acceptance gates.</p>' +
      (!inferenceReady && adapterReady ? '<p class="ai-network-note"><a href="https://dashboard.render.com/web/srv-dbphq63rjlhs73fviegg" target="_blank" rel="noopener noreferrer">Open the existing Minglora Render service to configure OPENAI_API_KEY and OPENAI_DEFAULT_MODEL</a>. Save the values in the private Environment settings, redeploy, then return here and run Check OpenAI API connection.</p>' : ''),
      'ai-network-span-2');
  }


  async function loadAISocialAdmin() {
    const [settings, history, profiles, consent] = await Promise.all([
      request('/social/settings'),
      request('/social/history'),
      request('/social/profiles'),
      request('/social/consent')
    ]);
    state.socialSettings = settings || null;
    state.socialHistory = list(history?.activity);
    state.socialProfiles = list(profiles?.profiles);
    state.socialConsent = consent?.allow_ai_messages === true;
    state.socialError = '';
  }

  function renderAISocialCenter() {
    const settings = state.socialSettings || {};
    const identities = list(settings.identities);
    const history = list(state.socialHistory).slice(0, 20);
    const profiles = list(state.socialProfiles);
    const controls = settings.controls || {};
    const identityOptions = identities.map(item => ({
      value:item.identity_id,
      label:(item.display_name || item.username || 'AI member') + ' · ' + (item.username || '')
    }));
    const publicOptions = profiles.map(item => ({
      value:item.aiIdentityId,
      label:(item.displayName || item.name || 'AI member') + ' · @' + (item.username || '')
    }));
    const historyMarkup = history.length
      ? '<div class="ai-network-list">' + history.map(item =>
          '<article class="ai-network-list-row"><div><strong>' + esc(item.action || 'Social activity') + '</strong>' +
          '<div class="ai-network-meta">' + pill(item.actor_type === 'ai' ? 'AI' : item.actor_type || 'admin', item.actor_type === 'ai' ? 'ai' : 'neutral') +
          ' ' + pill(item.outcome || 'recorded', item.outcome === 'completed' ? 'success' : 'neutral') + '</div>' +
          '<small>' + esc(date(item.created_at)) + ' · ' + esc(item.target_type || '') + ' ' + esc(item.target_id || '') + '</small></div></article>'
        ).join('') + '</div>'
      : empty('No AI social interactions have been recorded yet.');
    const permissionRows = identities.length ? identities.map(identity => {
      const permission = identity.permissions || {};
      const visibility = identity.profile_visibility || 'private';
      return '<article class="ai-network-list-row ai-social-permission-row"><div class="ai-network-list-main"><div class="ai-network-avatar" aria-hidden="true">AI</div>' +
        '<div><strong>' + esc(identity.display_name || identity.username || 'AI identity') + '</strong><div class="ai-network-meta">' +
        pill('AI MEMBER', 'ai') + ' ' + pill(identity.status || 'unknown', identity.status === 'active' ? 'success' : 'neutral') +
        '</div><small>@' + esc(identity.username || '') + '</small></div></div>' +
        '<form class="ai-network-form" data-ai-form="social-permissions" data-identity-id="' + esc(identity.identity_id) + '">' +
        '<div class="ai-network-check-grid">' +
        [['can_post','Allow posts'],['can_comment','Allow comments'],['can_react','Allow reactions'],['can_message','Allow AI replies'],['can_ai_interact','Allow AI-to-AI interactions'],['is_suspended','Suspend this AI identity']].map(([key,label]) =>
          '<label class="ai-network-check"><input type="checkbox" name="' + key + '"' + (permission[key] === true || (key === 'is_suspended' && permission.is_suspended !== false) ? ' checked' : '') + '><span>' + label + '</span></label>'
        ).join('') +
        '</div><div class="ai-network-form-grid"><label>Profile visibility<select name="profile_visibility">' +
        options([{value:'public',label:'Public'},{value:'followers',label:'Followers'},{value:'private',label:'Private'},{value:'hidden',label:'Hidden'}],visibility) +
        '</select></label>' +
        '<label>Posts / hour<input type="number" name="max_posts_per_hour" min="0" max="5" value="' + esc(permission.max_posts_per_hour ?? 2) + '"></label>' +
        '<label>Comments / hour<input type="number" name="max_comments_per_hour" min="0" max="10" value="' + esc(permission.max_comments_per_hour ?? 5) + '"></label>' +
        '<label>Reactions / hour<input type="number" name="max_reactions_per_hour" min="0" max="20" value="' + esc(permission.max_reactions_per_hour ?? 10) + '"></label>' +
        '<label>Messages / hour<input type="number" name="max_messages_per_hour" min="0" max="5" value="' + esc(permission.max_messages_per_hour ?? 2) + '"></label>' +
        '<label>AI interactions / hour<input type="number" name="max_ai_interactions_per_hour" min="0" max="10" value="' + esc(permission.max_ai_interactions_per_hour ?? 3) + '"></label></div>' +
        '<p class="ai-network-note">Human approval stays mandatory. The database clamps hourly limits; global pause and identity suspension override every grant.</p>' +
        '<button class="primary" type="submit">Save social permissions</button></form></article>';
    }).join('') : empty('Create a relational AI identity before granting social permissions.');
    const pauseButton = '<button type="button" class="' + (controls.global_paused ? 'primary' : 'danger') + '" data-ai-action="social-global-pause" data-paused="' + (!controls.global_paused) + '">' +
      (controls.global_paused ? 'Resume AI social activity' : 'Pause all AI social activity') + '</button>';
    const profileList = profiles.length
      ? '<div class="ai-network-list">' + profiles.map(item =>
          '<article class="ai-network-list-row"><div><strong>' + esc(item.displayName || item.name) + '</strong><div class="ai-network-meta">' +
          pill('AI MEMBER', 'ai') + ' <span>@' + esc(item.username || '') + '</span></div><small>' + esc(item.bio || item.introduction || 'Public AI member profile') + '</small></div></article>'
        ).join('') + '</div>'
      : empty('No AI profiles are currently public. New AI profiles start private.');
    const createPost = identityOptions.length
      ? '<form class="ai-network-form" data-ai-form="ai-social-post"><h3>Publish an AI-labelled post</h3>' +
        '<label>AI identity<select name="identityId" required>' + options(identityOptions,'') + '</select></label>' +
        '<label>Post text<textarea name="text" required minlength="1" maxlength="5000" rows="3"></textarea></label>' +
        '<label>Audience<select name="audience">' + options([{value:'public',label:'Public'},{value:'followers',label:'Followers'},{value:'friends',label:'Friends'},{value:'private',label:'Private'}],'public') + '</select></label>' +
        '<button class="primary" type="submit">Publish AI post</button></form>' : '';
    const commentForm = identityOptions.length
      ? '<form class="ai-network-form" data-ai-form="ai-social-comment"><h3>Comment as an AI member</h3>' +
        '<label>AI identity<select name="identityId" required>' + options(identityOptions,'') + '</select></label>' +
        '<label>Existing post ID<input name="postId" required maxlength="80" placeholder="Post ID"></label>' +
        '<label>Comment<textarea name="text" required maxlength="2000" rows="2"></textarea></label>' +
        '<button class="secondary" type="submit">Publish AI comment</button></form>' : '';
    const reactionForm = identityOptions.length
      ? '<form class="ai-network-form" data-ai-form="ai-social-reaction"><h3>React as an AI member</h3>' +
        '<label>AI identity<select name="identityId" required>' + options(identityOptions,'') + '</select></label>' +
        '<label>Existing post ID<input name="postId" required maxlength="80"></label>' +
        '<label>Reaction<select name="reaction">' + options([{value:'like',label:'Like'},{value:'love',label:'Love'},{value:'care',label:'Care'},{value:'haha',label:'Haha'},{value:'wow',label:'Wow'},{value:'sad',label:'Sad'},{value:'angry',label:'Angry'}],'like') + '</select></label>' +
        '<button class="secondary" type="submit">React to post</button></form>' : '';
    const messageForm = identityOptions.length
      ? '<form class="ai-network-form" data-ai-form="ai-social-message"><h3>Reply to a member in Messenger</h3>' +
        '<label>AI identity<select name="identityId" required>' + options(identityOptions,'') + '</select></label>' +
        '<label>Member user ID<input name="recipientUserId" required maxlength="80" placeholder="Minglora member ID"></label>' +
        '<label>Message<textarea name="text" required maxlength="3000" rows="2"></textarea></label>' +
        '<p class="ai-network-note">The member must have messaged this AI identity first and enabled AI messages in their privacy settings.</p>' +
        '<button class="secondary" type="submit">Send AI reply</button></form>' : '';
    const interactionForm = identityOptions.length && publicOptions.length
      ? '<form class="ai-network-form" data-ai-form="ai-social-interaction"><h3>Start a bounded AI-to-AI interaction</h3>' +
        '<label>Source AI identity<select name="identityId" required>' + options(identityOptions,'') + '</select></label>' +
        '<label>Public target AI profile<select name="targetIdentityId" required>' + options(publicOptions,'') + '</select></label>' +
        '<label>Message<textarea name="text" required maxlength="2000" rows="2"></textarea></label>' +
        '<p class="ai-network-note">Each interaction is explicitly initiated, records one chain event, and cannot trigger an automatic reply loop.</p>' +
        '<button class="secondary" type="submit">Start AI interaction</button></form>' : '';
    return card('AI Social Network Integration', '10 · SOCIAL', 
      '<p>AI members appear in Minglora as clearly disclosed AI identities. Social actions are owner-approved, permission-gated, rate-limited and recorded in the activity ledger.</p>' +
      '<div class="ai-network-meta">' + pill(controls.global_paused ? 'Globally paused' : 'Global activity enabled', controls.global_paused ? 'warning' : 'success') +
      ' ' + pill('Human approval required','success') + ' ' + pill('AI disclosure required','ai') + '</div>' +
      (state.socialError ? '<p class="ai-network-alert ai-network-alert--warning">' + esc(state.socialError) + '</p>' : '') +
      '<div class="ai-network-safety-actions">' + pauseButton + '<button type="button" class="secondary" data-ai-action="social-history-refresh">Refresh activity history</button></div>' +
      '<h3>AI member permissions</h3>' + permissionRows +
      '<h3>AI-generated activity</h3>' + createPost + commentForm + reactionForm + messageForm + interactionForm +
      '<h3>Member messaging consent</h3><form class="ai-network-form" data-ai-form="social-consent">' +
      '<label class="ai-network-check"><input type="checkbox" name="allow_ai_messages"' + (state.socialConsent ? ' checked' : '') + '><span>Allow AI members to send me messages after I start a conversation</span></label>' +
      '<button class="secondary" type="submit">Save my AI messaging consent</button></form>' +
      '<h3>Public AI member profiles</h3>' + profileList +
      '<h3>Recent AI social activity</h3>' + historyMarkup,
      'ai-network-span-2');
  }

  function renderSnapshot(snapshot) {
    const settings = snapshot.settings, performance = snapshot.performance, provider = snapshot.providerStatus;
    const bots = list(snapshot.bots), teams = list(snapshot.teams), schedules = list(snapshot.schedules);
    const approvals = list(snapshot.approvals), creatorJobs = list(snapshot.creatorJobs);
    const events = list(snapshot.communityEvents);
    const botCategoryOptions = list(state.identityCategories).map(category => ({ value:category.category_key, label:category.display_name }));
    const botDefaultCategory = botCategoryOptions.some(option => option.value === 'ai_support')
      ? 'ai_support' : (botCategoryOptions[0]?.value || '');
    const safeguards = snapshot.safeguards || {};
    return '<section class="ai-network-page">' +
      '<header class="ai-network-hero"><div><span class="ai-network-eyebrow">MINGLORA INTELLIGENCE</span><h1>AI Bot Network</h1>' +
      '<p>Build distinct AI assistants, coordinate approved work and manage every bot from one secure workspace.</p></div>' +
      '<div class="ai-network-hero-status">' + pill('AI identity required', 'ai') +
      (state.adminAccess ? pill(safeguards.globalPaused ? 'Network paused' : 'Network enabled', safeguards.globalPaused ? 'warning' : 'success') : '') +
      '</div></header>' +
      (state.notice ? '<div class="ai-network-alert ai-network-alert--' + esc(state.noticeType || 'success') + '" role="status">' + esc(state.notice) + '</div>' : '') +
      (state.error ? '<div class="ai-network-alert ai-network-alert--error" role="alert">' + esc(state.error) + '</div>' : '') +
      '<div class="ai-network-quick-stats"><div><span>My bots</span><strong>' + number(performance.botCount) + '</strong></div><div><span>Teams</span><strong>' + number(performance.teamCount) + '</strong></div>' +
      (state.adminAccess ? '<div><span>Pending reviews</span><strong>' + number(performance.pendingApprovals) + '</strong></div>' : '') +
      '<div><span>Recorded runs</span><strong>' + number(performance.measuredRunCount) + '</strong></div></div>' +
      (state.adminAccess ? renderAICentreReadiness(snapshot) : '') +
      '<div class="ai-network-grid">' +
      renderAIIdentityRegistry() +
      renderAISocialCenter() +
      renderAIMemoryCenter() +
      (state.adminAccess ? renderAICategoryAdmin() : '') +
      renderAIDiscoveryCenter() +
      (state.adminAccess ? renderAIProviderCenter() : '') +
      (state.adminAccess ? renderAITaskQueueCenter() : '') +
      (state.adminAccess ? renderAIOrganizationCenter() : '') +
      card('Bot Personality Laboratory', '01 · PERSONALITY', '<p>Build unique AI helpers with a clear purpose, tone, traits, expertise and permitted tasks. Every Bot Lab creation is also registered as an individually addressable, private AI identity in Minglora.</p>' +
        renderBotRows(bots) + renderAIBotChat() + '<form class="ai-network-form" data-ai-form="bot"><div class="ai-network-form-title">Create a new AI bot and identity</div>' +
        '<div class="ai-network-form-grid"><label>AI first name<input name="firstName" required maxlength="80" autocomplete="off"></label>' +
        '<label>AI last name<input name="lastName" required maxlength="80" autocomplete="off"></label>' +
        '<label>Middle name (optional)<input name="middleName" maxlength="80" autocomplete="off"></label>' +
        '<label>AI category<select name="categoryKey" required ' + (!botCategoryOptions.length ? 'disabled' : '') + '>' +
        (botCategoryOptions.length ? options(botCategoryOptions, botDefaultCategory) : '<option value="">Categories unavailable</option>') + '</select></label></div>' +
        '<label>Display name<input name="name" required minlength="2" maxlength="40" placeholder="Community Guide"></label>' +
        (!botCategoryOptions.length ? '<p class="ai-network-note">Load an available AI category before creating a Bot Lab identity.</p>' : '') +
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
        ).join('') + '</div></fieldset><p class="ai-network-note">The AI identity is created in the relational registry with separate first and last names. It starts private and the bot remains a draft requiring human review.</p>' +
        '<button class="primary" type="submit" ' + (!botCategoryOptions.length || !window.crypto?.randomUUID ? 'disabled' : '') + '>Create AI bot and relational identity</button></form>', 'ai-network-span-2') +
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
      card('My AI Safety Preferences', 'PERSONAL SETTINGS', renderSettings(settings), 'ai-network-span-2') +
      (state.adminAccess ? card('Central Bot Command Center', 'ADMIN · COMMAND CENTER',
        '<p>Platform-wide AI operations, owner approval decisions, provider readiness and global safety controls.</p>' +
        renderApprovals(approvals) + renderAdminGlobalControls(settings,provider), 'ai-network-span-2') : '') +
      '</div><footer class="ai-network-footer">Minglora AI Network · Owner-controlled · AI identities disclosed · Human approval required</footer></section>';
  }

  function paintSnapshot() {
    const host = root();
    if (host) host.innerHTML = renderSnapshot(state.snapshot);
  }

  async function requireDesignatedAdminAccess() {
    const response = await fetch('/api/admin/access', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const access = await response.json().catch(() => ({}));
    window.__mingloraAdminAccess = access;
    window.dispatchEvent(new CustomEvent('minglora:admin-access-updated', { detail: access }));
    if (!response.ok || access.canAccess !== true) {
      throw Object.assign(
        new Error('The Minglora AI Network is available only to the designated administrator with a verified MFA session.'),
        { status: response.status || 403 }
      );
    }
    state.adminAccess = true;
    return access;
  }

  async function load() {
    state.error = '';
    const host = root();
    if (!host) return;
    host.innerHTML = '<section class="ai-network-loading" role="status"><span class="ai-network-spinner" aria-hidden="true"></span><strong>Verifying administrator access…</strong></section>';
    try {
      await requireDesignatedAdminAccess();
      state.snapshot = await request();
      await loadAIIdentityRegistry();
      await loadAIEmailCenter();
      await loadAIMemory();
      await loadAIDiscovery();
      await loadAIProviderRegistry();
      await loadAITaskQueue();
      await loadAIOrganizationRegistry();
      await loadAIDelegations();
      paintSnapshot();
    } catch (error) {
      state.error = error.message;
      host.innerHTML = '<section class="ai-network-page"><div class="ai-network-alert ai-network-alert--error" role="alert">' + esc(error.message) + '</div>' +
        '<button type="button" class="primary" data-ai-action="reload">Try again</button></section>';
    }
  }

  async function refresh(message) {
    await requireDesignatedAdminAccess();
    if (message) setNotice(message);
    state.snapshot = await request();
    await loadAIIdentityRegistry();
    await loadAIEmailCenter();
    await loadAIMemory();
    await loadAIDiscovery();
    await loadAIProviderRegistry();
    await loadAITaskQueue();
    await loadAIOrganizationRegistry();
    await loadAIDelegations();
    paintSnapshot();
  }

  async function submit(form) {
    const kind = form.dataset.aiForm;
    const data = new FormData(form);
    const value = key => String(data.get(key) ?? '').trim();
    const payload = {};
    let path = '';
    let identityIdForMedia = null;
    if (kind === 'identity-search') {
      state.identityRegistrySearch = value('search').slice(0, 120);
      state.identityRegistryOffset = 0;
      await loadAIIdentityRegistry();
      setNotice(state.identityRegistrySearch ? 'AI identity registry search applied.' : 'AI identity registry search cleared.');
      paintSnapshot();
      return;
    } else if (kind === 'email-send') {
      const identityId = form.dataset.identityId || '';
      const emailId = form.dataset.emailId || '';
      if (!identityId || !emailId) throw new Error('Select an AI identity with an active mailbox before sending email.');
      const recipients = value('to').split(',').map(item => item.trim()).filter(Boolean);
      if (!recipients.length || recipients.length > 10) throw new Error('Enter between one and ten recipient email addresses.');
      if (!value('subject') || !value('text')) throw new Error('Enter an email subject and message.');
      form.dataset.requestId = form.dataset.requestId || window.crypto.randomUUID();
      path = '/identities/' + encodeURIComponent(identityId) + '/email/send';
      payload.emailId = emailId;
      payload.to = recipients;
      payload.subject = value('subject');
      payload.text = value('text');
      payload.requestId = form.dataset.requestId;
    } else if (kind === 'bot-chat') {
      const botId = form.dataset.botId || '';
      if (!botId) throw new Error('Choose a valid linked AI bot before sending a message.');
      const message = value('message');
      if (!message || message.length > 4000) throw new Error('Enter a message between 1 and 4,000 characters.');
      form.dataset.requestId = form.dataset.requestId || window.crypto.randomUUID();
      path = '/bots/' + encodeURIComponent(botId) + '/chat';
      payload.message = message;
      payload.requestId = form.dataset.requestId;
      if (form.dataset.conversationId) payload.conversationId = form.dataset.conversationId;
    } else if (kind === 'memory-settings') {
      const identityId = form.dataset.identityId || '';
      if (!identityId) throw new Error('Choose an AI identity before updating its memory settings.');
      path = '/identities/' + encodeURIComponent(identityId) + '/memory/settings';
      payload.memory_enabled = form.querySelector('[name="memoryEnabled"]').checked;
      payload.long_term_enabled = form.querySelector('[name="longTermEnabled"]').checked;
      payload.short_term_retention_days = Number(value('shortTermRetentionDays'));
      payload.long_term_retention_days = Number(value('longTermRetentionDays'));
      payload.max_entries = Number(value('maxEntries'));
    } else if (kind === 'memory-edit') {
      const identityId = form.dataset.identityId || '';
      const memoryId = form.dataset.memoryId || '';
      if (!identityId || !memoryId) throw new Error('The AI memory entry details are missing.');
      path = '/identities/' + encodeURIComponent(identityId) + '/memory/' + encodeURIComponent(memoryId);
      payload.memory_type = value('memoryType');
      payload.summary = value('summary');
      payload.content = { source:'owner_managed_entry', note:value('note') };
    } else if (kind === 'memory-entry') {
      const identityId = form.dataset.identityId || '';
      if (!identityId) throw new Error('Choose an AI identity before saving memory.');
      path = '/identities/' + encodeURIComponent(identityId) + '/memory';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.memory_type = value('memoryType');
      payload.summary = value('summary');
      payload.content = { source:'owner_managed_entry', note:value('note') };
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'bulk-follow') {
      const identityIds = data.getAll('identity_ids').map(item => String(item).trim()).filter(Boolean);
      if (identityIds.length < 1 || identityIds.length > 100) {
        throw new Error('Select between one and 100 public AI profiles for bulk following.');
      }
      const result = await request('/bulk-follow', { method:'POST', body:{ identity_ids:identityIds } });
      await loadAIDiscovery();
      setNotice(number(result.created_or_reused) + ' selected AI follow relationships created or already existed.');
      paintSnapshot();
      return;
    } else if (kind === 'discovery') {
      const many = key => data.getAll(key).map(item => String(item).trim()).filter(Boolean);
      const csv = key => value(key).split(',').map(item => item.trim()).filter(Boolean);
      state.discoveryFilters = {
        search: value('search'),
        category_keys: many('category_keys'),
        populations: many('populations'),
        genders: many('genders'),
        countries: many('countries'),
        languages: csv('languages'),
        nationalities: csv('nationalities'),
        interests: csv('interests'),
        skills: csv('skills'),
        capabilities: csv('capabilities'),
        regions: csv('regions'),
        profession: value('profession'),
        recent_days: Math.min(Math.max(Number(value('recent_days')) || 0, 0), 3650),
        sort: value('sort') === 'popular' ? 'popular' : 'newest'
      };
      await loadAIDiscovery(state.discoveryFilters);
      setNotice('AI discovery filters applied.');
      paintSnapshot();
      return;
    } else if (kind === 'saved-discovery-group') {
      const result = await request('/saved-groups', {
        method: 'POST',
        body: { group_name: value('groupName'), filters: state.discoveryFilters }
      });
      await loadAIDiscovery();
      setNotice('Discovery group saved.');
      paintSnapshot();
      return;
    } else if (kind === 'category') {
      path = '/categories/admin';
      payload.category_key = value('categoryKey').toLowerCase();
      payload.display_name = value('displayName');
      payload.description = value('description');
      payload.sort_order = Number(value('sortOrder'));
      payload.is_active = form.querySelector('[name="isActive"]').checked;
    } else if (kind === 'identity-edit') {
      const identityId = form.dataset.identityId || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) {
        throw new Error('A valid AI identity is required for profile editing.');
      }
      const rawCountryOfOrigin = value('countryOfOrigin');
      const rawCurrentCountry = value('currentCountry');
      const countryOfOrigin = countryCode(rawCountryOfOrigin);
      const currentCountry = countryCode(rawCurrentCountry);
      if (rawCountryOfOrigin && !countryOfOrigin) throw new Error('Select a valid country of origin from the country suggestions or enter its ISO two-letter code.');
      if (rawCurrentCountry && !currentCountry) throw new Error('Select a valid current country from the country suggestions or enter its ISO two-letter code.');
      const parseJson = (field, fallback, expected) => {
        let parsed;
        try { parsed = JSON.parse(value(field) || fallback); }
        catch { throw new Error(field + ' must contain valid JSON.'); }
        if (expected === 'array' && !Array.isArray(parsed)) throw new Error(field + ' must be a JSON array.');
        if (expected === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error(field + ' must be a JSON object.');
        return parsed;
      };
      const languages = parseJson('languages','[]','array');
      if (languages.length > 50) throw new Error('An AI profile may have at most 50 language entries.');
      payload.name = {
        first_name:value('firstName'), middle_name:value('middleName'),
        last_name:value('lastName'), display_name:value('displayName'),
        username:value('username').toLowerCase()
      };
      payload.profile = {
        gender:value('gender'), gender_presentation:value('genderPresentation'),
        nationality:value('nationality'), country_of_origin:countryOfOrigin,
        current_country:currentCountry, state_province:value('stateProvince'),
        parish_county:value('parishCounty'), district:value('district'),
        city:value('city'), town:value('town'), time_zone:value('timeZone') || 'UTC',
        profession:value('profession'), profile_visibility:value('profileVisibility'),
        bio:value('bio'), introduction:value('introduction'),
        interests:value('interests').split(',').map(item => item.trim()).filter(Boolean),
        hobbies:value('hobbies').split(',').map(item => item.trim()).filter(Boolean),
        skills:value('skills').split(',').map(item => item.trim()).filter(Boolean),
        qualifications:value('qualifications').split(',').map(item => item.trim()).filter(Boolean),
        education:parseJson('education','[]','array'),
        personality:parseJson('personality','{}','object'),
        voice_preferences:parseJson('voicePreferences','{}','object')
      };
      payload.languages = languages;
      payload.locations = parseJson('existingLocations','[]','array').filter(item => !['origin','current'].includes(item.location_type));
      const avatarFile = form.querySelector('[name="avatarFile"]')?.files?.[0] || null;
      const coverFile = form.querySelector('[name="coverFile"]')?.files?.[0] || null;
      if (avatarFile && avatarFile.size > 10 * 1024 * 1024) throw new Error('The AI profile picture must be 10 MB or smaller.');
      if (coverFile && coverFile.size > 20 * 1024 * 1024) throw new Error('The AI cover photo must be 20 MB or smaller.');
      if ((avatarFile || coverFile) && typeof window.uploadMediaFile !== 'function') {
        throw new Error('Minglora secure media uploads are not available in this session. No image was uploaded.');
      }
      identityIdForMedia = identityId;
      if (countryOfOrigin) payload.locations.push({
        location_type:'origin', country_code:countryOfOrigin, country_name:countryLabel(countryOfOrigin), is_public:false
      });
      if (currentCountry) payload.locations.push({
        location_type:'current', country_code:currentCountry, country_name:countryLabel(currentCountry),
        state_province:value('stateProvince'), parish_county:value('parishCounty'),
        district:value('district'), city:value('city'), town:value('town'),
        time_zone:value('timeZone') || 'UTC', is_public:false
      });
      path = '/identities/' + encodeURIComponent(identityId);
    } else if (kind === 'identity-profile-bulk') {
      path = '/identities/bulk-profile';
      let items;
      try { items = JSON.parse(value('items')); }
      catch { throw new Error('Bulk profile update input must be valid JSON.'); }
      if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
        throw new Error('A bulk profile update must contain between 1 and 100 records.');
      }
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
          !uuid.test(String(item.identity_id || '')) ||
          !item.name || typeof item.name !== 'object' || Array.isArray(item.name) ||
          !item.profile || typeof item.profile !== 'object' || Array.isArray(item.profile) ||
          !Array.isArray(item.languages) || !Array.isArray(item.locations) ||
          item.languages.length > 50 || item.locations.length > 10)) {
        throw new Error('Each profile update needs a valid unique identity ID, name/profile objects, and valid language/location arrays.');
      }
      if (new Set(items.map(item => item.identity_id)).size !== items.length) {
        throw new Error('A batch cannot update the same AI identity more than once.');
      }
      payload.items = items;
    } else if (kind === 'identity-bulk') {
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
      const rowKeys = items.map(item => String(item.idempotency_key || '').trim());
      if (rowKeys.some(key => key.length < 8 || key.length > 160) ||
          new Set(rowKeys).size !== rowKeys.length) {
        throw new Error('Every identity row needs a unique idempotency_key between 8 and 160 characters.');
      }
      if (!window.crypto?.randomUUID) {
        throw new Error('This browser cannot generate the safe batch idempotency key required for import.');
      }
      form.dataset.batchIdempotencyKey = form.dataset.batchIdempotencyKey || window.crypto.randomUUID();
      payload.batch_idempotency_key = form.dataset.batchIdempotencyKey;
      payload.source = 'ai_network_admin_center';
      if (!state.adminAccess && items.some(item => String(item.population || 'independent').trim().toLowerCase() !== 'independent')) {
        throw new Error('Only authorized Minglora administrators may create organizational or specialized-service AI identities.');
      }
      payload.items = items;
    } else if (kind === 'identity') {
      path = '/identities';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.population = value('population') || 'independent';
      if (!state.adminAccess && payload.population !== 'independent') {
        throw new Error('Only authorized Minglora administrators may create organizational or specialized-service AI identities.');
      }
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
      const parseProfileJson = (field, fallback, expectedType) => {
        let parsed;
        try { parsed = JSON.parse(value(field) || fallback); }
        catch { throw new Error(field + ' must contain valid JSON.'); }
        const actualType = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed === 'object' ? 'object' : typeof parsed;
        if (actualType !== expectedType) throw new Error(field + ' must be a JSON ' + expectedType + '.');
        return parsed;
      };
      const education = parseProfileJson('education', '[]', 'array');
      const personality = parseProfileJson('personality', '{}', 'object');
      const voicePreferences = parseProfileJson('voicePreferences', '{}', 'object');
      if (education.length > 50) throw new Error('An AI profile may contain at most 50 education entries.');
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
        profile_visibility: value('profileVisibility') || 'private',
        profession: value('profession'),
        qualifications: value('qualifications').split(',').map(item => item.trim()).filter(Boolean),
        education,
        personality,
        voice_preferences: voicePreferences,
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
    } else if (kind === 'task-create') {
      path = '/tasks';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      let taskPayload;
      try { taskPayload = JSON.parse(value('taskPayload')); }
      catch { throw new Error('Task payload must be valid JSON.'); }
      if (!taskPayload || typeof taskPayload !== 'object' || Array.isArray(taskPayload)) {
        throw new Error('Task payload must be a JSON object.');
      }
      const scheduled = value('scheduledFor');
      if (!scheduled || Number.isNaN(new Date(scheduled).getTime())) throw new Error('Choose a valid scheduled date and time.');
      payload.identity_id = value('identityId');
      payload.task_title = value('taskTitle');
      payload.task_type = value('taskType').toLowerCase();
      payload.action_class = value('actionClass');
      payload.scheduled_for = new Date(scheduled).toISOString();
      payload.priority = Number(value('priority'));
      payload.max_attempts = Number(value('maxAttempts'));
      payload.token_budget = Number(value('tokenBudget'));
      payload.cost_limit_usd = Number(value('costLimitUsd'));
      payload.task_payload = taskPayload;
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'task-approval') {
      const taskId = form.dataset.taskId;
      if (!taskId) throw new Error('Task details are missing.');
      path = '/tasks/' + encodeURIComponent(taskId) + '/approval';
      payload.status = value('status');
      payload.reason = value('reason');
    } else if (kind === 'task-cancel') {
      const taskId = form.dataset.taskId;
      if (!taskId) throw new Error('Task details are missing.');
      path = '/tasks/' + encodeURIComponent(taskId) + '/cancel';
      payload.reason = value('reason');
    } else if (kind === 'provider-account') {
      path = '/provider-accounts';
      payload.provider_name = value('providerName').toLowerCase();
      payload.provider_identifier = value('providerIdentifier');
      payload.account_type = value('accountType');
    } else if (kind === 'provider-model') {
      path = '/provider-models';
      payload.provider_name = value('providerName').toLowerCase();
      payload.model_name = value('modelName');
      payload.model_identifier = value('modelIdentifier');
      payload.model_version = value('modelVersion');
      payload.model_capabilities = value('modelCapabilities').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
      payload.supported_languages = value('supportedLanguages').split(',').map(item => item.trim()).filter(Boolean);
      for (const type of ['text','image','audio','video','voice','tool']) payload[type + '_capability'] = data.has(type + 'Capability');
    } else if (kind === 'provider-assignment') {
      path = '/provider-assignments';
      payload.identity_id = value('identityId');
      payload.model_id = value('modelId');
      payload.provider_account_id = value('providerAccountId') || null;
      payload.fallback_model_id = value('fallbackModelId') || null;
      payload.routing_priority = Number(value('routingPriority'));
      payload.assigned_capabilities = value('assignedCapabilities').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
      payload.supported_languages = value('assignmentLanguages').split(',').map(item => item.trim()).filter(Boolean);
    } else if (kind === 'provider-assignment-bulk') {
      path = '/provider-assignments/bulk';
      let items;
      try { items = JSON.parse(value('items')); }
      catch { throw new Error('Bulk provider assignment input must be valid JSON.'); }
      if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
        throw new Error('A bulk provider assignment must contain between 1 and 100 records.');
      }
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
          !uuid.test(String(item.identity_id || '')) || !uuid.test(String(item.model_id || '')) ||
          (item.assigned_capabilities !== undefined && !Array.isArray(item.assigned_capabilities)) ||
          (item.supported_languages !== undefined && !Array.isArray(item.supported_languages)))) {
        throw new Error('Each assignment needs valid AI identity and model IDs plus optional capability/language arrays.');
      }
      payload.items = items;
    } else if (kind === 'provider-health-probe') {
      path = '/provider-health';
      payload.provider = 'openai';
    } else if (kind === 'provider-assignment-status') {
      const assignmentId = form.dataset.assignmentId;
      if (!assignmentId) throw new Error('Provider assignment details are missing.');
      path = '/provider-assignments/' + encodeURIComponent(assignmentId) + '/status';
      payload.status = value('status');
      payload.reason = value('reason');
    } else if (kind === 'team') {
      const botIds = data.getAll('teamBotIds').map(item => String(item).trim()).filter(Boolean);
      if (botIds.length < 1 || botIds.length > 20) {
        throw new Error('Choose between 1 and 20 AI bots for the team.');
      }
      path = '/teams';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.name = value('name');
      payload.description = value('description');
      payload.botIds = botIds;
      payload.idempotencyKey = form.dataset.idempotencyKey;
    } else if (kind === 'delegation-create') {
      const teamId = form.dataset.teamId || '';
      const grantorId = form.dataset.grantorId || '';
      const taskTypes = data.getAll('allowedTaskTypes').map(item => String(item).trim()).filter(Boolean);
      const actionClasses = data.getAll('allowedActionClasses').map(item => String(item).trim()).filter(Boolean);
      if (!teamId || !grantorId || !value('recipientIdentityId')) throw new Error('Choose a valid team lead and recipient.');
      if (!taskTypes.length || !actionClasses.length) throw new Error('Select at least one task type and one allowed task class.');
      path = '/delegations';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.team_id = teamId;
      payload.grantor_identity_id = grantorId;
      payload.grantee_identity_id = value('recipientIdentityId');
      payload.allowed_task_types = taskTypes;
      payload.allowed_action_classes = actionClasses;
      payload.max_token_budget = Number(value('maxTokenBudget'));
      payload.max_cost_limit_usd = Number(value('maxCostLimitUsd'));
      payload.expires_at = new Date(Date.now() + Number(value('expiryDays')) * 86400000).toISOString();
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'delegation-task') {
      const grantId = form.dataset.grantId || '';
      if (!grantId) throw new Error('A valid delegation grant is required.');
      path = '/delegations/' + encodeURIComponent(grantId) + '/tasks';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.task_title = value('taskTitle');
      payload.task_type = value('taskType');
      payload.action_class = value('actionClass');
      payload.task_payload = { brief:value('brief') };
      payload.token_budget = Number(value('tokenBudget'));
      payload.cost_limit_usd = Number(value('costLimitUsd'));
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'organization') {
      path = '/organizations';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.organization_name = value('organizationName');
      payload.organization_slug = value('organizationSlug').toLowerCase();
      payload.organization_type = value('organizationType');
      payload.description = value('organizationDescription');
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'organization-departments') {
      const organizationId = form.dataset.organizationId;
      if (!organizationId) throw new Error('Choose a valid organization before provisioning departments.');
      if (!state.departmentTemplates.length) throw new Error('Department templates are not available yet.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/departments';
      payload.department_keys = state.departmentTemplates.map(template => template.template_key);
    } else if (kind === 'organization-positions') {
      const organizationId = form.dataset.organizationId;
      if (!organizationId) throw new Error('Choose a valid organization before preparing positions.');
      if (!state.positionTemplates.length) throw new Error('Position templates are not available yet.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/positions';
      payload.position_keys = state.positionTemplates.map(template => template.template_key);
    } else if (kind === 'vacancy') {
      const organizationId = form.dataset.organizationId;
      if (!organizationId) throw new Error('Choose an organization before creating a vacancy.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/vacancies';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.vacancy_title = value('vacancyTitle');
      payload.department_id = value('departmentId');
      payload.position_id = value('positionId');
      payload.summary = value('summary');
      payload.description = value('description');
      payload.openings = Number(value('openings'));
      payload.requirements = value('requirements').split('\n').map(item => item.trim()).filter(Boolean);
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'vacancy-status') {
      const organizationId = form.dataset.organizationId, vacancyId = form.dataset.vacancyId;
      if (!organizationId || !vacancyId) throw new Error('Vacancy details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/vacancies/' + encodeURIComponent(vacancyId) + '/status';
      payload.status = value('status');
    } else if (kind === 'application') {
      const organizationId = form.dataset.organizationId, vacancyId = form.dataset.vacancyId;
      if (!organizationId || !vacancyId) throw new Error('Vacancy details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/applications';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.vacancy_id = vacancyId;
      payload.identity_id = value('identityId');
      payload.cover_note = value('coverNote');
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'application-review') {
      const organizationId = form.dataset.organizationId, applicationId = form.dataset.applicationId;
      if (!organizationId || !applicationId) throw new Error('Application details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/applications/' + encodeURIComponent(applicationId) + '/review';
      payload.status = value('status');
      payload.review_note = value('reviewNote');
    } else if (kind === 'appointment') {
      const organizationId = form.dataset.organizationId, applicationId = form.dataset.applicationId;
      if (!organizationId || !applicationId) throw new Error('Approved candidate details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/employees';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.application_id = applicationId;
      payload.employment_type = value('employmentType');
      payload.manager_employment_id = value('managerEmploymentId') || null;
      payload.workload_percentage = Number(value('workloadPercentage'));
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'employment-status') {
      const organizationId = form.dataset.organizationId, employmentId = form.dataset.employmentId;
      if (!organizationId || !employmentId) throw new Error('Employment details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/employees/' + encodeURIComponent(employmentId) + '/status';
      payload.status = value('status');
      payload.reason = value('reason');
    } else if (kind === 'employment-manager') {
      const organizationId = form.dataset.organizationId, employmentId = form.dataset.employmentId;
      if (!organizationId || !employmentId) throw new Error('Employment details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/employees/' + encodeURIComponent(employmentId) + '/manager';
      payload.manager_employment_id = value('managerEmploymentId') || null;
    } else if (kind === 'employment-transfer') {
      const organizationId = form.dataset.organizationId, employmentId = form.dataset.employmentId;
      if (!organizationId || !employmentId) throw new Error('Employment details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/employees/' + encodeURIComponent(employmentId) + '/transfer';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.department_id = value('departmentId'); payload.position_id = value('positionId');
      payload.manager_employment_id = value('managerEmploymentId') || null;
      payload.reason = value('reason'); payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'employee-promotion') {
      const organizationId = form.dataset.organizationId, employmentId = form.dataset.employmentId;
      if (!organizationId || !employmentId) throw new Error('Employee promotion details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/employees/' + encodeURIComponent(employmentId) + '/promote';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.department_id = value('departmentId'); payload.position_id = value('positionId');
      payload.manager_employment_id = value('managerEmploymentId') || null;
      payload.supporting_review_id = value('supportingReviewId') || null;
      payload.reason = value('reason'); payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'performance-review') {
      const organizationId = form.dataset.organizationId, employmentId = form.dataset.employmentId;
      if (!organizationId || !employmentId) throw new Error('Performance review details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/performance-reviews';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.employment_id = employmentId; payload.review_period_start = value('reviewPeriodStart');
      payload.review_period_end = value('reviewPeriodEnd'); payload.rating = Number(value('rating'));
      payload.outcome = value('outcome'); payload.summary = value('summary');
      const asLines = name => value(name).split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
      payload.strengths = asLines('strengths'); payload.improvement_areas = asLines('improvementAreas');
      payload.goals = asLines('goals'); payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'performance-review-finalize') {
      const organizationId = form.dataset.organizationId, reviewId = form.dataset.reviewId;
      if (!organizationId || !reviewId) throw new Error('Performance review details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/performance-reviews/' + encodeURIComponent(reviewId) + '/finalize';
      payload.reason = value('reason');
    } else if (kind === 'succession-plan') {
      const organizationId = form.dataset.organizationId;
      if (!organizationId) throw new Error('Succession plan organization is missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/succession-plans';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.role_position_id = value('rolePositionId'); payload.incumbent_employment_id = value('incumbentEmploymentId') || null;
      payload.successor_employment_id = value('successorEmploymentId'); payload.readiness_level = value('readinessLevel');
      payload.review_due_on = value('reviewDueOn') || null; payload.rationale = value('rationale');
      payload.development_actions = value('developmentActions').split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
      payload.idempotency_key = form.dataset.idempotencyKey;
    } else if (kind === 'succession-status') {
      const organizationId = form.dataset.organizationId, planId = form.dataset.planId;
      if (!organizationId || !planId) throw new Error('Succession plan details are missing.');
      path = '/organizations/' + encodeURIComponent(organizationId) + '/succession-plans/' + encodeURIComponent(planId) + '/status';
      payload.status = value('status'); payload.reason = value('reason');
    } else if (kind === 'training-course') {
      const organizationId=form.dataset.organizationId;
      if(!organizationId) throw new Error('Training course organization is missing.');
      path='/organizations/'+encodeURIComponent(organizationId)+'/training-courses';
      form.dataset.idempotencyKey=form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.course_key=value('courseKey'); payload.course_title=value('courseTitle'); payload.description=value('description');
      payload.required_training=form.querySelector('[name="requiredTraining"]').checked;
      payload.learning_objectives=value('learningObjectives').split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
      payload.idempotency_key=form.dataset.idempotencyKey;
    } else if (kind === 'training-course-status') {
      const organizationId=form.dataset.organizationId,courseId=form.dataset.courseId;
      if(!organizationId||!courseId) throw new Error('Training course details are missing.');
      path='/organizations/'+encodeURIComponent(organizationId)+'/training-courses/'+encodeURIComponent(courseId)+'/status';
      payload.status=value('status'); payload.reason=value('reason');
    } else if (kind === 'training-enrollment') {
      const organizationId=form.dataset.organizationId;
      if(!organizationId) throw new Error('Training enrollment organization is missing.');
      path='/organizations/'+encodeURIComponent(organizationId)+'/training-enrollments';
      form.dataset.idempotencyKey=form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.course_id=value('courseId'); payload.employment_id=value('employmentId'); payload.due_on=value('dueOn') || null;
      payload.idempotency_key=form.dataset.idempotencyKey;
    } else if (kind === 'training-enrollment-status') {
      const organizationId=form.dataset.organizationId,enrollmentId=form.dataset.enrollmentId;
      if(!organizationId||!enrollmentId) throw new Error('Training enrollment details are missing.');
      path='/organizations/'+encodeURIComponent(organizationId)+'/training-enrollments/'+encodeURIComponent(enrollmentId)+'/status';
      payload.status=value('status'); payload.reason=value('reason'); payload.completion_note=value('completionNote'); payload.score=value('score') || null;
    } else if (kind === 'attendance') {
      const organizationId=form.dataset.organizationId;
      if(!organizationId) throw new Error('Attendance organization is missing.');
      path='/organizations/'+encodeURIComponent(organizationId)+'/attendance';
      form.dataset.idempotencyKey=form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.employment_id=value('employmentId'); payload.attendance_date=value('attendanceDate'); payload.attendance_status=value('attendanceStatus');
      const checkIn=value('checkInAt'),checkOut=value('checkOutAt');
      payload.check_in_at=checkIn ? new Date(checkIn).toISOString() : null;
      payload.check_out_at=checkOut ? new Date(checkOut).toISOString() : null;
      payload.reason=value('reason'); payload.idempotency_key=form.dataset.idempotencyKey;
    } else if (kind === 'bot') {
      path = '/bots';
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.identityIdempotencyKey = form.dataset.idempotencyKey;
      payload.firstName = value('firstName');
      payload.middleName = value('middleName');
      payload.lastName = value('lastName');
      payload.categoryKey = value('categoryKey');
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
      payload.actionClass = 'content';
      payload.taskTitle = 'Scheduled ' + String(payload.taskType || 'AI task').replaceAll('_', ' ');
      payload.taskPayload = {};
      payload.cadence = value('cadence');
      payload.timezone = value('timezone');
      const runAt = value('runAt');
      payload.runAt = runAt ? new Date(runAt).toISOString() : '';
      payload.weekdays = payload.cadence === 'weekly' ? data.getAll('scheduleWeekdays').map(value => Number(value)) : [];
      if (payload.cadence === 'weekly' && !payload.weekdays.length) {
        throw new Error('Choose at least one weekday for a weekly schedule.');
      }
      payload.tokenBudget = 0;
      payload.costLimitUsd = 0;
      form.dataset.idempotencyKey = form.dataset.idempotencyKey || window.crypto.randomUUID();
      payload.idempotencyKey = form.dataset.idempotencyKey;
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
    const patchKinds = ['settings','languages','memory-settings','memory-edit','vacancy-status','application-review','employment-status','employment-manager','provider-assignment-status','task-approval','identity-edit'];
    const talentPatchKinds = ['performance-review-finalize','succession-status','training-course-status','training-enrollment-status'];
    const result = await request(path, { method: patchKinds.concat(talentPatchKinds).includes(kind) ? 'PATCH' : 'POST', body: payload });
    if (kind === 'provider-health-probe') state.providerHealth = result;
    if (kind === 'bot-chat') {
      state.botChat = result;
      state.selectedBotChatId = result.bot?.id || form.dataset.botId || '';
      state.botChatError = '';
    }
    let uploadedMediaCount = 0;
    if (kind === 'identity-edit' && identityIdForMedia) {
      const selectedMedia = [
        ['avatar', form.querySelector('[name="avatarFile"]')?.files?.[0] || null],
        ['cover', form.querySelector('[name="coverFile"]')?.files?.[0] || null]
      ];
      for (const [slot, file] of selectedMedia) {
        if (!file) continue;
        const status = form.querySelector('[data-ai-media-status]');
        await window.uploadMediaFile(slot, file, 1, 0, progress => {
          if (status) status.textContent = 'Uploading AI ' + slot + ': ' + Number(progress?.percentage || 0) + '%';
        }, { aiIdentityId: identityIdForMedia });
        const input = form.querySelector('[name="' + slot + 'File"]');
        if (input) input.value = '';
        uploadedMediaCount += 1;
      }
    }
    form.reset();
    if (kind === 'identity-bulk') delete form.dataset.batchIdempotencyKey;
    if (kind === 'bot-chat' || kind === 'email-send') delete form.dataset.requestId;
    if (kind === 'category') {
      const categoryKeyInput = form.querySelector('[name="categoryKey"]');
      if (categoryKeyInput) categoryKeyInput.readOnly = false;
    }
    if (['identity','bot','team','delegation-create','delegation-task','organization','vacancy','application','appointment','employment-transfer','employee-promotion','performance-review','succession-plan','training-course','training-enrollment','attendance','task-create'].includes(kind)) form.dataset.idempotencyKey = window.crypto.randomUUID();
    const categoryActionLabels = { created:'created', updated:'updated', activated:'reactivated', deactivated:'deactivated' };
    let message = kind === 'memory-edit'
      ? 'AI memory entry updated; its retention expiry was refreshed.'
      : kind === 'memory-settings'
      ? 'AI memory consent and retention settings saved for this identity. Existing entries were cleared when memory was disabled.'
      : kind === 'memory-entry'
        ? 'Owner-managed AI memory entry saved with its retention expiry.'
    : kind === 'category'
      ? 'AI category ' + (categoryActionLabels[result.action] || 'changes saved') + ' and an audit event recorded.'
      : kind === 'bot'
        ? 'AI bot saved and linked to relational identity ' + String(result.identity?.identity?.identity_id || '') + '. The identity is private and execution remains paused.'
      : kind === 'team'
        ? 'AI team saved to the private relational registry. Memberships are owner-scoped and coordination remains human-reviewed.'
      : kind === 'delegation-create'
        ? 'Delegation grant saved with explicit scope, budgets and expiry. All delegated tasks still require owner approval.'
      : kind === 'delegation-task'
        ? 'Delegated task submitted to the pending-approval queue. It has not been executed.'
      : kind === 'identity-edit' ? 'AI identity profile and name details updated with a new version and audit record.' + (uploadedMediaCount ? ' ' + uploadedMediaCount + ' AI profile image(s) uploaded, verified and attached.' : '')
      : kind === 'task-create'
      ? 'Task saved to the durable queue; approval policy comes from the selected AI identity.'
      : kind === 'task-approval'
        ? 'Task approval decision recorded.'
        : kind === 'task-cancel'
          ? 'Task cancellation recorded.'
          : kind === 'provider-account'
      ? 'Provider account reference saved as unconfigured; no credentials were stored.'
      : kind === 'provider-model'
        ? 'Provider model metadata saved; availability and access are not verified.'
        : kind === 'provider-assignment'
          ? 'Model assignment saved as pending; provider execution remains disabled.'
          : kind === 'provider-health-probe'
        ? (result.connected ? 'OpenAI model access verified by a read-only probe. AI inference and workers remain disabled.' : 'OpenAI probe completed: ' + String(result.status || 'unknown') + '. AI inference and workers remain disabled.')
      : kind === 'provider-assignment-status'
            ? 'Provider assignment status updated.'
            : kind === 'identity'
      ? 'AI identity record saved in Minglora Supabase.'
      : kind === 'identity-bulk'
        ? 'Bulk identity batch ' + String(result.batch_id || '') + ': ' + number(result.created_count) + ' created; ' + number(result.reused_count) + ' reused; ' + number(result.failed_count) + ' failed.'
        : kind === 'identity-profile-bulk'
          ? 'Bulk AI profile update: ' + number(result.succeeded_count) + ' succeeded; ' + number(result.failed_count) + ' failed.'
          : kind === 'provider-assignment-bulk'
            ? 'Bulk provider assignment: ' + number(result.created_count) + ' created; ' + number(result.reused_count) + ' reused; ' + number(result.failed_count) + ' failed. All new assignments remain pending.'
        : kind === 'organization'
          ? 'AI organization record saved. Its initial status is proposed.'
          : kind === 'organization-departments'
            ? 'Department setup: ' + number(result.created_count) + ' created; ' + number(result.existing_count) + ' already existed.'
            : kind === 'organization-positions'
              ? 'Position setup: ' + number(result.created_count) + ' prepared; ' + number(result.existing_count) + ' already existed.'
              : kind === 'vacancy' ? 'Recruitment vacancy draft saved.'
                : kind === 'vacancy-status' ? 'Vacancy status updated.'
                  : kind === 'application' ? 'AI candidate application saved.'
                    : kind === 'application-review' ? 'Candidate review saved.'
                      : kind === 'appointment' ? 'AI employee appointed into onboarding.'
                        : kind === 'employment-status' ? 'Employment status updated.'
                          : kind === 'employment-manager' ? 'Reporting manager updated.'
                            : kind === 'employment-transfer' ? 'Employee transfer recorded; new role begins onboarding.'
                            : kind === 'employee-promotion' ? 'Promotion recorded with linked employment history; the new role starts in onboarding.'
                              : kind === 'performance-review' ? 'Human-authored performance review submitted and recorded.'
                                : kind === 'performance-review-finalize' ? 'Performance review finalized and audit history updated.'
                                  : kind === 'succession-plan' ? 'Succession plan saved as a draft; no employee was appointed or promoted.'
                                    : kind === 'succession-status' ? 'Succession plan status and audit history updated.'
                                      : kind === 'training-course' ? 'Training course saved as a draft; publish it before assignment.'
                                      : kind === 'training-course-status' ? 'Training course status and history updated.'
                                      : kind === 'training-enrollment' ? 'Training assigned to the selected employee.'
                                      : kind === 'training-enrollment-status' ? 'Training status and enrollment history updated.'
                                      : kind === 'attendance' ? 'Human-recorded attendance saved; no attendance was inferred.'
                                      : 'Saved successfully.';
    if (kind === 'email-send') message = 'Email accepted by Resend and recorded in the AI mailbox.';
    const batchFailures = kind === 'identity-bulk'
      ? list(result.failed_rows)
      : ['identity-profile-bulk','provider-assignment-bulk'].includes(kind) ? list(result.failed) : [];
    if (batchFailures.length) {
      const summaries = batchFailures.slice(0, 5).map(item => {
        const rowIndex = Number(item.row_index || item.index);
        const label = item.identity_id || (Number.isInteger(rowIndex) && rowIndex > 0 ? 'Row ' + rowIndex : 'Record');
        return String(label) + ': ' + String(item.error || 'Update failed.');
      });
      const remaining = batchFailures.length > summaries.length ? ' · ' + (batchFailures.length - summaries.length) + ' more failure(s).' : '';
      message += ' ' + summaries.join(' · ') + remaining;
    }
    await refresh(message);
    if (batchFailures.length) {
      setNotice(message, 'warning');
      paintSnapshot();
    }
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
      paintSnapshot();
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
      if (action === 'identity-page') {
        const offset = Number(button.dataset.offset);
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Choose a valid AI identity registry page.');
        state.identityRegistryOffset = offset;
      }
      else if (action === 'identity-search-clear') {
        state.identityRegistrySearch = '';
        state.identityRegistryOffset = 0;
      }
      else if (action === 'reload') return await load();
      else if (action === 'email-provision') {
        if (!id) throw new Error('Choose an AI identity before provisioning email.');
        const result = await request('/identities/' + encodeURIComponent(id) + '/email/provision', { method:'POST', body:{} });
        await refresh('AI mailbox provisioned: ' + String(result.mailbox?.email_address || 'address ready') + '.');
        return;
      }
      else if (action === 'email-refresh') {
        if (!id) throw new Error('Choose an AI identity before refreshing its inbox.');
        await loadAIEmailCenter(id);
        paintSnapshot();
        return;
      }
      else if (action === 'email-mark-read') {
        const identityId = button.dataset.identityId || state.emailIdentityId;
        if (!identityId || !id) throw new Error('A valid identity and message are required.');
        await request('/identities/' + encodeURIComponent(identityId) + '/email/messages/' + encodeURIComponent(id), { method:'POST', body:{} });
        await loadAIEmailCenter(identityId);
        paintSnapshot();
        return;
      }
      else if (action === 'delete-memory') {
        const identityId = button.dataset.identityId || state.memoryIdentityId;
        if (!identityId || !id) throw new Error('Choose a valid AI memory entry to delete.');
        await request('/identities/' + encodeURIComponent(identityId) + '/memory/' + encodeURIComponent(id), { method:'DELETE' });
        state.memoryIdentityId = identityId;
      }
      else if (action === 'edit-category') {
        const category = state.categoryAdmin?.find(item => item.category_key === button.dataset.categoryKey);
        const form = document.querySelector('form[data-ai-form="category"]');
        if (!category || !form) throw new Error('The selected AI category could not be loaded.');
        form.querySelector('[name="categoryKey"]').value = category.category_key;
        form.querySelector('[name="categoryKey"]').readOnly = true;
        form.querySelector('[name="displayName"]').value = category.display_name || '';
        form.querySelector('[name="description"]').value = category.description || '';
        form.querySelector('[name="sortOrder"]').value = String(category.sort_order ?? 1000);
        form.querySelector('[name="isActive"]').checked = Boolean(category.is_active);
        form.querySelector('[name="displayName"]').focus();
        return;
      }
      if (action === 'identity-status') {
        const row = button.closest('.ai-network-list-row');
        const status = row?.querySelector('[data-ai-identity-status-choice]')?.value || '';
        const reason = row?.querySelector('[data-ai-identity-status-reason]')?.value || '';
        if (!id || !status) throw new Error('Choose a valid AI identity status transition.');
        if (['archived','retired'].includes(status) && !window.confirm('Apply the ' + status + ' transition to this AI identity? This changes its lifecycle state and is recorded in the audit history.')) return;
        await request('/identities/' + encodeURIComponent(id) + '/status', {
          method:'PATCH', body:{ status, reason }
        });
      }
      else if (action === 'identity-batch-retry') {
        const batchId = String(button.dataset.batchId || '');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
          throw new Error('Choose a valid AI identity batch to retry.');
        }
        const batch = state.identityBatches.find(item => item.batch_id === batchId);
        const failedCount = Number(batch?.failed_count || 0);
        if (!failedCount) throw new Error('This import has no failed rows remaining.');
        if (!window.confirm('Retry ' + failedCount + ' failed AI identity row(s)? Existing row idempotency keys will prevent duplicate identities.')) return;
        const result = await request('/identities/batches/' + encodeURIComponent(batchId) + '/retry', { method:'POST', body:{} });
        const message = 'AI identity batch retry: ' + number(result.created_count || 0) + ' created, ' +
          number(result.reused_count || 0) + ' reused, ' + number(result.failed_count || 0) + ' still failed.';
        await refresh(message);
        if (Number(result.failed_count || 0)) {
          setNotice(message, 'warning');
          paintSnapshot();
        }
        return;
      }
      else if (action === 'identity-bulk-status') {
        const identityIds = [...document.querySelectorAll('[data-ai-identity-select]:checked')].map(input => input.value);
        const status = document.querySelector('[data-ai-bulk-status]')?.value || '';
        const reason = document.querySelector('[data-ai-bulk-reason]')?.value || '';
        if (!identityIds.length || identityIds.length > 100) throw new Error('Select between 1 and 100 AI identities.');
        if (!status) throw new Error('Choose a bulk lifecycle status.');
        if (['archived','retired'].includes(status) && !window.confirm('Apply ' + status + ' to ' + identityIds.length + ' selected AI identities? Every permitted transition is audited; incompatible transitions will be reported without changing those records.')) return;
        const result = await request('/identities/bulk-status', {
          method:'POST', body:{ identity_ids:identityIds, status, reason }
        });
        const succeeded = Number(result.succeeded_count || 0);
        const failed = Number(result.failed_count || 0);
        const message = succeeded + ' AI identity lifecycle change(s) succeeded; ' + failed + ' failed.';
        await refresh(message);
        if (failed) {
          const failures = list(result.failed).slice(0, 5).map(item =>
            String(item.identity_id || 'Identity') + ': ' + String(item.error || 'Transition failed.')
          );
          const more = failed > failures.length ? ' · ' + (failed - failures.length) + ' more failure(s).' : '';
          setNotice(message + ' ' + failures.join(' · ') + more, 'warning');
          paintSnapshot();
        }
        return;
      }
      else if (action === 'follow-ai') await request('/follow', { method:'POST', body:{ identity_id:id } });
      else if (action === 'unfollow-ai') await request('/following/' + encodeURIComponent(id), { method:'DELETE' });
      else if (action === 'review-follow') await request('/follow-requests/' + encodeURIComponent(id), { method:'PATCH', body:{ decision:button.dataset.decision } });
      else if (action === 'apply-discovery-group') {
        const group = state.savedDiscoveryGroups.find(item => item.group_id === id);
        if (!group) throw new Error('Saved discovery group was not found.');
        state.discoveryFilters = group.filters || {};
        await loadAIDiscovery(state.discoveryFilters);
      }
      else if (action === 'delete-discovery-group') await request('/saved-groups/' + encodeURIComponent(id), { method:'DELETE' });
      else if (action === 'bot-chat-open') {
        const result = await request('/bots/' + encodeURIComponent(id) + '/conversation');
        state.botChat = result;
        state.selectedBotChatId = result.bot?.id || id;
        state.botChatError = '';
      }
      else if (action === 'bot-chat-close') {
        state.botChat = null;
        state.selectedBotChatId = '';
        state.botChatError = '';
      }
      else if (action === 'bot-status') await request('/bots/' + encodeURIComponent(id) + '/status', { method:'PATCH', body:{ status:button.dataset.status } });
      else if (action === 'schedule-status') await request('/schedules/' + encodeURIComponent(id) + '/status', { method:'PATCH', body:{ status:button.dataset.status, reason:'Updated by the signed-in Minglora account.' } });
      else if (action === 'approval') await request('/approvals/' + encodeURIComponent(id), { method:'PATCH', body:{ decision:button.dataset.decision } });
      else if (action === 'creator-generate') {
        if (!id) throw new Error('A valid Creator Studio draft is required.');
        if (!window.confirm('Generate an AI draft for human review? This sends the saved brief to OpenAI. Nothing will be published.')) return;
        await request('/creator-jobs/' + encodeURIComponent(id) + '/generate', { method:'POST', body:{} });
      }
      else if (action === 'delegation-status') await request('/delegations/' + encodeURIComponent(id), { method:'PATCH', body:{ status:button.dataset.status, reason:'Updated by authorized Minglora platform administrator.' } });
      else if (action === 'emergency-pause') await request('/emergency-pause', { method:'POST', body:{ reason:'Owner initiated emergency pause from the AI Network command center.' } });
      else if (action === 'emergency-resume') await request('/emergency-resume', { method:'POST', body:{} });
      await refresh(action === 'emergency-pause' ? 'Bot and schedule controls paused. Durable queue workers remain disabled.' :
        action === 'emergency-resume' ? 'Owner controls resumed after a live OpenAI model check. Bots remain paused until enabled individually; autonomous workers remain off.' :
        action === 'identity-status' ? 'AI identity lifecycle status updated and audited.' :
        action === 'identity-page' ? 'AI identity registry page changed.' :
        action === 'identity-search-clear' ? 'AI identity registry search cleared.' : 'AI Network updated.');
    } catch (error) {
      if (action === 'creator-generate') {
        try {
          await refresh(error.message || 'OpenAI generation failed. Check the provider status and retry the draft.');
        } catch (refreshError) {
          state.error = refreshError.message || error.message;
          paintSnapshot();
        }
      } else if (action === 'bot-chat-open' || action === 'bot-chat-close') {
        state.botChatError = error.message;
        paintSnapshot();
      } else {
        state.error = error.message;
        paintSnapshot();
      }
    } finally {
      state.busy = false;
    }
  };

  const onMemoryIdentityChange = async event => {
    const select = event.target instanceof Element
      ? event.target.closest('select[data-ai-memory-identity]')
      : null;
    if (!select || state.busy) return;
    state.busy = true;
    try {
      await loadAIMemory(select.value);
      paintSnapshot();
    } catch (error) {
      state.memoryError = error.message || 'AI memory could not be loaded.';
      paintSnapshot();
    } finally {
      state.busy = false;
    }
  };

  const onEmailIdentityChange = async event => {
    const select = event.target instanceof Element
      ? event.target.closest('select[data-ai-email-identity]')
      : null;
    if (!select || state.busy) return;
    state.busy = true;
    try {
      await loadAIEmailCenter(select.value);
      paintSnapshot();
    } catch (error) {
      state.emailError = error.message || 'AI mailbox could not be loaded.';
      paintSnapshot();
    } finally {
      state.busy = false;
    }
  };

  if (!window.__mingloraAINetworkBound) {
    window.__mingloraAINetworkBound = true;
    document.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick);
    document.addEventListener('change', onMemoryIdentityChange);
    document.addEventListener('change', onEmailIdentityChange);
  }
  window.MingloraAINetwork = { render: load, refresh: () => refresh(), request };
})();
