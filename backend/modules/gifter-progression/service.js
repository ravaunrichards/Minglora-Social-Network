const LEVEL_CAP = 50;

const TIERS = [
  "Newcomer", "Bronze", "Silver", "Gold", "Platinum",
  "Diamond", "Royal", "Mythic", "Celestial", "Legend"
];

function safeText(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

// Cumulative Minglora Gifter coin thresholds for Levels 1–50.
// One Coin spent on a confirmed gift contributes one progression point.
export const GIFTER_LEVEL_COIN_THRESHOLDS = Object.freeze([
  1, 8, 18, 34, 56, 90, 140, 220, 340, 530,
  820, 1260, 1920, 2840, 4340, 6420, 9280, 13500, 19400, 27600,
  39600, 54600, 75800, 105000, 144000, 196000, 265000, 357000, 478000, 637000,
  845000, 1120000, 1470000, 1920000, 2500000, 3230000, 4180000, 5180000, 6890000, 8780000,
  11200000, 14100000, 17800000, 22300000, 30000000, 37500000, 47500000, 60000000, 75000000, 97500000
]);

export function gifterXpRequired(level) {
  const value = Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));
  // All levels are locked until cumulative Coins are spent sending confirmed gifts.
  return GIFTER_LEVEL_COIN_THRESHOLDS[value - 1];
}

export function getGifterLevel(xp) {
  const total = Math.max(0, Number.isFinite(Number(xp)) ? Math.floor(Number(xp)) : 0);
  let level = 0;
  for (let candidate = 1; candidate <= LEVEL_CAP; candidate += 1) {
    if (total < gifterXpRequired(candidate)) break;
    level = candidate;
  }
  return level;
}

export function getGifterLevelChart(xp = 0, adminGrantedLevel = 0) {
  const total = Math.max(0, Number.isFinite(Number(xp)) ? Math.floor(Number(xp)) : 0);
  const earnedLevel = getGifterLevel(total);
  const grantedLevel = Math.max(0, Math.min(LEVEL_CAP, Math.floor(Number(adminGrantedLevel) || 0)));
  const currentLevel = Math.max(earnedLevel, grantedLevel);
  return Array.from({ length: LEVEL_CAP }, (_, index) => {
    const level = index + 1;
    const tier = TIERS[Math.floor(index / 5)];
    const milestone = level % 5 === 0;
    const earned = total >= gifterXpRequired(level);
    const adminGranted = level <= grantedLevel;
    return {
      level,
      coinsRequired: GIFTER_LEVEL_COIN_THRESHOLDS[index],
      xpRequired: gifterXpRequired(level),
      tier,
      badgeName: tier + " Gifter · LV " + level,
      reward: level === 25 ? "Special LIVE entrance badge" : milestone ? "Milestone badge finish" : "Level badge",
      unlocked: earned || adminGranted,
      earned,
      adminGranted,
      unlockSource: earned ? "gift" : adminGranted ? "admin" : "locked",
      current: currentLevel > 0 && level === currentLevel
    };
  });
}

function aggregateBySender(events) {
  const totals = new Map();
  for (const event of events) {
    if (!event?.senderId) continue;
    const item = totals.get(event.senderId) || {
      xp: 0, giftsSent: 0, recipients: new Set(), firstGiftAt: "", lastGiftAt: ""
    };
    const amount = Number(event.coinAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    item.xp += amount;
    item.giftsSent += 1;
    if (event.recipientId) item.recipients.add(event.recipientId);
    if (event.createdAt) {
      if (!item.firstGiftAt || event.createdAt < item.firstGiftAt) item.firstGiftAt = event.createdAt;
      if (event.createdAt > item.lastGiftAt) item.lastGiftAt = event.createdAt;
    }
    totals.set(event.senderId, item);
  }
  return totals;
}


/**
 * Admin grants are kept separately from confirmed gift transactions. They never
 * add Coins, XP, gift-history rows, or spending to a member's real progression.
 */
export function getGifterAdminGrant(db, userId) {
  if (!db || typeof db !== "object" || !userId) return null;
  const grant = (db.gifterBadgeAdminGrants || []).find(item =>
    item?.userId === userId && item.status === "active"
  );
  const level = Math.max(0, Math.min(LEVEL_CAP, Math.floor(Number(grant?.level) || 0)));
  if (!level) return null;
  return {
    level,
    grantedAt: grant.grantedAt || grant.updatedAt || null,
    grantedBy: grant.grantedBy || null,
    note: safeText(grant.note, 240)
  };
}

function appendGifterAdminAudit(db, details, action, previousLevel, nextLevel) {
  db.gifterBadgeAdminAudit ||= [];
  const auditId = safeText(details.auditId, 180);
  if (!auditId) throw new TypeError("A unique admin badge audit ID is required.");
  if (db.gifterBadgeAdminAudit.some(item => item.id === auditId)) {
    throw new Error("This admin badge action was already recorded.");
  }
  const event = {
    id: auditId,
    action,
    targetUserId: details.userId,
    actorUserId: details.actorId,
    previousLevel,
    level: nextLevel,
    note: safeText(details.note, 240),
    createdAt: details.now instanceof Date ? details.now.toISOString() : new Date(details.now || Date.now()).toISOString()
  };
  db.gifterBadgeAdminAudit.unshift(event);
  return event;
}

export function grantGifterBadgeLevel(db, details = {}) {
  if (!db || typeof db !== "object") throw new TypeError("Gifter progression storage is required.");
  const userId = safeText(details.userId, 180);
  const actorId = safeText(details.actorId, 180);
  const level = Number(details.level);
  if (!userId || !actorId || !Number.isInteger(level) || level < 1 || level > LEVEL_CAP) {
    throw new TypeError("Choose a member and a whole-number gifter level from 1 to 50.");
  }
  db.gifterBadgeAdminGrants ||= [];
  const existing = db.gifterBadgeAdminGrants.find(item => item?.userId === userId);
  const previousLevel = existing?.status === "active" ? Math.max(0, Number(existing.level) || 0) : 0;
  const stamp = details.now instanceof Date ? details.now.toISOString() : new Date(details.now || Date.now()).toISOString();
  const grant = existing || { id: userId, userId };
  Object.assign(grant, {
    status: "active",
    level,
    grantedBy: actorId,
    grantedAt: stamp,
    note: safeText(details.note, 240),
    updatedAt: stamp,
    resetBy: null,
    resetAt: null
  });
  if (!existing) db.gifterBadgeAdminGrants.push(grant);
  const audit = appendGifterAdminAudit(db, { ...details, userId, actorId }, "grant", previousLevel, level);
  return { grant: getGifterAdminGrant(db, userId), audit };
}

export function resetGifterBadgeAdminGrant(db, details = {}) {
  if (!db || typeof db !== "object") throw new TypeError("Gifter progression storage is required.");
  const userId = safeText(details.userId, 180);
  const actorId = safeText(details.actorId, 180);
  if (!userId || !actorId) throw new TypeError("Choose a member before resetting an admin badge grant.");
  db.gifterBadgeAdminGrants ||= [];
  const existing = db.gifterBadgeAdminGrants.find(item => item?.userId === userId);
  const previousLevel = existing?.status === "active" ? Math.max(0, Number(existing.level) || 0) : 0;
  const stamp = details.now instanceof Date ? details.now.toISOString() : new Date(details.now || Date.now()).toISOString();
  if (existing) Object.assign(existing, {
    status: "reset",
    level: 0,
    resetBy: actorId,
    resetAt: stamp,
    note: safeText(details.note, 240),
    updatedAt: stamp
  });
  const audit = appendGifterAdminAudit(db, { ...details, userId, actorId }, "reset", previousLevel, 0);
  return { grant: getGifterAdminGrant(db, userId), audit, previousLevel };
}

const senderTotalsCache = new WeakMap();

function getDeduplicatedSenderTotals(db) {
  const ledger = Array.isArray(db.gifterProgressionLedger) ? db.gifterProgressionLedger : [];
  const lastGiftId = ledger.length ? ledger[ledger.length - 1]?.giftId || null : null;
  const cached = senderTotalsCache.get(db);
  if (cached && cached.ledger === ledger && cached.length === ledger.length && cached.lastGiftId === lastGiftId) {
    return cached.totals;
  }

  const seen = new Set();
  const uniqueEvents = ledger.filter(item => {
    if (!item?.giftId || seen.has(item.giftId)) return false;
    seen.add(item.giftId);
    return true;
  });
  const totals = aggregateBySender(uniqueEvents);
  senderTotalsCache.set(db, { ledger, length: ledger.length, lastGiftId, totals });
  return totals;
}

/**
 * Return the public-facing badge for a member, based only on confirmed gifts
 * they sent. Members who have not sent a confirmed gift have no gifter badge.
 */
export function getGifterBadgeSummary(db, userId) {
  if (!db || typeof db !== "object" || !userId) return null;
  const own = getDeduplicatedSenderTotals(db).get(userId) || { xp: 0, giftsSent: 0 };
  const earnedLevel = getGifterLevel(own.xp);
  const adminGrant = getGifterAdminGrant(db, userId);
  const adminGrantedLevel = adminGrant?.level || 0;
  const level = Math.max(earnedLevel, adminGrantedLevel);
  if (level < 1) return null;
  const badge = getGifterLevelChart(own.xp, adminGrantedLevel)[level - 1];
  return {
    level,
    earnedLevel,
    adminGrantedLevel,
    adminGranted: level > earnedLevel,
    unlockSource: level > earnedLevel ? "admin" : "gift",
    tier: badge.tier,
    badgeName: badge.badgeName,
    liveEntranceUnlocked: level >= 25
  };
}

export const NEW_GIFTER_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * NEW GIFTER starts at a member's first confirmed gift sent and expires after
 * exactly seven days. Additional gifts never restart the timer.
 */
export function getNewGifterIdentity(db, userId, now = Date.now()) {
  if (!db || typeof db !== "object" || !userId) return null;
  const own = getDeduplicatedSenderTotals(db).get(userId);
  if (!own?.firstGiftAt) return null;
  const startedAtMs = Date.parse(own.firstGiftAt);
  const currentTimeMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(currentTimeMs)) return null;
  const expiresAtMs = startedAtMs + NEW_GIFTER_DURATION_MS;
  if (currentTimeMs < startedAtMs || currentTimeMs >= expiresAtMs) return null;
  return {
    label: "NEW GIFTER",
    active: true,
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export function recordGifterGift(db, details = {}) {
  if (!db || typeof db !== "object") throw new TypeError("Gifter progression storage is required.");
  db.gifterProgressionLedger ||= [];

  const giftId = safeText(details.giftId, 180);
  const senderId = safeText(details.senderId, 180);
  const recipientId = safeText(details.recipientId, 180);
  const coinAmount = Number(details.coinAmount);
  const giftCode = safeText(details.giftCode, 60).toLowerCase();
  if (!giftId || !senderId || !recipientId || senderId === recipientId ||
      !/^[a-z0-9_-]{1,60}$/.test(giftCode) ||
      !Number.isSafeInteger(coinAmount) || coinAmount <= 0) {
    return { recorded: false, reason: "invalid_confirmed_gift" };
  }
  if (db.gifterProgressionLedger.some(item => item.giftId === giftId)) {
    return { recorded: false, reason: "duplicate_transaction" };
  }

  const createdAt = details.now instanceof Date ? details.now : new Date(details.now || Date.now());
  if (Number.isNaN(createdAt.getTime())) throw new TypeError("Gifter progression requires a valid timestamp.");

  const event = {
    id: giftId,
    giftId,
    senderId,
    recipientId,
    recipientUsername: safeText(details.recipientUsername, 40).replace(/^@/, ""),
    giftCode,
    giftName: safeText(details.giftName || giftCode.replace(/[_-]+/g, " "), 120),
    coinAmount,
    contextType: details.contextType === "live" ? "live" : "member",
    createdAt: createdAt.toISOString()
  };
  db.gifterProgressionLedger.push(event);
  return { recorded: true, event };
}

export function getGifterProgressionOverview(db, userId) {
  if (!db || typeof db !== "object" || !userId) {
    throw new TypeError("Gifter progression requires a signed-in member.");
  }
  db.gifterProgressionLedger ||= [];

  // Keep the first confirmed copy of each transaction. This protects totals if
  // an older persisted snapshot contains duplicate transaction records.
  const seen = new Set();
  const events = db.gifterProgressionLedger.filter(item => {
    if (!item?.giftId || seen.has(item.giftId)) return false;
    seen.add(item.giftId);
    return true;
  });
  const totals = aggregateBySender(events);
  const own = totals.get(userId) || { xp: 0, giftsSent: 0, recipients: new Set(), firstGiftAt: "", lastGiftAt: "" };
  const earnedLevel = getGifterLevel(own.xp);
  const adminGrant = getGifterAdminGrant(db, userId);
  const adminGrantedLevel = adminGrant?.level || 0;
  const level = Math.max(earnedLevel, adminGrantedLevel);
  const nextLevel = level < LEVEL_CAP ? level + 1 : null;
  const currentThreshold = level > 0 ? gifterXpRequired(level) : 0;
  const nextThreshold = nextLevel ? gifterXpRequired(nextLevel) : null;
  const xpIntoLevel = Math.max(0, own.xp - currentThreshold);
  const xpForLevel = nextThreshold === null ? 0 : nextThreshold - currentThreshold;
  const xpRemaining = nextThreshold === null ? 0 : Math.max(0, nextThreshold - own.xp);
  const progressPercent = xpForLevel > 0
    ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)))
    : 100;
  const chart = getGifterLevelChart(own.xp, adminGrantedLevel);
  const currentBadge = level > 0 ? chart[level - 1] : null;
  const newGifterIdentity = getNewGifterIdentity(db, userId);

  const members = new Map((db.users || []).map(member => [member.id, member]));
  const leaderboard = [...totals.entries()]
    .map(([id, value]) => {
      const member = members.get(id);
      if (!member) return null;
      const memberLevel = getGifterLevel(value.xp);
      const badgeSummary = getGifterBadgeSummary(db, id);
      return {
        userId: id,
        username: safeText(member.username || "member", 40),
        name: safeText(member.name || member.username || "Minglora member", 80),
        level: badgeSummary?.level || memberLevel,
        earnedLevel: memberLevel,
        adminGranted: Boolean(badgeSummary?.adminGranted),
        xp: value.xp,
        giftsSent: value.giftsSent,
        badgeName: badgeSummary?.badgeName || null,
        lastGiftAt: value.lastGiftAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.xp - a.xp || b.giftsSent - a.giftsSent || a.username.localeCompare(b.username))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const rankPosition = leaderboard.find(item => item.userId === userId)?.rank ?? null;
  const history = events
    .filter(item => item.senderId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 20)
    .map(item => ({
      giftId: item.giftId,
      giftName: item.giftName,
      giftCode: item.giftCode,
      coinAmount: Number(item.coinAmount),
      recipientUsername: item.recipientUsername,
      contextType: item.contextType,
      createdAt: item.createdAt
    }));

  return {
    current: {
      level,
      earnedLevel,
      adminGrantedLevel,
      adminGranted: level > earnedLevel,
      adminGrantNote: adminGrant?.note || "",
      xp: own.xp,
      totalCoinsSent: own.xp,
      giftsSent: own.giftsSent,
      uniqueRecipients: own.recipients.size,
      rankPosition,
      tier: currentBadge?.tier || null,
      badgeName: currentBadge?.badgeName || null,
      hasUnlockedBadge: level > 0,
      nextLevel,
      nextLevelXp: nextThreshold,
      xpRemaining,
      xpIntoLevel,
      xpForLevel,
      progressPercent,
      maxLevel: level === LEVEL_CAP
    },
    levels: chart,
    newGifterIdentity,
    leaderboard: leaderboard.slice(0, 20),
    history,
    rules: {
      xpPerCoin: 1,
      coinsPerProgressPoint: 1,
      source: "Confirmed member-to-member and LIVE gifts sent",
      excluded: ["Coin purchases", "Gifts received", "Unconfirmed or duplicate transactions"],
      maximumLevel: LEVEL_CAP,
      firstLevelRequiresCoinsSent: 1,
      adminGrantsDoNotChangeCoinsOrGiftHistory: true,
      newGifterIdentityDays: 7
    }
  };
}
