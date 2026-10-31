import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const dbPath = path.join(dataDir, 'db.json');
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const COLLECTIONS = [
  'users', 'posts', 'friendships', 'follows', 'blocks', 'savedPosts', 'mediaAssets',
  'groups', 'groupPosts', 'stories', 'storyViews', 'pages', 'pageRoles',
  'pageFollows', 'pagePosts', 'messages', 'messageConversationHides', 'notifications', 'sessions', 'liveSessions', 'liveParticipants',
  'reports', 'supportTickets', 'supportMessages', 'moderationActions', 'auditLog', 'pendingAuth', 'calls', 'callParticipants', 'dataRightsRequests', 'pushSubscriptions', 'profileViews', 'profileViewPresence'
];

const requestedDriver = String(process.env.PERSISTENCE_DRIVER || '').trim().toLowerCase();
const persistenceDriver = requestedDriver || (process.env.NODE_ENV === 'production' ? 'supabase' : 'json');
if (!['json', 'supabase'].includes(persistenceDriver)) {
  throw new Error('PERSISTENCE_DRIVER must be either "json" or "supabase".');
}

const stateApiUrl = String(process.env.SUPABASE_STATE_API_URL || '').trim().replace(/\/+$/, '');
const stateApiKey = String(process.env.SUPABASE_STATE_API_KEY || '').trim();
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
let supabaseRevision = null;
let saveQueue = Promise.resolve();

export function initialState() {
  return Object.fromEntries(COLLECTIONS.map(key => [key, []]));
}

function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('The persisted application state must be a JSON object.');
  }
  let changed = false;
  for (const key of COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }
  return { state, changed };
}

// Remove only exact legacy sample identities; unrelated member records are kept.
function stripLegacyDemoData(state) {
  const demoUsers = new Set((state.users || [])
    .filter(user =>
      user?.id === 'user-demo' ||
      user?.id === 'user-jordan' ||
      String(user?.email || '').toLowerCase() === 'demo@example.com' ||
      ['alexmorgan', 'jordanlee'].includes(String(user?.username || '').toLowerCase())
    )
    .map(user => user.id));
  if (!demoUsers.size) return false;

  state.users = (state.users || []).filter(user => !demoUsers.has(user.id));
  const demoPostIds = new Set((state.posts || []).filter(post => demoUsers.has(post.userId)).map(post => post.id));
  state.posts = (state.posts || [])
    .filter(post => !demoUsers.has(post.userId))
    .map(post => ({ ...post, comments: (post.comments || []).filter(comment => !demoUsers.has(comment.userId)) }));
  state.friendships = (state.friendships || []).filter(f => !demoUsers.has(f.from) && !demoUsers.has(f.to));
  state.follows = (state.follows || []).filter(f => !demoUsers.has(f.followerId) && !demoUsers.has(f.followedId));
  state.blocks = (state.blocks || []).filter(b => !demoUsers.has(b.blockerId) && !demoUsers.has(b.blockedId));
  state.savedPosts = (state.savedPosts || []).filter(s => !demoUsers.has(s.userId) && !demoPostIds.has(s.postId));
  const removedGroupIds = new Set((state.groups || []).filter(g => g.id === 'group-creators').map(g => g.id));
  state.groups = (state.groups || [])
    .filter(g => !demoUsers.has(g.ownerId) && g.id !== 'group-creators')
    .map(g => ({ ...g, members: (g.members || []).filter(id => !demoUsers.has(id)) }));
  state.groupPosts = (state.groupPosts || []).filter(p => !demoUsers.has(p.userId) && !removedGroupIds.has(p.groupId));
  const removedStoryIds = new Set((state.stories || []).filter(s => demoUsers.has(s.userId)).map(s => s.id));
  state.stories = (state.stories || []).filter(s => !demoUsers.has(s.userId));
  state.storyViews = (state.storyViews || []).filter(v => !demoUsers.has(v.viewerId) && !removedStoryIds.has(v.storyId));
  const removedPageIds = new Set((state.pages || []).filter(p => demoUsers.has(p.createdBy)).map(p => p.id));
  state.pages = (state.pages || []).filter(p => !demoUsers.has(p.createdBy));
  state.pageRoles = (state.pageRoles || []).filter(r => !demoUsers.has(r.userId) && !removedPageIds.has(r.pageId));
  state.pageFollows = (state.pageFollows || []).filter(f => !demoUsers.has(f.userId) && !removedPageIds.has(f.pageId));
  state.pagePosts = (state.pagePosts || []).filter(p => !demoUsers.has(p.publishedBy) && !removedPageIds.has(p.pageId));
  state.messages = (state.messages || []).filter(m => !demoUsers.has(m.from) && !demoUsers.has(m.to));
  state.messageConversationHides = (state.messageConversationHides || []).filter(item => !demoUsers.has(item.userId) && !demoUsers.has(item.peerId));
  state.notifications = (state.notifications || []).filter(n => !demoUsers.has(n.userId) && !demoUsers.has(n.actorId));
  state.sessions = (state.sessions || []).filter(s => !demoUsers.has(s.userId));
  state.profileViews = (state.profileViews || []).filter(view => !demoUsers.has(view.targetUserId) && !demoUsers.has(view.viewerUserId));
  state.profileViewPresence = (state.profileViewPresence || []).filter(view => !demoUsers.has(view.targetUserId) && !demoUsers.has(view.viewerUserId));
  return true;
}

export async function requestSupabaseState(action, extra = {}) {
  // Local JSON-mode tests and development do not call the hosted Supabase gateway.
  // Production requires Supabase persistence and continues through the guarded request below.
  if (persistenceDriver !== 'supabase') return { ok: true, skipped: true };
  if (!stateApiUrl || !stateApiKey || !publishableKey) {
    throw new Error('Supabase persistence requires SUPABASE_STATE_API_URL, SUPABASE_STATE_API_KEY and SUPABASE_PUBLISHABLE_KEY.');
  }

  let response;
  try {
    response = await fetch(stateApiUrl, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'x-minglora-api-key': stateApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...extra })
    });
  } catch {
    throw new Error('Could not reach the Minglora Supabase runtime gateway.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Minglora Supabase persistence request failed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function persistSupabaseState(state) {
  if (!Number.isSafeInteger(supabaseRevision)) {
    throw new Error('Supabase state revision is unavailable; reload the store before saving.');
  }
  const payload = await requestSupabaseState('save', {
    state,
    expectedRevision: supabaseRevision
  });
  if (!Number.isSafeInteger(Number(payload.revision))) {
    throw new Error('Supabase did not return a valid state revision.');
  }
  supabaseRevision = Number(payload.revision);
}

async function loadSupabaseStore() {
  const payload = await requestSupabaseState('load');
  if (!payload.state || !Number.isSafeInteger(Number(payload.revision))) {
    throw new Error('Minglora Supabase state row is missing or invalid.');
  }
  supabaseRevision = Number(payload.revision);
  const normalized = normalizeState(payload.state);
  const cleaned = stripLegacyDemoData(normalized.state);
  if (normalized.changed || cleaned) await persistSupabaseState(normalized.state);
  return normalized.state;
}

function loadJsonStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(initialState(), null, 2), { mode: 0o600 });
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    throw new Error(`Could not parse data store at ${dbPath}; back it up and restore valid JSON.`);
  }
  const normalized = normalizeState(state);
  const cleaned = stripLegacyDemoData(normalized.state);
  if (normalized.changed || cleaned) {
    fs.writeFileSync(dbPath, JSON.stringify(normalized.state, null, 2), { mode: 0o600 });
  }
  return normalized.state;
}

async function loadStore() {
  if (persistenceDriver === 'supabase') return loadSupabaseStore();
  return loadJsonStore();
}

export const db = await loadStore();

export async function saveStore() {
  if (persistenceDriver === 'supabase') {
    const write = () => persistSupabaseState(db);
    saveQueue = saveQueue.then(write, write);
    await saveQueue;
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), { mode: 0o600 });
}

export async function persistenceHealth() {
  if (persistenceDriver === 'json') {
    return { driver: 'json', provider: 'local-file', durable: false, ready: process.env.NODE_ENV !== 'production' };
  }
  try {
    const payload = await requestSupabaseState('health');
    const revision = Number(payload.revision);
    return {
      driver: 'supabase',
      provider: 'minglora-supabase',
      durable: true,
      ready: payload.ok === true && Number.isSafeInteger(revision)
    };
  } catch {
    return { driver: 'supabase', provider: 'minglora-supabase', durable: true, ready: false };
  }
}

export async function closeStore() {
  // Supabase persistence uses HTTPS; there is no app-managed PostgreSQL pool.
}

export { uid, now };
