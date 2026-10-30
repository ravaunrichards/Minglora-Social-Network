const PAGE_HANDLE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function validatePageInput(input = {}, existingPages = []) {
  const handle = String(input.handle ?? '').trim().toLowerCase();
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const category = String(input.category ?? '').trim();
  const errors = [];
  if (!PAGE_HANDLE.test(handle)) errors.push('Page handle must be 3–30 lowercase letters, numbers, underscores or hyphens, starting with a letter or number.');
  if (title.length < 3 || title.length > 160) errors.push('Page title must be 3–160 characters.');
  if (description.length > 2000) errors.push('Page description must be 2000 characters or fewer.');
  if (category.length > 60) errors.push('Page category must be 60 characters or fewer.');
  if (existingPages.some(page => String(page.handle).toLowerCase() === handle)) errors.push('That Page handle is already taken.');
  return { valid: errors.length === 0, errors, value: { handle, title, description, category } };
}

export function canManagePage(pageRoles = [], pageId, userId) {
  return pageRoles.some(role => role.pageId === pageId && role.userId === userId &&
    ['owner', 'admin', 'editor'].includes(role.role));
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
