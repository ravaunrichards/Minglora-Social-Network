const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function encodeCursor(item) {
  if (!item || typeof item.id !== 'string' || !item.id || !item.createdAt || Number.isNaN(new Date(item.createdAt).getTime())) {
    throw new TypeError('Cursor items require a non-empty string id and valid createdAt timestamp.');
  }
  return Buffer.from(JSON.stringify({ id: item.id, createdAt: new Date(item.createdAt).toISOString() })).toString('base64url');
}
export function decodeCursor(cursor) {
  if (cursor == null || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 1024) throw new TypeError('Invalid pagination cursor.');
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id || typeof parsed.createdAt !== 'string' || Number.isNaN(new Date(parsed.createdAt).getTime())) throw new Error();
    return { id: parsed.id, createdAt: new Date(parsed.createdAt).toISOString() };
  } catch { throw new TypeError('Invalid pagination cursor.'); }
}
export function paginateDescending(items, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  const cursor = decodeCursor(options.cursor);
  const sorted = [...items].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return diff || String(b.id).localeCompare(String(a.id));
  });
  const remaining = cursor ? sorted.filter(item => {
    const diff = new Date(item.createdAt).getTime() - new Date(cursor.createdAt).getTime();
    return diff < 0 || (diff === 0 && String(item.id).localeCompare(cursor.id) < 0);
  }) : sorted;
  const page = remaining.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const result = page.slice(0, limit);
  return { items: result, nextCursor: hasMore && result.length ? encodeCursor(result[result.length - 1]) : null, hasMore };
}
