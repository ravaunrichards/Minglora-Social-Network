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
  'users', 'posts', 'friendships', 'follows', 'blocks', 'savedPosts',
  'groups', 'groupPosts', 'stories', 'storyViews', 'pages', 'pageRoles',
  'pageFollows', 'pagePosts', 'messages', 'notifications', 'sessions', 'liveSessions', 'liveParticipants'
];
const requestedDriver = String(process.env.PERSISTENCE_DRIVER || '').trim().toLowerCase();
const persistenceDriver = requestedDriver || (process.env.DATABASE_URL ? 'postgres' : 'json');
if (!['json', 'postgres'].includes(persistenceDriver)) {
  throw new Error('PERSISTENCE_DRIVER must be either "json" or "postgres".');
}

let pool = null;
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
  state.notifications = (state.notifications || []).filter(n => !demoUsers.has(n.userId) && !demoUsers.has(n.actorId));
  state.sessions = (state.sessions || []).filter(s => !demoUsers.has(s.userId));
  return true;
}

async function connectPostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error('PERSISTENCE_DRIVER=postgres requires DATABASE_URL. Configure a private PostgreSQL connection string before deployment.');
  }
  const pg = await import('pg');
  const Pool = pg.Pool || pg.default?.Pool;
  if (!Pool) throw new Error('The pg package did not expose a PostgreSQL Pool constructor.');
  const sslMode = String(process.env.PGSSLMODE || '').toLowerCase();
  const ssl = sslMode === 'disable'
    ? false
    : (sslMode === 'require' || process.env.NODE_ENV === 'production')
      ? { rejectUnauthorized: true }
      : undefined;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Math.max(1, Math.min(10, Number(process.env.PG_POOL_MAX || 5))),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ...(ssl === undefined ? {} : { ssl })
  });
  pool.on('error', error => console.error('Minglora PostgreSQL pool error:', error.message));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.minglora_runtime_state (
      state_key text PRIMARY KEY CHECK (state_key = 'primary'),
      state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
      revision bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE public.minglora_runtime_state ENABLE ROW LEVEL SECURITY;
    REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state FROM PUBLIC;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.minglora_runtime_state FROM authenticated';
      END IF;
    END
    $$;
  `);
  await pool.query(
    `INSERT INTO public.minglora_runtime_state (state_key, state)
     VALUES ('primary', $1::jsonb)
     ON CONFLICT (state_key) DO NOTHING`,
    [JSON.stringify(initialState())]
  );
}

async function persistPostgresState(state) {
  const snapshot = JSON.stringify(state);
  const write = () => pool.query(
    `UPDATE public.minglora_runtime_state
     SET state = $1::jsonb, revision = revision + 1, updated_at = now()
     WHERE state_key = 'primary'`,
    [snapshot]
  ).then(result => {
    if (result.rowCount !== 1) throw new Error('Minglora PostgreSQL state row is missing.');
  });
  saveQueue = saveQueue.then(write, write);
  await saveQueue;
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

async function loadPostgresStore() {
  await connectPostgres();
  const result = await pool.query(
    `SELECT state FROM public.minglora_runtime_state WHERE state_key = 'primary' LIMIT 1`
  );
  if (!result.rows[0]) throw new Error('Minglora PostgreSQL state row was not initialized.');
  const normalized = normalizeState(result.rows[0].state);
  const cleaned = stripLegacyDemoData(normalized.state);
  if (normalized.changed || cleaned) await persistPostgresState(normalized.state);
  return normalized.state;
}

async function loadStore() {
  return persistenceDriver === 'postgres' ? loadPostgresStore() : loadJsonStore();
}

export const db = await loadStore();

export async function saveStore() {
  if (persistenceDriver === 'postgres') {
    await persistPostgresState(db);
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), { mode: 0o600 });
}

export async function persistenceHealth() {
  if (!pool) {
    return { driver: 'json', durable: false, ready: process.env.NODE_ENV !== 'production' };
  }
  try {
    await pool.query('SELECT 1');
    return { driver: 'postgres', durable: true, ready: true };
  } catch {
    return { driver: 'postgres', durable: true, ready: false };
  }
}

export async function closeStore() {
  if (pool) await pool.end();
}

export { uid, now };
