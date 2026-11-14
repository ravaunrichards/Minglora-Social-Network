(() => {
  'use strict';

  const API = '/api/ai-network';
  const root = () => document.getElementById('main-content');
  const state = { snapshot: null, busy: false, error: '', notice: '', identityRegistry: null, identityCategories: [], identityError: '', discoveryResults: { identities: [], total: 0 }, discoveryFilters: {}, discoveryError: '', following: [], followRequests: [], savedDiscoveryGroups: [], organizationRegistry: null, departmentTemplates: [], positionTemplates: [], organizationHR: {}, organizationError: '', memoryIdentityId: '', memorySettings: null, memoryEntries: [], memoryError: '', providerAccounts: [], providerModels: [], providerAssignments: [], providerError: '', aiTasks: [], taskRuntime: null, taskError: '', categoryAdmin: null };
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
      return '<article class="ai-network-list-row"><div class="ai-network-list-main">' +
        '<div class="ai-network-avatar" aria-hidden="true">' +
        (profile.avatar_storage_ref ? '<img src="/api/ai-network/identities/' + encodeURIComponent(identity.identity_id || '') + '/media/avatar" alt="" loading="lazy">' : 'AI') +
        '</div><div><strong>' + esc(display || 'AI identity') + '</strong>' +
        '<div class="ai-network-meta">' + pill('AI IDENTITY', 'ai') + ' ' + pill(identity.status || 'created') + ' ' + pill(identity.population || 'independent') + '</div>' +
        '<small>@' + esc(name.username || 'username unavailable') + ' · ' + esc(identity.category_key || 'uncategorized') + ' · ' + esc(profile.gender || 'not specified') + '</small>' +
        '<p>' + emailStatus + '</p><small>' + esc(identity.identity_id || '') + '</small>' + editor + '</div></div></article>';
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
        request('/identities?limit=100'),
        request('/categories')
      ]);
      state.identityRegistry = registry;
      state.identityCategories = list(categoryResult.categories);
      try {
        const adminCategoryResult = await request('/categories/admin');
        state.categoryAdmin = list(adminCategoryResult.categories);
      } catch {
        state.categoryAdmin = null;
      }
    } catch (error) {
      state.identityRegistry = null;
      state.identityCategories = [];
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
      ' ' + pill('Owner-managed') + '</div><small>Expires: ' + esc(date(entry.expires_at)) + '</small></div></div>' +
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
          request(base + '/departments'),
          request(base + '/positions'),
          request(base + '/vacancies'),
          request(base + '/applications'),
          request(base + '/employees')
        ]);
        return [organizationId, {
          departments: list(departmentResult.departments),
          positions: list(positionResult.positions),
          vacancies: list(vacancyResult.vacancies),
          applications: list(applicationResult.applications),
          employees: list(employeeResult.employees)
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
          return '<article class="ai-network-list-row ai-network-hr-row"><div class="ai-network-list-main"><div><strong>' +
            esc(row.identity?.display_name || row.identity?.username || 'AI employee') + '</strong><div class="ai-network-meta">' +
            pill(status) + ' ' + esc(row.department_name || '') + ' · ' + esc(row.position_name || '') +
            '</div></div></div>' + statusForm + managerForm + transferForm + '</article>';
        }).join('') + '</div>'
      : empty('No AI employees have been appointed.');
    const candidateOptions = identityOptions.length
      ? '<p class="ai-network-note">' + identityOptions.length + ' owner-managed AI identities available for recruitment.</p>'
      : '<p class="ai-network-note">No eligible owner-managed AI identities are currently listed. Register an identity first.</p>';
    return '<section class="ai-network-hr-workspace"><div class="ai-network-hr-heading"><h4>Recruitment & workforce management</h4>' +
      '<p class="ai-network-note">Vacancies begin as drafts. Candidates must be owner-managed AI identities and approved before appointment. Employee status, manager and transfer changes are recorded in persistent history.</p></div>' +
      vacancyForm + '<div><h5>Vacancies</h5>' + vacancyRows + '</div>' +
      '<div><h5>Candidate applications</h5>' + candidateOptions + applicationRows + '</div>' +
      '<div><h5>AI employees</h5>' + employeeRows + '</div></section>';
  }

  function renderAIProviderCenter() {
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
    return card('Provider & Model Assignment Center', '02 · PROVIDERS', warning +
      '<div class="ai-network-command-grid"><div><span>Account references</span><strong>' + number(accounts.length) + '</strong></div>' +
      '<div><span>Catalogue models</span><strong>' + number(models.length) + '</strong></div>' +
      '<div><span>Identity assignments</span><strong>' + number(assignments.length) + '</strong></div></div>' +
      '<div class="ai-network-provider-columns"><div><h4>Provider accounts</h4>' + accountRows + accountForm + '</div>' +
      '<div><h4>Model catalogue</h4>' + modelRows + modelForm + '</div></div>' +
      assignmentForm + '<div><h4>Identity assignments</h4>' + assignmentRows + '</div>' +
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
    const botCategoryOptions = list(state.identityCategories).map(category => ({ value:category.category_key, label:category.display_name }));
    const botDefaultCategory = botCategoryOptions.some(option => option.value === 'ai_support')
      ? 'ai_support' : (botCategoryOptions[0]?.value || '');
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
      renderAIMemoryCenter() +
      renderAICategoryAdmin() +
      renderAIDiscoveryCenter() +
      renderAIProviderCenter() +
      renderAITaskQueueCenter() +
      renderAIOrganizationCenter() +
      card('Bot Personality Laboratory', '01 · PERSONALITY', '<p>Build unique AI helpers with a clear purpose, tone, traits, expertise and permitted tasks. Every Bot Lab creation is also registered as an individually addressable, private AI identity in Minglora.</p>' +
        renderBotRows(bots) + '<form class="ai-network-form" data-ai-form="bot"><div class="ai-network-form-title">Create a new AI bot and identity</div>' +
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
      card('Central Bot Command Center', '10 · COMMAND CENTER', '<p>All of your AI tools, approval decisions, provider status and global safety controls.</p>' +
        '<div class="ai-network-command-grid"><div><span>Provider</span><strong>' + esc(provider.provider || 'Not configured') + '</strong></div><div><span>Model</span><strong>' + esc(provider.model || '—') + '</strong></div>' +
        '<div><span>Global state</span><strong>' + esc(settings.globalPaused ? 'Paused' : 'Enabled') + '</strong></div><div><span>Execution</span><strong>Disabled until provider adapter is verified</strong></div></div>' +
        renderApprovals(approvals) + renderSettings(settings,provider), 'ai-network-span-2') +
      '</div><footer class="ai-network-footer">Minglora AI Network · Owner-controlled · AI identities disclosed · Human approval required</footer></section>';
  }

  function paintSnapshot() {
    const host = root();
    if (host) host.innerHTML = renderSnapshot(state.snapshot);
  }

  async function load() {
    state.error = '';
    const host = root();
    if (!host) return;
    host.innerHTML = '<section class="ai-network-loading" role="status"><span class="ai-network-spinner" aria-hidden="true"></span><strong>Opening your AI Network workspace…</strong></section>';
    try {
      state.snapshot = await request();
      await loadAIIdentityRegistry();
      await loadAIMemory();
      await loadAIDiscovery();
      await loadAIProviderRegistry();
      await loadAITaskQueue();
      await loadAIOrganizationRegistry();
      paintSnapshot();
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
    await loadAIMemory();
    await loadAIDiscovery();
    await loadAIProviderRegistry();
    await loadAITaskQueue();
    await loadAIOrganizationRegistry();
    paintSnapshot();
  }

  async function submit(form) {
    const kind = form.dataset.aiForm;
    const data = new FormData(form);
    const value = key => String(data.get(key) ?? '').trim();
    const payload = {};
    let path = '';
    let identityIdForMedia = null;
    if (kind === 'bulk-follow') {
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
    } else if (kind === 'provider-assignment-status') {
      const assignmentId = form.dataset.assignmentId;
      if (!assignmentId) throw new Error('Provider assignment details are missing.');
      path = '/provider-assignments/' + encodeURIComponent(assignmentId) + '/status';
      payload.status = value('status');
      payload.reason = value('reason');
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
      payload.department_id = value('departmentId');
      payload.position_id = value('positionId');
      payload.manager_employment_id = value('managerEmploymentId') || null;
      payload.reason = value('reason');
      payload.idempotency_key = form.dataset.idempotencyKey;
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
    const patchKinds = ['settings','languages','vacancy-status','application-review','employment-status','employment-manager','provider-assignment-status','task-approval','identity-edit'];
    const result = await request(path, { method: patchKinds.includes(kind) ? 'PATCH' : 'POST', body: payload });
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
    if (kind === 'category') {
      const categoryKeyInput = form.querySelector('[name="categoryKey"]');
      if (categoryKeyInput) categoryKeyInput.readOnly = false;
    }
    if (['identity','bot','organization','vacancy','application','appointment','employment-transfer','task-create'].includes(kind)) form.dataset.idempotencyKey = window.crypto.randomUUID();
    const categoryActionLabels = { created:'created', updated:'updated', activated:'reactivated', deactivated:'deactivated' };
    const message = kind === 'category'
      ? 'AI category ' + (categoryActionLabels[result.action] || 'changes saved') + ' and an audit event recorded.'
      : kind === 'bot'
        ? 'AI bot saved and linked to relational identity ' + String(result.identity?.identity?.identity_id || '') + '. The identity is private and execution remains paused.'
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
          : kind === 'provider-assignment-status'
            ? 'Provider assignment status updated.'
            : kind === 'identity'
      ? 'AI identity record saved in Minglora Supabase.'
      : kind === 'identity-bulk'
        ? 'Bulk identity batch: ' + number(result.created_count) + ' created; ' + number(result.reused_count) + ' reused; ' + number(result.failed_count) + ' failed.'
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
      if (action === 'reload') return await load();
      if (action === 'edit-category') {
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
      if (action === 'follow-ai') await request('/follow', { method:'POST', body:{ identity_id:id } });
      else if (action === 'unfollow-ai') await request('/following/' + encodeURIComponent(id), { method:'DELETE' });
      else if (action === 'review-follow') await request('/follow-requests/' + encodeURIComponent(id), { method:'PATCH', body:{ decision:button.dataset.decision } });
      else if (action === 'apply-discovery-group') {
        const group = state.savedDiscoveryGroups.find(item => item.group_id === id);
        if (!group) throw new Error('Saved discovery group was not found.');
        state.discoveryFilters = group.filters || {};
        await loadAIDiscovery(state.discoveryFilters);
      }
      else if (action === 'delete-discovery-group') await request('/saved-groups/' + encodeURIComponent(id), { method:'DELETE' });
      else if (action === 'bot-status') await request('/bots/' + encodeURIComponent(id) + '/status', { method:'PATCH', body:{ status:button.dataset.status } });
      else if (action === 'approval') await request('/approvals/' + encodeURIComponent(id), { method:'PATCH', body:{ decision:button.dataset.decision } });
      else if (action === 'emergency-pause') await request('/emergency-pause', { method:'POST', body:{ reason:'Owner initiated emergency pause from the AI Network command center.' } });
      else if (action === 'emergency-resume') await request('/emergency-resume', { method:'POST', body:{} });
      await refresh(action === 'emergency-pause' ? 'Emergency pause confirmed. AI work remains stopped.' : 'AI Network updated.');
    } catch (error) {
      state.error = error.message;
      paintSnapshot();
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