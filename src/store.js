import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const dbPath = path.join(dataDir, 'db.json');
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// New installations start empty. No user accounts, posts, messages, groups, or
// notifications are fabricated or inserted when the service starts.
export function initialState() {
  return {
    users: [],
    posts: [],
    friendships: [],
    follows: [],
    blocks: [],
    savedPosts: [],
    groups: [],
    groupPosts: [],
    messages: [],
    notifications: [],
    sessions: []
  };
}

// Remove only the exact sample identities used by previous versions. Existing
// real users and their records are kept. This also cleans related demo content
// from databases that were initialized by an older release.
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
  state.friendships = (state.friendships || []).filter(friendship =>
    !demoUsers.has(friendship.from) && !demoUsers.has(friendship.to));
  state.follows = (state.follows || []).filter(follow => !demoUsers.has(follow.followerId) && !demoUsers.has(follow.followedId));
  state.blocks = (state.blocks || []).filter(block => !demoUsers.has(block.blockerId) && !demoUsers.has(block.blockedId));
  state.savedPosts = (state.savedPosts || []).filter(saved => !demoUsers.has(saved.userId) && !demoPostIds.has(saved.postId));
  const removedGroupIds = new Set((state.groups || []).filter(group => group.id === 'group-creators').map(group => group.id));
  state.groups = (state.groups || [])
    .filter(group => !demoUsers.has(group.ownerId) && group.id !== 'group-creators')
    .map(group => ({ ...group, members: (group.members || []).filter(id => !demoUsers.has(id)) }));
  state.groupPosts = (state.groupPosts || []).filter(post => !demoUsers.has(post.userId) && !removedGroupIds.has(post.groupId));
  state.messages = (state.messages || []).filter(message =>
    !demoUsers.has(message.from) && !demoUsers.has(message.to));
  state.notifications = (state.notifications || []).filter(notification =>
    !demoUsers.has(notification.userId) && !demoUsers.has(notification.actorId));
  state.sessions = (state.sessions || []).filter(session => !demoUsers.has(session.userId));
  return true;
}

export function loadStore() {
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
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error(`Data store at ${dbPath} must contain a JSON object.`);
  }
  let changed = false;
  for (const key of ['users', 'posts', 'friendships', 'follows', 'blocks', 'savedPosts', 'groups', 'groupPosts', 'messages', 'notifications', 'sessions']) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }
  if (stripLegacyDemoData(state)) changed = true;
  if (changed) fs.writeFileSync(dbPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  return state;
}

export const db = loadStore();
export function saveStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), { mode: 0o600 });
}
export { uid, now };
