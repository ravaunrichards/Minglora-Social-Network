import { randomUUID } from "node:crypto";

export const LIVE_FAN_CLUB_JOIN_GIFT_CODE = "heart-me-2mk7ob";
export const LIVE_FAN_CLUB_JOIN_COIN_COST = 1;
export const LIVE_FAN_CLUB_ACTIVE_DAYS = 7;
export const LIVE_FAN_CLUB_GIFT_CODES = Object.freeze([
  "heart-me-2mk7ob",
  "community-heart-mg6zzi",
  "blue-heart-19gp9xp",
  "flame-heart-yv4ovw",
  "fan-1avs41e"
]);

export const LIVE_FAN_CLUB_LEVEL_THRESHOLDS = Object.freeze([0, 10, 25, 50, 100, 175, 275, 400, 550, 750]);
export const LIVE_FAN_CLUB_SUPER_FAN_LEVEL = 5;

export function getLiveFanClubProgress(value) {
  const points = Math.max(0, Math.floor(Number(value) || 0));
  let index = 0;
  for (let i = 0; i < LIVE_FAN_CLUB_LEVEL_THRESHOLDS.length; i++) {
    if (points >= LIVE_FAN_CLUB_LEVEL_THRESHOLDS[i]) index = i;
    else break;
  }
  const level = index + 1;
  const currentThreshold = LIVE_FAN_CLUB_LEVEL_THRESHOLDS[index];
  const nextThreshold = LIVE_FAN_CLUB_LEVEL_THRESHOLDS[index + 1] ?? null;
  return {
    level,
    title: level >= LIVE_FAN_CLUB_SUPER_FAN_LEVEL ? "Super Fan" : "Fan",
    isSuperFan: level >= LIVE_FAN_CLUB_SUPER_FAN_LEVEL,
    nextLevel: nextThreshold === null ? null : level + 1,
    pointsToNextLevel: nextThreshold === null ? 0 : Math.max(0, nextThreshold - points),
    progressPercent: nextThreshold === null
      ? 100
      : Math.max(0, Math.min(100, Math.round(((points - currentThreshold) / (nextThreshold - currentThreshold)) * 100)))
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const asDate = value => value instanceof Date ? value : new Date(value || Date.now());
const iso = value => asDate(value).toISOString();

export function ensureLiveFanClubCollections(db) {
  if (!Array.isArray(db.liveFanClubMemberships)) db.liveFanClubMemberships = [];
  if (!Array.isArray(db.liveFanClubEvents)) db.liveFanClubEvents = [];
}

function expireMembership(membership, now) {
  if (membership?.status !== "active") return membership;
  const expiresAt = Date.parse(membership.expiresAt || "");
  if (Number.isFinite(expiresAt) && expiresAt <= asDate(now).getTime()) {
    membership.status = "paused";
    membership.pauseReason = "no_fan_points_within_7_days";
    membership.pausedAt = iso(now);
    membership.updatedAt = iso(now);
  }
  return membership;
}

export function getLiveFanClubMembership(db, hostId, fanId, now = new Date()) {
  ensureLiveFanClubCollections(db);
  const membership = db.liveFanClubMemberships.find(item =>
    item.hostId === String(hostId) && item.fanId === String(fanId)
  ) || null;
  return membership ? expireMembership(membership, now) : null;
}

export function countActiveLiveFanClubMembers(db, hostId, now = new Date()) {
  ensureLiveFanClubCollections(db);
  let count = 0;
  for (const membership of db.liveFanClubMemberships) {
    if (membership.hostId !== String(hostId)) continue;
    expireMembership(membership, now);
    if (membership.status === "active") count++;
  }
  return count;
}

export function joinLiveFanClub(db, {
  hostId, fanId, giftTransactionId, now = new Date()
}) {
  ensureLiveFanClubCollections(db);
  const host = String(hostId || "");
  const fan = String(fanId || "");
  if (!host || !fan || host === fan || !String(giftTransactionId || "").trim()) {
    throw new Error("A confirmed one-Coin Heart Me transaction is required to join this Fan Club.");
  }
  const timestamp = iso(now);
  const current = getLiveFanClubMembership(db, host, fan, now);
  if (current?.status === "active") {
    return { membership: current, alreadyMember: true };
  }
  const membership = current || {
    id: randomUUID(),
    hostId: host,
    fanId: fan,
    joinedAt: timestamp,
    points: 0,
    createdAt: timestamp
  };
  Object.assign(membership, {
    status: "active",
    joinedAt: timestamp,
    lastActivityAt: timestamp,
    lastPointAt: null,
    lastWatchPointAt: null,
    lastChatPointAt: null,
    expiresAt: new Date(asDate(now).getTime() + LIVE_FAN_CLUB_ACTIVE_DAYS * DAY_MS).toISOString(),
    pauseReason: null,
    pausedAt: null,
    lastJoinGiftTransactionId: String(giftTransactionId),
    updatedAt: timestamp
  });
  if (!current) db.liveFanClubMemberships.push(membership);
  return { membership, alreadyMember: false };
}

export function awardLiveFanClubPoints(db, {
  hostId, fanId, points = 1, source, sourceId = "", now = new Date()
}) {
  ensureLiveFanClubCollections(db);
  const membership = getLiveFanClubMembership(db, hostId, fanId, now);
  if (!membership || membership.status !== "active") {
    return { awarded: false, points: 0, membership };
  }
  const kind = String(source || "");
  if (!["watch", "chat", "gift"].includes(kind)) {
    throw new Error("Unsupported Fan Club point source.");
  }
  const id = String(sourceId || "").trim();
  if (id && db.liveFanClubEvents.some(item => item.id === id)) {
    return { awarded: false, points: 0, membership };
  }
  const currentTime = asDate(now).getTime();
  const previousTime = Date.parse(
    kind === "watch" ? membership.lastWatchPointAt || "" :
    kind === "chat" ? membership.lastChatPointAt || "" : ""
  );
  if (kind === "watch" && Number.isFinite(previousTime) && currentTime - previousTime < 5 * 60 * 1000) {
    return { awarded: false, points: 0, membership };
  }
  if (kind === "chat" && Number.isFinite(previousTime) && currentTime - previousTime < 30 * 1000) {
    return { awarded: false, points: 0, membership };
  }
  const amount = kind === "gift"
    ? Math.max(1, Math.min(10000, Math.floor(Number(points) || 0)))
    : 1;
  const timestamp = iso(now);
  membership.points = Math.max(0, Number(membership.points) || 0) + amount;
  membership.lastActivityAt = timestamp;
  membership.lastPointAt = timestamp;
  membership.expiresAt = new Date(currentTime + LIVE_FAN_CLUB_ACTIVE_DAYS * DAY_MS).toISOString();
  if (kind === "watch") membership.lastWatchPointAt = timestamp;
  if (kind === "chat") membership.lastChatPointAt = timestamp;
  membership.updatedAt = timestamp;
  if (id) {
    db.liveFanClubEvents.push({
      id,
      hostId: membership.hostId,
      fanId: membership.fanId,
      source: kind,
      points: amount,
      createdAt: timestamp
    });
  }
  const pruneBefore = currentTime - 30 * DAY_MS;
  db.liveFanClubEvents = db.liveFanClubEvents.filter(item => Date.parse(item.createdAt || "") >= pruneBefore).slice(-20000);
  return { awarded: true, points: amount, membership };
}

export function publicLiveFanClubMembership(db, hostId, fanId, now = new Date()) {
  const membership = getLiveFanClubMembership(db, hostId, fanId, now);
  if (!membership) return null;
  const points = Math.max(0, Number(membership.points) || 0);
  return {
    status: membership.status,
    points,
    ...getLiveFanClubProgress(points),
    joinedAt: membership.joinedAt || null,
    expiresAt: membership.expiresAt || null,
    lastActivityAt: membership.lastActivityAt || null,
    pauseReason: membership.pauseReason || null
  };
}
