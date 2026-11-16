const PAGE_HANDLE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const PAGE_ROLES = new Set(['owner', 'admin', 'editor', 'analyst']);
const PAGE_TEAM_ROLES = new Set(['admin', 'editor', 'analyst']);

function cleanText(value, max) {
  return String(value ?? '').trim();
}

function validHttpUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function validatePageInput(input = {}, existingPages = []) {
  const handle = cleanText(input.handle, 30).toLowerCase();
  const title = cleanText(input.title, 160);
  const description = cleanText(input.description, 2000);
  const category = cleanText(input.category, 60);
  const errors = [];
  if (!PAGE_HANDLE.test(handle)) errors.push('Page handle must be 3–30 lowercase letters, numbers, underscores or hyphens, starting with a letter or number.');
  if (title.length < 3 || title.length > 160) errors.push('Page title must be 3–160 characters.');
  if (description.length > 2000) errors.push('Page description must be 2000 characters or fewer.');
  if (category.length > 60) errors.push('Page category must be 60 characters or fewer.');
  if (existingPages.some(page => String(page.handle).toLowerCase() === handle)) errors.push('That Page handle is already taken.');
  return { valid: errors.length === 0, errors, value: { handle, title, description, category } };
}

/**
 * Validate only fields explicitly supplied by a Page manager. Unsent fields are
 * left untouched so a partial edit never clears unrelated Page information.
 */
export function validatePageUpdate(input = {}, page = {}, existingPages = []) {
  const value = {};
  const errors = [];
  const supplied = key => Object.prototype.hasOwnProperty.call(input, key);

  if (supplied('title')) {
    value.title = cleanText(input.title, 160);
    if (value.title.length < 3 || value.title.length > 160) errors.push('Page title must be 3–160 characters.');
  }
  if (supplied('handle')) {
    value.handle = cleanText(input.handle, 30).toLowerCase();
    if (!PAGE_HANDLE.test(value.handle)) errors.push('Page handle must be 3–30 lowercase letters, numbers, underscores or hyphens, starting with a letter or number.');
    if (existingPages.some(item => item.id !== page.id && String(item.handle).toLowerCase() === value.handle)) errors.push('That Page handle is already taken.');
  }
  if (supplied('description')) {
    value.description = cleanText(input.description, 2000);
    if (String(input.description ?? '').trim().length > 2000) errors.push('Page description must be 2000 characters or fewer.');
  }
  if (supplied('category')) {
    value.category = cleanText(input.category, 60);
    if (String(input.category ?? '').trim().length > 60) errors.push('Page category must be 60 characters or fewer.');
  }
  if (supplied('website')) {
    value.website = cleanText(input.website, 500);
    if (value.website.length > 500) errors.push('Website must be 500 characters or fewer.');
    if (!validHttpUrl(value.website)) errors.push('Website must be a valid HTTP or HTTPS URL.');
  }
  if (supplied('contactEmail')) {
    value.contactEmail = cleanText(input.contactEmail, 254).toLowerCase();
    if (value.contactEmail.length > 254) errors.push('Contact email must be 254 characters or fewer.');
    if (value.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail)) errors.push('Enter a valid Page contact email address.');
  }
  if (supplied('phone')) {
    value.phone = cleanText(input.phone, 50);
    if (value.phone.length > 50) errors.push('Phone number must be 50 characters or fewer.');
  }
  if (supplied('location')) {
    value.location = cleanText(input.location, 160);
    if (value.location.length > 160) errors.push('Location must be 160 characters or fewer.');
  }
  if (supplied('actionLabel')) {
    value.actionLabel = cleanText(input.actionLabel, 40);
    if (value.actionLabel.length > 40) errors.push('Action button label must be 40 characters or fewer.');
  }
  if (supplied('actionUrl')) {
    value.actionUrl = cleanText(input.actionUrl, 500);
    if (value.actionUrl.length > 500) errors.push('Action button URL must be 500 characters or fewer.');
    if (!validHttpUrl(value.actionUrl)) errors.push('Action button URL must be a valid HTTP or HTTPS URL.');
  }
  const nextLabel = supplied('actionLabel') ? value.actionLabel : String(page.actionLabel || '');
  const nextUrl = supplied('actionUrl') ? value.actionUrl : String(page.actionUrl || '');
  if (Boolean(nextLabel) !== Boolean(nextUrl)) errors.push('Add both an action button label and URL, or leave both empty.');
  return { valid: errors.length === 0, errors, value };
}

function roleFor(pageRoles = [], pageId, userId) {
  return pageRoles.find(role => role.pageId === pageId && role.userId === userId)?.role || null;
}

export function canManagePage(pageRoles = [], pageId, userId) {
  return ['owner', 'admin', 'editor'].includes(roleFor(pageRoles, pageId, userId));
}

export function canManagePageTeam(pageRoles = [], pageId, userId) {
  return ['owner', 'admin'].includes(roleFor(pageRoles, pageId, userId));
}

export function canViewPageInsights(pageRoles = [], pageId, userId) {
  return ['owner', 'admin', 'analyst'].includes(roleFor(pageRoles, pageId, userId));
}

export function canAssignPageRole(pageRoles = [], pageId, actorId, targetId, nextRole) {
  if (!targetId || !PAGE_TEAM_ROLES.has(nextRole) || actorId === targetId) return false;
  const actorRole = roleFor(pageRoles, pageId, actorId);
  const targetRole = roleFor(pageRoles, pageId, targetId);
  if (!['owner', 'admin'].includes(actorRole) || targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  return ['editor', 'analyst'].includes(nextRole) && targetRole !== 'admin';
}

export function canRemovePageRole(pageRoles = [], pageId, actorId, targetId) {
  if (!targetId || actorId === targetId) return false;
  const actorRole = roleFor(pageRoles, pageId, actorId);
  const targetRole = roleFor(pageRoles, pageId, targetId);
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return Boolean(targetRole);
  return actorRole === 'admin' && ['editor', 'analyst'].includes(targetRole);
}

export function canChangePageRole(pageRoles = [], pageId, actorId, targetId, nextRole) {
  if (!targetId || actorId === targetId || !PAGE_TEAM_ROLES.has(nextRole)) return false;
  const actorRole = roleFor(pageRoles, pageId, actorId);
  const targetRole = roleFor(pageRoles, pageId, targetId);
  if (!['owner', 'admin'].includes(actorRole) || !targetRole || targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  return targetRole !== 'admin' && ['editor', 'analyst'].includes(nextRole);
}

export function canDeletePagePost(pageRoles = [], post, userId) {
  if (!post || !userId) return false;
  if (post.publishedBy === userId) return true;
  return pageRoles.some(role => role.pageId === post.pageId && role.userId === userId &&
    ['owner', 'admin'].includes(role.role));
}

export function canDeletePage(pages = [], pageId, userId) {
  return pages.some(page => page.id === pageId && page.createdBy === userId);
}
