import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export function initialState() {
  const demoId = 'user-demo';
  const friendId = 'user-jordan';
  const groupId = 'group-creators';
  return {
    users: [
      { id: demoId, name: 'Alex Morgan', username: 'alexmorgan', email: 'demo@example.com', passwordHash: '', bio: 'Sharing moments, ideas, and the things that matter.', location: 'Kingston, Jamaica', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&h=160&fit=crop&crop=faces', cover: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&h=420&fit=crop', createdAt: now() },
      { id: friendId, name: 'Jordan Lee', username: 'jordanlee', email: 'jordan@example.com', passwordHash: '', bio: 'Photographer, music lover, always exploring.', location: 'Montego Bay, Jamaica', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces', cover: '', createdAt: now() }
    ],
    posts: [
      { id: uid(), userId: friendId, text: 'A little reminder to slow down, get outside, and enjoy the view. 🌿', imageUrl: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&auto=format&fit=crop', createdAt: now(), reactions: {}, comments: [{ id: uid(), userId: demoId, text: 'Beautiful view!', createdAt: now() }] },
      { id: uid(), userId: demoId, text: 'Welcome to your new community. What are you looking forward to sharing today?', imageUrl: '', createdAt: now(), reactions: {}, comments: [] }
    ],
    friendships: [{ id: uid(), from: demoId, to: friendId, status: 'accepted', createdAt: now() }],
    groups: [{ id: groupId, name: 'Creative Corner', description: 'A welcoming place for artists, makers, and curious minds.', ownerId: friendId, members: [demoId, friendId], createdAt: now() }],
    messages: [{ id: uid(), from: friendId, to: demoId, text: 'Hey! Welcome aboard 👋', createdAt: now(), read: false }],
    notifications: [{ id: uid(), userId: demoId, actorId: friendId, type: 'welcome', text: 'Jordan Lee welcomed you to the community.', createdAt: now(), read: false }],
    sessions: []
  };
}

export function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify(initialState(), null, 2));
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { throw new Error(`Could not parse data store at ${dbPath}; back it up and restore valid JSON.`); }
}
export const db = loadStore();
export function saveStore() { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), { mode: 0o600 }); }
export { uid, now };
