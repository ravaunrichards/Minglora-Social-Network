import { randomUUID } from "node:crypto";

export const CREATOR_LEAGUE_CLASSES = Object.freeze([
  "D5", "D4", "D3", "D2", "D1", "C5", "C4", "C3", "C2", "C1",
  "B5", "B4", "B3", "B2", "B1", "A3", "A2", "A1"
]);
export const MATCH_RANKS = Object.freeze([
  "Bronze III", "Bronze II", "Bronze I",
  "Silver III", "Silver II", "Silver I",
  "Gold IV", "Gold III", "Gold II", "Gold I",
  "Platinum IV", "Platinum III", "Platinum II", "Platinum I",
  "Diamond IV", "Diamond III", "Diamond II", "Diamond I",
  "Heroic", "Master", "Grandmaster"
]);
export const MATCH_POWERUPS = Object.freeze([
  { id: "momentum_boost", name: "Momentum Boost", symbol: "⚡", durationMs: 30000, multiplier: 1.25, description: "25% extra eligible match points for 30 seconds." },
  { id: "shield", name: "Shield", symbol: "🛡️", durationMs: 30000, description: "Blocks the next opposing Momentum Boost or Score Multiplier bonus for 30 seconds. Base Gift points still count." },
  { id: "time_boost", name: "Time Boost", symbol: "⏳", durationMs: 30000, description: "Adds 30 seconds in flexible-timer matches only." },
  { id: "score_multiplier", name: "Score Multiplier", symbol: "⭐", durationMs: 15000, multiplier: 2, description: "Doubles eligible match points for 15 seconds only." }
]);

const COLLECTIONS = [
  "creatorLeagueProfiles", "creatorLeagueGiftLedger", "creatorLeagueDailyScores",
  "creatorLeagueDailySettlements", "creatorLeagueMatches", "creatorLeaguePowerupUses",
  "creatorLeagueEvents"
];

const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const recordTime = record => {
  const value = Date.parse(record?.updatedAt || record?.completedAt || record?.startedAt || record?.createdAt || "");
  return Number.isFinite(value) ? value : 0;
};
function uniqueRecords(records, keyFor, merge = current => current) {
  const unique = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== "object") continue;
    const key = keyFor(record);
    if (!key) continue;
    const current = unique.get(key);
    unique.set(key, current ? merge(current, record) : record);
  }
  return [...unique.values()];
}
function mergeProfileRecords(current, incoming) {
  const preferred = recordTime(incoming) > recordTime(current) ? incoming : current;
  const merged = { ...(preferred === current ? incoming : current), ...preferred };
  for (const key of ["lifetimeGiftPoints", "matchWins", "matchLosses", "matchDraws"]) {
    merged[key] = Math.max(asNumber(current[key]), asNumber(incoming[key]));
  }
  if (current.seasonKey === incoming.seasonKey) {
    merged.seasonPoints = Math.max(asNumber(current.seasonPoints), asNumber(incoming.seasonPoints));
  }
  return merged;
}
function uniqueMatchEffects(effects) {
  return uniqueRecords(effects, item =>
    item?.type && item?.side ? [item.type, item.side].join(":") : item?.id,
    (current, incoming) => {
      const currentExpiry = Date.parse(current.expiresAt || "") || 0;
      const incomingExpiry = Date.parse(incoming.expiresAt || "") || 0;
      return incomingExpiry > currentExpiry ? incoming : current;
    }
  );
}
function uniqueMatchEvents(events) {
  return uniqueRecords(events, item => {
    if (item.type === "gift_score" && item.giftId) return "gift:" + item.giftId;
    if (item.type === "shield_blocked_bonus" && item.giftId) return "shield_block:" + item.giftId;
    if (item.type === "viewer_support" && item.userId) return "support:" + item.userId;
    if (["shield_used", "time_boost_used", "score_effect_used"].includes(item.type) && item.side) {
      return [item.type, item.side, item.powerupId || ""].join(":");
    }
    return item.id || [item.type, item.side, item.userId, item.giftId, item.createdAt].join(":");
  }, (current, incoming) => recordTime(incoming) > recordTime(current) ? incoming : current);
}
function normalizeMatch(match) {
  const storedScores = match.scores || {};
  match.supporters = uniqueRecords(match.supporters, item => item.userId, current => current);
  match.activeEffects = uniqueMatchEffects(match.activeEffects);
  match.pendingEffects = uniqueMatchEffects(match.pendingEffects);
  match.events = uniqueMatchEvents(match.events);
  match.scores = {
    challenger: Math.max(0, asNumber(storedScores.challenger)),
    opponent: Math.max(0, asNumber(storedScores.opponent))
  };
  for (const side of ["challenger", "opponent"]) {
    const scoreEvents = match.events.filter(item =>
      item.side === side && ["gift_score", "viewer_support"].includes(item.type)
    );
    if (scoreEvents.length) {
      match.scores[side] = Math.max(0, scoreEvents.reduce((total, item) =>
        total + (item.type === "viewer_support" && !Number.isFinite(Number(item.matchPoints))
          ? 3 : asNumber(item.matchPoints)), 0));
    }
  }
  match.timeBoostUsed = {
    challenger: Boolean(match.timeBoostUsed?.challenger),
    opponent: Boolean(match.timeBoostUsed?.opponent)
  };
  return match;
}
function mergeMatchRecords(current, incoming) {
  // Terminal states always beat stale active snapshots so refresh/dedupe cannot
  // accidentally resurrect a match after it has completed or expired.
  const priority = { completed: 4, expired: 3, live: 2, pending: 1 };
  const currentTime = recordTime(current);
  const incomingTime = recordTime(incoming);
  const preferred = (priority[incoming.status] || 0) > (priority[current.status] || 0) ||
    ((priority[incoming.status] || 0) === (priority[current.status] || 0) && incomingTime > currentTime)
    ? incoming : current;
  const merged = { ...(preferred === current ? incoming : current), ...preferred };
  const challengerScores = [];
  const opponentScores = [];
  for (const item of [current, incoming]) {
    const sameOrientation = item.challengerId === preferred.challengerId && item.opponentId === preferred.opponentId;
    challengerScores.push(asNumber(item.scores?.[sameOrientation ? "challenger" : "opponent"]));
    opponentScores.push(asNumber(item.scores?.[sameOrientation ? "opponent" : "challenger"]));
  }
  merged.scores = {
    challenger: Math.max(...challengerScores),
    opponent: Math.max(...opponentScores)
  };
  merged.supporters = uniqueRecords([...(preferred.supporters || []), ...((preferred === current ? incoming : current).supporters || [])], item => item.userId);
  merged.events = uniqueMatchEvents([...(preferred.events || []), ...((preferred === current ? incoming : current).events || [])]);
  merged.activeEffects = uniqueMatchEffects([...(preferred.activeEffects || []), ...((preferred === current ? incoming : current).activeEffects || [])]);
  merged.pendingEffects = uniqueMatchEffects([...(preferred.pendingEffects || []), ...((preferred === current ? incoming : current).pendingEffects || [])]);
  merged.timeBoostUsed = {
    challenger: Boolean(current.timeBoostUsed?.challenger || incoming.timeBoostUsed?.challenger),
    opponent: Boolean(current.timeBoostUsed?.opponent || incoming.timeBoostUsed?.opponent)
  };
  merged.ratingAwarded = Boolean(current.ratingAwarded || incoming.ratingAwarded);
  return normalizeMatch(merged);
}
function compactMatches(matches) {
  const byId = uniqueRecords(matches, match => match.id ? "id:" + match.id : null, mergeMatchRecords);
  return uniqueRecords(byId, match => {
    if (["pending", "live"].includes(match.status) && match.challengerId && match.opponentId) {
      return "active:" + [String(match.challengerId), String(match.opponentId)].sort().join("|");
    }
    return match.id ? "id:" + match.id : null;
  }, mergeMatchRecords);
}
const ensureCollections = db => {
  for (const name of COLLECTIONS) if (!Array.isArray(db[name])) db[name] = [];
  db.creatorLeagueProfiles = uniqueRecords(db.creatorLeagueProfiles, item => item.userId, mergeProfileRecords);
  db.creatorLeagueGiftLedger = uniqueRecords(db.creatorLeagueGiftLedger, item => item.giftId || item.id);

  // The unique confirmed-gift ledger is the source of truth for League points.
  // Rebuild daily/lifetime totals from it so duplicate snapshots cannot inflate
  // scores and concurrent snapshots cannot lose independent confirmed Gifts.
  const dailyGiftTotals = new Map();
  const lifetimeGiftTotals = new Map();
  const seasonGiftTotals = new Map();
  const dailyGiftKeys = new Set();
  const lifetimeGiftUsers = new Set();
  const seasonGiftKeys = new Set();
  for (const gift of db.creatorLeagueGiftLedger) {
    const amount = asNumber(gift.coinAmount);
    if (!gift.userId || !gift.dayKey || amount <= 0) continue;
    const dailyKey = String(gift.userId) + "\u0000" + String(gift.dayKey);
    dailyGiftKeys.add(dailyKey);
    lifetimeGiftUsers.add(gift.userId);
    if (gift.seasonKey) seasonGiftKeys.add(String(gift.userId) + "\u0000" + String(gift.seasonKey));
    if (gift.refundedAt || gift.status === "refunded") continue;
    dailyGiftTotals.set(dailyKey, (dailyGiftTotals.get(dailyKey) || 0) + amount);
    lifetimeGiftTotals.set(gift.userId, (lifetimeGiftTotals.get(gift.userId) || 0) + amount);
    if (gift.seasonKey) {
      const seasonKey = String(gift.userId) + "\u0000" + String(gift.seasonKey);
      seasonGiftTotals.set(seasonKey, (seasonGiftTotals.get(seasonKey) || 0) + amount);
    }
  }
  db.creatorLeagueDailyScores = uniqueRecords(
    db.creatorLeagueDailyScores,
    item => item.userId && item.dayKey ? String(item.userId) + "\u0000" + String(item.dayKey) : null,
    (current, incoming) => {
      const preferred = recordTime(incoming) > recordTime(current) ? incoming : current;
      return { ...(preferred === current ? incoming : current), ...preferred, points: Math.max(asNumber(current.points), asNumber(incoming.points)) };
    }
  );
  const existingDailyKeys = new Set();
  for (const daily of db.creatorLeagueDailyScores) {
    const key = String(daily.userId) + "\u0000" + String(daily.dayKey);
    // Reconcile days that had a gift event, even when every gift for the day
    // has since been refunded. Leave independently-scored days untouched.
    if (dailyGiftKeys.has(key)) daily.points = dailyGiftTotals.get(key) || 0;
    existingDailyKeys.add(key);
  }
  for (const [key, points] of dailyGiftTotals) {
    if (existingDailyKeys.has(key)) continue;
    const [userId, dayKey] = key.split("\u0000");
    db.creatorLeagueDailyScores.push({ id: randomUUID(), userId, dayKey, points });
  }
  for (const profile of db.creatorLeagueProfiles) {
    if (lifetimeGiftUsers.has(profile.userId)) {
      profile.lifetimeGiftPoints = lifetimeGiftTotals.get(profile.userId) || 0;
    }
    const seasonKey = String(profile.userId) + "\u0000" + String(profile.seasonKey || "");
    if (seasonGiftKeys.has(seasonKey)) profile.seasonPoints = seasonGiftTotals.get(seasonKey) || 0;
  }
  db.creatorLeagueDailySettlements = uniqueRecords(db.creatorLeagueDailySettlements, item => item.dayKey);
  db.creatorLeaguePowerupUses = uniqueRecords(db.creatorLeaguePowerupUses, item =>
    item.userId && item.powerupId && item.dayKey ? [item.userId, item.powerupId, item.dayKey].join(":") : item.id
  );
  db.creatorLeagueEvents = uniqueRecords(db.creatorLeagueEvents, item => item.id);
  db.creatorLeagueMatches = compactMatches(db.creatorLeagueMatches).map(normalizeMatch);
};
export const utcDayKey = value => new Date(value || Date.now()).toISOString().slice(0, 10);
export function creatorLeagueSeasonKey(value = new Date()) {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return utcDayKey(date);
}
function seasonEndsAt(value = new Date()) {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 8);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}
function event(db, userId, type, details, now = new Date()) {
  db.creatorLeagueEvents.push({ id: randomUUID(), userId, type, details, createdAt: now.toISOString() });
}

/**
 * Reverse a refunded LIVE Gift without deleting its audit record. The entry
 * remains visible to internal audits but never contributes to League scoring.
 */
export function refundCreatorLeagueGift(db, giftId, now = new Date()) {
  ensureCollections(db);
  const id = String(giftId || "");
  if (!id) return { reversed: false, reason: "invalid_gift_id" };
  const gift = db.creatorLeagueGiftLedger.find(item => item.giftId === id);
  if (!gift) return { reversed: false, reason: "gift_not_found" };
  if (gift.refundedAt || gift.status === "refunded") {
    return { reversed: false, reason: "already_refunded", userId: gift.userId };
  }

  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  gift.refundedAt = timestamp;
  gift.status = "refunded";

  for (const match of db.creatorLeagueMatches) {
    const before = Array.isArray(match.events) ? match.events.length : 0;
    match.events = (match.events || []).filter(item =>
      !(item.giftId === id && ["gift_score", "shield_blocked_bonus"].includes(item.type))
    );
    if (match.events.length !== before) {
      match.scores ||= { challenger: 0, opponent: 0 };
      for (const side of ["challenger", "opponent"]) {
        match.scores[side] = match.events
          .filter(item => item.side === side && ["gift_score", "viewer_support"].includes(item.type))
          .reduce((total, item) => total + (item.type === "viewer_support" && !Number.isFinite(Number(item.matchPoints))
            ? 3 : asNumber(item.matchPoints)), 0);
      }
      match.updatedAt = timestamp;
      normalizeMatch(match);
    }
  }

  event(db, gift.userId, "gift_refunded", {
    giftId: id, coinAmount: asNumber(gift.coinAmount), giftCode: String(gift.giftCode || "")
  }, new Date(timestamp));
  ensureCollections(db);
  return { reversed: true, userId: gift.userId, coinAmount: asNumber(gift.coinAmount) };
}
export function ensureCreatorLeagueProfile(db, userId, region = "GLOBAL", now = new Date()) {
  ensureCollections(db);
  const seasonKey = creatorLeagueSeasonKey(now);
  let profile = db.creatorLeagueProfiles.find(item => item.userId === userId);
  if (!profile) {
    profile = {
      userId, region: String(region || "GLOBAL").trim().toUpperCase() || "GLOBAL",
      leagueClass: "D5", fragments: 0, leagueShields: 0,
      lifetimeGiftPoints: 0, seasonPoints: 0, seasonKey,
      matchRankIndex: 0, matchRankPoints: 0,
      matchWins: 0, matchLosses: 0, matchDraws: 0,
      createdAt: now.toISOString(), updatedAt: now.toISOString()
    };
    db.creatorLeagueProfiles.push(profile);
  } else {
    if (!CREATOR_LEAGUE_CLASSES.includes(profile.leagueClass)) profile.leagueClass = "D5";
    if (!Number.isInteger(profile.matchRankIndex) || profile.matchRankIndex < 0 || profile.matchRankIndex >= MATCH_RANKS.length) profile.matchRankIndex = 0;
    if (!Number.isInteger(profile.fragments) || profile.fragments < 0) profile.fragments = 0;
    if (!Number.isInteger(profile.leagueShields) || profile.leagueShields < 0) profile.leagueShields = 0;
    if (profile.seasonKey !== seasonKey) { profile.seasonKey = seasonKey; profile.seasonPoints = 0; }
    if (!profile.region) profile.region = String(region || "GLOBAL").trim().toUpperCase() || "GLOBAL";
    profile.updatedAt = now.toISOString();
  }
  return profile;
}
function applyClassMovement(profile, direction, db, now) {
  const index = CREATOR_LEAGUE_CLASSES.indexOf(profile.leagueClass);
  if (direction > 0 && index < CREATOR_LEAGUE_CLASSES.length - 1) {
    profile.fragments += 1;
    if (profile.fragments >= 4) {
      const from = profile.leagueClass;
      profile.leagueClass = CREATOR_LEAGUE_CLASSES[index + 1];
      profile.fragments = 0;
      profile.leagueShields = Math.min(3, profile.leagueShields + 1);
      event(db, profile.userId, "creator_promotion", { from, to: profile.leagueClass, shieldEarned: true }, now);
    }
  } else if (direction < 0 && index > 0) {
    if (profile.fragments > 0) profile.fragments -= 1;
    else if (profile.leagueShields > 0) {
      profile.leagueShields -= 1;
      event(db, profile.userId, "league_shield_used", { leagueClass: profile.leagueClass }, now);
    } else {
      const from = profile.leagueClass;
      profile.leagueClass = CREATOR_LEAGUE_CLASSES[index - 1];
      profile.fragments = 0;
      event(db, profile.userId, "creator_demotion", { from, to: profile.leagueClass }, now);
    }
  }
  profile.updatedAt = now.toISOString();
}
export function settleCreatorLeagueDay(db, dayKey, now = new Date()) {
  ensureCollections(db);
  if (db.creatorLeagueDailySettlements.some(item => item.dayKey === dayKey)) return { settled: false, reason: "already_settled" };
  const points = new Map();
  for (const score of db.creatorLeagueDailyScores.filter(item => item.dayKey === dayKey && Number(item.points) > 0)) {
    points.set(score.userId, (points.get(score.userId) || 0) + Number(score.points));
  }
  // Every enrolled creator in the same region/class is part of that day's
  // standings. A creator who receives no eligible LIVE Gifts scores zero;
  // omitting zero-score creators can prevent a gifting creator from advancing
  // simply because they are the only member who received Gifts that day.
  const profiles = db.creatorLeagueProfiles.filter(profile => profile?.userId);
  const buckets = new Map();
  for (const profile of profiles) {
    const key = (profile.region || "GLOBAL") + ":" + profile.leagueClass;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ profile, points: points.get(profile.userId) || 0 });
  }
  let moved = 0;
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => b.points - a.points || a.profile.userId.localeCompare(b.profile.userId));
    const slots = Math.max(1, Math.ceil(members.length * 0.2));
    const promotionBoundary = members[slots - 1].points;
    const demotionBoundary = members[members.length - slots].points;
    const promoted = new Set(members.filter(item => item.points >= promotionBoundary).map(item => item.profile.userId));
    const demoted = new Set(members.filter(item => item.points <= demotionBoundary).map(item => item.profile.userId));
    for (const item of members) {
      // A score tied across both cutoffs is neutral rather than arbitrarily moved.
      if (promoted.has(item.profile.userId) && demoted.has(item.profile.userId)) continue;
      if (promoted.has(item.profile.userId)) { applyClassMovement(item.profile, 1, db, now); moved += 1; }
      else if (demoted.has(item.profile.userId)) { applyClassMovement(item.profile, -1, db, now); moved += 1; }
    }
  }
  db.creatorLeagueDailySettlements.push({
    id: randomUUID(), dayKey, settledAt: now.toISOString(),
    activeCreators: profiles.length, placementsProcessed: moved
  });
  return { settled: true, activeCreators: profiles.length, placementsProcessed: moved };
}
function settlePastDays(db, now) {
  const today = utcDayKey(now);
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - offset);
    const key = utcDayKey(day);
    if (key !== today && !db.creatorLeagueDailySettlements.some(item => item.dayKey === key)) settleCreatorLeagueDay(db, key, now);
  }
}

/**
 * Scheduled reconciliation for every creator league profile.
 *
 * Daily placements run once per completed UTC day, even when nobody opens
 * League Arena. Gift ledger values remain authoritative: refunds are excluded
 * and weekly points are rebuilt from the current season's ledger rows.
 */
export function settleScheduledCreatorLeagueDays(db, now = new Date()) {
  ensureCollections(db);

  // Give every account a persisted starting class, even before their first
  // LIVE Gift or first visit to League Arena.
  const knownProfileIds = new Set(db.creatorLeagueProfiles.map(profile => profile.userId));
  let profilesCreated = 0;
  const seasonKeyForNewProfiles = creatorLeagueSeasonKey(now);
  const initializedAt = now.toISOString();
  for (const user of db.users || []) {
    if (!user?.id || knownProfileIds.has(user.id)) continue;
    db.creatorLeagueProfiles.push({
      userId: user.id,
      region: String(user.country || user.region || "GLOBAL").trim().toUpperCase() || "GLOBAL",
      leagueClass: "D5",
      fragments: 0,
      leagueShields: 0,
      lifetimeGiftPoints: 0,
      seasonPoints: 0,
      seasonKey: seasonKeyForNewProfiles,
      matchRankIndex: 0,
      matchRankPoints: 0,
      matchWins: 0,
      matchLosses: 0,
      matchDraws: 0,
      createdAt: initializedAt,
      updatedAt: initializedAt
    });
    knownProfileIds.add(user.id);
    profilesCreated += 1;
  }

  const today = utcDayKey(now);
  const pendingDays = [...new Set(db.creatorLeagueDailyScores
    .filter(item => item.dayKey && item.dayKey < today)
    .map(item => String(item.dayKey)))]
    .filter(dayKey => !db.creatorLeagueDailySettlements.some(item => item.dayKey === dayKey))
    .sort();

  let placementsProcessed = 0;
  const settledDays = [];
  for (const dayKey of pendingDays) {
    const result = settleCreatorLeagueDay(db, dayKey, now);
    if (!result.settled) continue;
    settledDays.push(dayKey);
    placementsProcessed += Number(result.placementsProcessed || 0);
  }

  const seasonKey = creatorLeagueSeasonKey(now);
  const lifetimeTotals = new Map();
  const seasonTotals = new Map();
  for (const gift of db.creatorLeagueGiftLedger) {
    if (gift.refundedAt || gift.status === "refunded" || !gift.userId) continue;
    const amount = Math.max(0, asNumber(gift.coinAmount));
    if (!amount) continue;
    lifetimeTotals.set(gift.userId, (lifetimeTotals.get(gift.userId) || 0) + amount);
    if (gift.seasonKey === seasonKey) {
      seasonTotals.set(gift.userId, (seasonTotals.get(gift.userId) || 0) + amount);
    }
  }

  let profilesUpdated = 0;
  for (const profile of db.creatorLeagueProfiles) {
    const lifetimeGiftPoints = lifetimeTotals.get(profile.userId) || 0;
    const seasonPoints = seasonTotals.get(profile.userId) || 0;
    const needsUpdate = profile.seasonKey !== seasonKey ||
      asNumber(profile.seasonPoints) !== seasonPoints ||
      asNumber(profile.lifetimeGiftPoints) !== lifetimeGiftPoints;
    if (!needsUpdate) continue;
    profile.seasonKey = seasonKey;
    profile.seasonPoints = seasonPoints;
    profile.lifetimeGiftPoints = lifetimeGiftPoints;
    profile.updatedAt = now.toISOString();
    profilesUpdated += 1;
  }

  return {
    changed: settledDays.length > 0 || profilesUpdated > 0 || profilesCreated > 0,
    settledDays,
    placementsProcessed,
    profilesUpdated,
    profilesCreated,
    seasonKey
  };
}
function applyMatchRating(db, userId, delta, now) {
  const profile = ensureCreatorLeagueProfile(db, userId, "GLOBAL", now);
  const before = MATCH_RANKS[profile.matchRankIndex];
  profile.matchRankPoints += delta;
  while (profile.matchRankPoints >= 100 && profile.matchRankIndex < MATCH_RANKS.length - 1) {
    profile.matchRankPoints -= 100;
    profile.matchRankIndex += 1;
  }
  while (profile.matchRankPoints < 0 && profile.matchRankIndex > 0) {
    profile.matchRankIndex -= 1;
    profile.matchRankPoints = Math.max(0, 85 + profile.matchRankPoints);
  }
  profile.matchRankPoints = Math.max(0, Math.min(99, profile.matchRankPoints));
  const after = MATCH_RANKS[profile.matchRankIndex];
  if (before !== after) event(db, userId, "match_rank_change", { from: before, to: after, delta }, now);
  profile.updatedAt = now.toISOString();
}
function finishMatch(db, match, now) {
  if (!match || match.status !== "live" || match.ratingAwarded) return false;
  match.status = "completed";
  match.completedAt = now.toISOString();
  const challenger = Number(match.scores.challenger || 0);
  const opponent = Number(match.scores.opponent || 0);
  if (challenger === opponent) {
    match.result = "draw"; match.winnerId = null;
    applyMatchRating(db, match.challengerId, 5, now);
    applyMatchRating(db, match.opponentId, 5, now);
    ensureCreatorLeagueProfile(db, match.challengerId, "GLOBAL", now).matchDraws += 1;
    ensureCreatorLeagueProfile(db, match.opponentId, "GLOBAL", now).matchDraws += 1;
  } else {
    const winnerId = challenger > opponent ? match.challengerId : match.opponentId;
    const loserId = winnerId === match.challengerId ? match.opponentId : match.challengerId;
    match.result = "win"; match.winnerId = winnerId;
    applyMatchRating(db, winnerId, 25, now);
    applyMatchRating(db, loserId, -15, now);
    ensureCreatorLeagueProfile(db, winnerId, "GLOBAL", now).matchWins += 1;
    ensureCreatorLeagueProfile(db, loserId, "GLOBAL", now).matchLosses += 1;
  }
  match.ratingAwarded = true;
  event(db, match.challengerId, "match_completed", { matchId: match.id, result: match.result, winnerId: match.winnerId, score: challenger + "-" + opponent }, now);
  event(db, match.opponentId, "match_completed", { matchId: match.id, result: match.result, winnerId: match.winnerId, score: opponent + "-" + challenger }, now);
  return true;
}
export function settleExpiredLeagueMatches(db, now = new Date()) {
  ensureCollections(db);
  let completed = 0;
  for (const match of db.creatorLeagueMatches) {
    if (match.status === "live" && new Date(match.endsAt).getTime() <= now.getTime() && finishMatch(db, match, now)) completed += 1;
    if (match.status === "pending" && new Date(match.expiresAt).getTime() <= now.getTime()) {
      match.status = "expired"; match.completedAt = now.toISOString();
    }
  }
  return completed;
}
export function recordLiveGiftForLeagues(db, details) {
  ensureCollections(db);
  const now = details.now || new Date();
  settleExpiredLeagueMatches(db, now);
  const giftId = String(details.giftId || "");
  const amount = Number(details.coinAmount);
  if (!giftId || !Number.isSafeInteger(amount) || amount <= 0) return { recorded: false, reason: "unconfirmed_gift" };
  if (db.creatorLeagueGiftLedger.some(item => item.giftId === giftId)) return { recorded: false, reason: "duplicate_transaction" };
  const profile = ensureCreatorLeagueProfile(db, details.recipientId, details.region || "GLOBAL", now);
  const dayKey = utcDayKey(now);
  const seasonKey = creatorLeagueSeasonKey(now);
  db.creatorLeagueGiftLedger.push({
    id: randomUUID(), giftId, userId: details.recipientId,
    broadcastId: String(details.broadcastId || ""), giftCode: String(details.giftCode || ""),
    coinAmount: amount, dayKey, seasonKey, createdAt: now.toISOString()
  });
  let daily = db.creatorLeagueDailyScores.find(item => item.userId === details.recipientId && item.dayKey === dayKey);
  if (!daily) { daily = { id: randomUUID(), userId: details.recipientId, dayKey, points: 0 }; db.creatorLeagueDailyScores.push(daily); }
  daily.points += amount;
  profile.lifetimeGiftPoints += amount;
  if (profile.seasonKey !== seasonKey) { profile.seasonKey = seasonKey; profile.seasonPoints = 0; }
  profile.seasonPoints += amount;
  profile.updatedAt = now.toISOString();

  const match = db.creatorLeagueMatches.find(item => item.status === "live" &&
    (item.challengerSessionId === details.broadcastId || item.opponentSessionId === details.broadcastId));
  let matchPoints = 0;
  if (match) {
    const side = match.challengerSessionId === details.broadcastId ? "challenger" : "opponent";
    const matchesGift = match.giftMode !== "specific" || match.selectedGiftCode === details.giftCode;
    if (matchesGift && new Date(match.startedAt).getTime() <= now.getTime() && new Date(match.endsAt).getTime() > now.getTime()) {
      match.activeEffects = (match.activeEffects || []).filter(item => new Date(item.expiresAt).getTime() > now.getTime());
      const effects = match.activeEffects.filter(item => item.side === side && item.type !== "shield");
      let multiplier = effects.reduce((best, item) => Math.max(best, Number(item.multiplier || 1)), 1);
      const protectedSide = side === "challenger" ? "opponent" : "challenger";
      const shieldIndex = match.activeEffects.findIndex(item => item.type === "shield" && item.side === protectedSide);
      let shieldBlockedBonus = false;
      if (shieldIndex >= 0 && multiplier > 1) {
        match.activeEffects.splice(shieldIndex, 1);
        multiplier = 1;
        shieldBlockedBonus = true;
        match.events.push({ id: randomUUID(), type: "shield_blocked_bonus", side: protectedSide, protectedFrom: side, giftId, blockedMultiplier: true, createdAt: now.toISOString() });
      }
      matchPoints = Math.round(amount * multiplier);
      match.scores[side] = Number(match.scores[side] || 0) + matchPoints;
      match.events.push({ id: randomUUID(), type: "gift_score", side, giftId, rawPoints: amount, matchPoints, multiplier, shieldBlockedBonus, createdAt: now.toISOString() });
    }
  }
  return { recorded: true, creatorLeaguePoints: amount, matchPoints, matchId: match ? match.id : null };
}
export function createCreatorLeagueMatch(db, input) {
  ensureCollections(db);
  const now = input.now || new Date();
  settleExpiredLeagueMatches(db, now);
  if (!input.challengerId || !input.opponentId || input.challengerId === input.opponentId) throw Object.assign(new Error("Choose two different creators for this League Match."), { status: 400 });
  if (!input.challengerSessionId || !input.opponentSessionId || input.challengerSessionId === input.opponentSessionId) {
    throw Object.assign(new Error("Choose two different active LIVE sessions for this League Match."), { status: 400 });
  }
  if (!["all", "specific"].includes(input.giftMode)) throw Object.assign(new Error("Choose all Gifts or a specific Gift scoring mode."), { status: 400 });
  if (input.giftMode === "specific" && !/^[a-z0-9_-]{1,60}$/i.test(input.selectedGiftCode || "")) throw Object.assign(new Error("Choose a valid Gift for this match."), { status: 400 });
  const busy = db.creatorLeagueMatches.find(match => ["pending", "live"].includes(match.status) &&
    [match.challengerId, match.opponentId].some(id => id === input.challengerId || id === input.opponentId));
  if (busy) throw Object.assign(new Error("One of these creators already has a pending or active League Match."), { status: 409 });
  const match = {
    id: input.id || randomUUID(), challengerId: input.challengerId, opponentId: input.opponentId,
    challengerSessionId: input.challengerSessionId, opponentSessionId: input.opponentSessionId,
    giftMode: input.giftMode, selectedGiftCode: input.giftMode === "specific" ? input.selectedGiftCode : null,
    status: "pending", scores: { challenger: 0, opponent: 0 }, supporters: [],
    activeEffects: [], pendingEffects: [], events: [],
    timeBoostUsed: { challenger: false, opponent: false }, timerMode: "flexible",
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString()
  };
  db.creatorLeagueMatches.push(match);
  event(db, input.challengerId, "match_challenge_sent", { matchId: match.id, opponentId: input.opponentId }, now);
  event(db, input.opponentId, "match_challenge_received", { matchId: match.id, challengerId: input.challengerId }, now);
  return match;
}
function resolveCanonicalMatch(db, match) {
  if (!match?.id) return match;
  return (db.creatorLeagueMatches || []).find(item => item.id === match.id) || match;
}
export function acceptCreatorLeagueMatch(db, match, userId, now = new Date()) {
  settleExpiredLeagueMatches(db, now);
  match = resolveCanonicalMatch(db, match);
  if (!match || match.status !== "pending") throw Object.assign(new Error("This League Match invitation is no longer available."), { status: 404 });
  if (match.opponentId !== userId) throw Object.assign(new Error("Only the invited creator can accept this match."), { status: 403 });
  if (new Date(match.expiresAt).getTime() <= now.getTime()) { match.status = "expired"; throw Object.assign(new Error("This League Match invitation has expired."), { status: 410 }); }
  match.status = "live"; match.startedAt = now.toISOString(); match.endsAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  match.activeEffects = []; match.pendingEffects = []; match.events = [];
  event(db, match.challengerId, "match_started", { matchId: match.id }, now);
  event(db, match.opponentId, "match_started", { matchId: match.id }, now);
  return match;
}
export function supportCreatorLeagueMatch(db, match, viewerId, side, now = new Date()) {
  settleExpiredLeagueMatches(db, now);
  match = resolveCanonicalMatch(db, match);
  if (!match || match.status !== "live") throw Object.assign(new Error("This League Match is not active."), { status: 409 });
  if (!["challenger", "opponent"].includes(side)) throw Object.assign(new Error("Choose a valid side to support."), { status: 400 });
  if ([match.challengerId, match.opponentId].includes(viewerId)) throw Object.assign(new Error("Creators cannot support their own match."), { status: 403 });
  if (match.supporters.some(item => item.userId === viewerId)) throw Object.assign(new Error("You have already supported a side in this match."), { status: 409 });
  match.supporters.push({ userId: viewerId, side, points: 3, createdAt: now.toISOString() });
  match.scores[side] = asNumber(match.scores[side]) + 3;
  match.events.push({ id: randomUUID(), type: "viewer_support", userId: viewerId, side, matchPoints: 3, createdAt: now.toISOString() });
  return match;
}
export function useCreatorLeaguePowerup(db, match, userId, powerupId, now = new Date()) {
  settleExpiredLeagueMatches(db, now);
  match = resolveCanonicalMatch(db, match);
  if (!match || match.status !== "live") throw Object.assign(new Error("Power-ups can only be used during an active match."), { status: 409 });
  const side = match.challengerId === userId ? "challenger" : match.opponentId === userId ? "opponent" : null;
  if (!side) throw Object.assign(new Error("Only a creator in this match can activate a power-up."), { status: 403 });
  const powerup = MATCH_POWERUPS.find(item => item.id === powerupId);
  if (!powerup) throw Object.assign(new Error("Choose a valid match power-up."), { status: 400 });
  const dayKey = utcDayKey(now);
  if (db.creatorLeaguePowerupUses.some(item => item.userId === userId && item.powerupId === powerupId && item.dayKey === dayKey)) throw Object.assign(new Error("You have already used this power-up today."), { status: 409 });
  if (powerupId === "shield") {
    match.activeEffects = match.activeEffects.filter(item => new Date(item.expiresAt).getTime() > now.getTime());
    if (match.activeEffects.some(item => item.type === "shield" && item.side === side)) {
      throw Object.assign(new Error("Your side already has an active Shield."), { status: 409 });
    }
    match.activeEffects.push({
      id: randomUUID(), type: "shield", side, shieldable: true,
      durationMs: powerup.durationMs,
      expiresAt: new Date(now.getTime() + powerup.durationMs).toISOString(),
      createdAt: now.toISOString()
    });
    match.events.push({ id: randomUUID(), type: "shield_used", side, blocks: "one opposing score boost", durationMs: powerup.durationMs, createdAt: now.toISOString() });
  } else if (powerupId === "time_boost") {
    if (match.timerMode === "fixed") throw Object.assign(new Error("Time Boost is disabled in this fixed-timer match format."), { status: 409 });
    if (match.timeBoostUsed[side]) throw Object.assign(new Error("Your side has already used Time Boost in this match."), { status: 409 });
    match.timeBoostUsed[side] = true;
    match.endsAt = new Date(new Date(match.endsAt).getTime() + powerup.durationMs).toISOString();
    match.events.push({ id: randomUUID(), type: "time_boost_used", side, addedSeconds: 30, createdAt: now.toISOString() });
  } else {
    match.activeEffects = match.activeEffects.filter(item => new Date(item.expiresAt).getTime() > now.getTime());
    match.activeEffects.push({ id: randomUUID(), type: powerupId, side, multiplier: powerup.multiplier, expiresAt: new Date(now.getTime() + powerup.durationMs).toISOString(), createdAt: now.toISOString() });
    match.events.push({ id: randomUUID(), type: "score_effect_used", side, powerupId, multiplier: powerup.multiplier, durationMs: powerup.durationMs, createdAt: now.toISOString() });
  }
  db.creatorLeaguePowerupUses.push({ id: randomUUID(), userId, powerupId, matchId: match.id, dayKey, createdAt: now.toISOString() });
  return match;
}
function publicMember(users, id) {
  const user = (users || []).find(item => item.id === id);
  return user ? { id: user.id, name: user.name || user.displayName || user.username || "Minglora creator", username: user.username || "creator", avatarUrl: user.avatarUrl || user.avatar_url || user.avatar || null } :
    { id, name: "Minglora creator", username: "creator", avatarUrl: null };
}
function decorateMatch(match, users) {
  return { ...match, challenger: publicMember(users, match.challengerId), opponent: publicMember(users, match.opponentId) };
}
export function listCreatorLeagueMatches(db, users, userId, now = new Date()) {
  ensureCollections(db);
  settleExpiredLeagueMatches(db, now);
  const currentTime = now instanceof Date ? now.getTime() : Date.parse(now);
  const matches = compactMatches(db.creatorLeagueMatches).filter(match => {
    if (match.status === "live") return true;
    if (![match.challengerId, match.opponentId].includes(userId)) return false;
    if (match.status === "pending") return true;
    if (match.status !== "completed") return false;
    const completedAt = Date.parse(match.completedAt || "");
    return Number.isFinite(completedAt) && Number.isFinite(currentTime) &&
      currentTime >= completedAt && currentTime - completedAt < 604800000;
  });
  return matches
    .sort((a, b) => new Date(b.startedAt || b.createdAt) - new Date(a.startedAt || a.createdAt))
    .slice(0, 50).map(match => decorateMatch(match, users));
}
export function getCreatorLeagueOverview(db, user, now = new Date()) {
  ensureCollections(db);
  settlePastDays(db, now);
  settleExpiredLeagueMatches(db, now);
  const seasonKey = creatorLeagueSeasonKey(now);
  for (const member of db.creatorLeagueProfiles) {
    if (member.seasonKey !== seasonKey) {
      member.seasonKey = seasonKey;
      member.seasonPoints = 0;
      member.updatedAt = now.toISOString();
    }
  }
  const profile = ensureCreatorLeagueProfile(db, user.id, user.country || user.region || "GLOBAL", now);
  const dayKey = utcDayKey(now);
  const daily = db.creatorLeagueDailyScores.find(item => item.userId === user.id && item.dayKey === dayKey);
  const leaders = db.creatorLeagueProfiles.filter(item => item.leagueClass === profile.leagueClass && (item.region || "GLOBAL") === profile.region)
    .sort((a, b) => Number(b.seasonPoints || 0) - Number(a.seasonPoints || 0) || Number(b.lifetimeGiftPoints || 0) - Number(a.lifetimeGiftPoints || 0))
    .slice(0, 50).map((item, index) => ({ position: index + 1, ...publicMember(db.users, item.userId), leagueClass: item.leagueClass, seasonPoints: Number(item.seasonPoints || 0), fragments: Number(item.fragments || 0) }));
  const uses = db.creatorLeaguePowerupUses.filter(item => item.userId === user.id && item.dayKey === dayKey);
  const matchRank = MATCH_RANKS[profile.matchRankIndex] || MATCH_RANKS[0];
  return {
    profile: {
      leagueClass: profile.leagueClass, region: profile.region, fragments: profile.fragments, fragmentsNeeded: 4,
      leagueShields: profile.leagueShields, lifetimeGiftPoints: profile.lifetimeGiftPoints,
      seasonPoints: profile.seasonPoints, todayGiftPoints: Number(daily ? daily.points : 0),
      seasonKey: profile.seasonKey, seasonEndsAt: seasonEndsAt(now),
      matchRank, matchRankIndex: profile.matchRankIndex, matchRankPoints: profile.matchRankPoints,
      matchRankPointsToNext: profile.matchRankIndex >= MATCH_RANKS.length - 1 ? null : 100 - profile.matchRankPoints,
      matchWins: profile.matchWins, matchLosses: profile.matchLosses, matchDraws: profile.matchDraws
    },
    classes: CREATOR_LEAGUE_CLASSES.slice().reverse(),
    matchRanks: MATCH_RANKS,
    leaderboard: leaders,
    recentEvents: db.creatorLeagueEvents.filter(item => item.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12),
    powerups: MATCH_POWERUPS.map(item => ({ ...item, usedToday: uses.some(use => use.powerupId === item.id) })),
    activeMatches: listCreatorLeagueMatches(db, db.users, user.id, now)
  };
}
