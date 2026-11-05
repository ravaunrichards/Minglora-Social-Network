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

export function getGifterLevelChart(xp = 0) {
  const total = Math.max(0, Number.isFinite(Number(xp)) ? Math.floor(Number(xp)) : 0);
  const currentLevel = getGifterLevel(total);
  return Array.from({ length: LEVEL_CAP }, (_, index) => {
    const level = index + 1;
    const tier = TIERS[Math.floor(index / 5)];
    const milestone = level % 5 === 0;
    return {
      level,
      coinsRequired: GIFTER_LEVEL_COIN_THRESHOLDS[index],
      xpRequired: gifterXpRequired(level),
      tier,
      badgeName: tier + " Gifter · LV " + level,
      reward: level === 25 ? "Special LIVE entrance badge" : milestone ? "Milestone badge finish" : "Level badge",
      unlocked: total >= gifterXpRequired(level),
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
    if (!item?.giftId || item.refundedAt || item.status === "refunded" || seen.has(item.giftId)) return false;
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
function emptyGifterTotals() {
  return { xp: 0, giftsSent: 0, recipients: new Set(), firstGiftAt: "", lastGiftAt: "" };
}

function getDeduplicatedGiftEvents(db) {
  const ledger = Array.isArray(db.gifterProgressionLedger) ? db.gifterProgressionLedger : [];
  const seen = new Set();
  return ledger.filter(item => {
    if (!item?.giftId || item.refundedAt || item.status === "refunded" || seen.has(item.giftId)) return false;
    seen.add(item.giftId);
    return true;
  });
}

function getAdminGifterOverride(db, userId) {
  return (Array.isArray(db.gifterBadgeAdminOverrides) ? db.gifterBadgeAdminOverrides : [])
    .find(item => item?.userId === userId) || null;
}

function getGifterProgressionContext(db, userId) {
  const events = getDeduplicatedGiftEvents(db);
  const lifetimeTotals = aggregateBySender(events);
  const lifetime = lifetimeTotals.get(userId) || emptyGifterTotals();
  const override = getAdminGifterOverride(db, userId);
  const resetAt = String(override?.progressionResetAt || "");
  const resetAtMs = resetAt ? Date.parse(resetAt) : Number.NaN;
  const progressionEvents = events.filter(event =>
    event.senderId === userId &&
    (!Number.isFinite(resetAtMs) || Date.parse(event.createdAt || "") > resetAtMs)
  );
  const progressionTotals = aggregateBySender(progressionEvents);
  const progression = progressionTotals.get(userId) || emptyGifterTotals();
  const earnedLevel = getGifterLevel(progression.xp);
  const grantedLevel = Math.max(0, Math.min(LEVEL_CAP, Math.floor(Number(override?.grantedLevel) || 0)));
  return {
    events,
    lifetime,
    progression,
    override,
    earnedLevel,
    grantedLevel,
    level: Math.max(earnedLevel, grantedLevel)
  };
}

/**
 * Return the public-facing badge for a member. Confirmed gifts remain the only
 * source of earned progress; an audited admin override can separately grant
 * visibility/unlock status without adding Coin spend or touching any wallet.
 */
export function getGifterBadgeSummary(db, userId) {
  if (!db || typeof db !== "object" || !userId) return null;
  const context = getGifterProgressionContext(db, userId);
  if (context.level < 1) return null;
  const badge = getGifterLevelChart(context.progression.xp)[context.level - 1];
  const adminAwarded = context.grantedLevel > context.earnedLevel;
  return {
    level: context.level,
    tier: badge.tier,
    badgeName: badge.badgeName,
    liveEntranceUnlocked: context.level >= 25,
    badgeSource: adminAwarded ? "admin_awarded" : "earned",
    adminAwarded,
    unlockedLevels: context.level
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

/**
 * Mark a refunded Gift as reversed while preserving the audit history.
 * Replacing the ledger array invalidates the sender-total WeakMap cache.
 */
export function refundGifterGift(db, giftId, now = new Date()) {
  if (!db || typeof db !== "object") throw new TypeError("Gifter progression storage is required.");
  const id = safeText(giftId, 180);
  if (!id) return { reversed: false, reason: "invalid_gift_id" };
  const ledger = Array.isArray(db.gifterProgressionLedger) ? db.gifterProgressionLedger : [];
  const gift = ledger.find(item => item.giftId === id);
  if (!gift) return { reversed: false, reason: "gift_not_found" };
  if (gift.refundedAt || gift.status === "refunded") {
    return { reversed: false, reason: "already_refunded", senderId: gift.senderId };
  }
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  gift.refundedAt = timestamp;
  gift.status = "refunded";
  db.gifterProgressionLedger = ledger.slice();
  return { reversed: true, senderId: gift.senderId, coinAmount: Number(gift.coinAmount) || 0 };
}

export function getGifterProgressionOverview(db, userId) {
  if (!db || typeof db !== "object" || !userId) {
    throw new TypeError("Gifter progression requires a signed-in member.");
  }
  db.gifterProgressionLedger ||= [];

  const context = getGifterProgressionContext(db, userId);
  const events = context.events;
  const lifetime = context.lifetime;
  const own = context.progression;
  const level = context.level;
  const nextLevel = level < LEVEL_CAP ? level + 1 : null;
  const currentThreshold = level > 0 ? gifterXpRequired(level) : 0;
  const nextThreshold = nextLevel ? gifterXpRequired(nextLevel) : null;
  const xpIntoLevel = Math.max(0, own.xp - currentThreshold);
  const xpForLevel = nextThreshold === null ? 0 : nextThreshold - currentThreshold;
  const xpRemaining = nextThreshold === null ? 0 : Math.max(0, nextThreshold - own.xp);
  const progressPercent = nextThreshold === null
    ? 100
    : xpForLevel > 0
      ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)))
      : 100;
  const earnedLevel = context.earnedLevel;
  const grantedLevel = context.grantedLevel;
  const adminAwarded = grantedLevel > earnedLevel;
  const chart = getGifterLevelChart(own.xp).map(item => ({
    ...item,
    unlocked: item.level <= level,
    current: level > 0 && item.level === level,
    adminAwarded: item.level <= grantedLevel && item.level > earnedLevel
  }));
  const currentBadge = level > 0 ? chart[level - 1] : null;
  const newGifterIdentity = getNewGifterIdentity(db, userId);

  const members = new Map((db.users || []).map(member => [member.id, member]));
  const lifetimeTotals = aggregateBySender(events);
  const leaderboard = [...lifetimeTotals.entries()]
    .map(([id, value]) => {
      const member = members.get(id);
      if (!member) return null;
      const memberLevel = getGifterLevel(value.xp);
      return {
        userId: id,
        username: safeText(member.username || "member", 40),
        name: safeText(member.name || member.username || "Minglora member", 80),
        level: memberLevel,
        xp: value.xp,
        giftsSent: value.giftsSent,
        badgeName: getGifterLevelChart(value.xp)[memberLevel - 1].badgeName,
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
      xp: own.xp,
      totalCoinsSent: lifetime.xp,
      giftsSent: lifetime.giftsSent,
      uniqueRecipients: lifetime.recipients.size,
      rankPosition,
      tier: currentBadge?.tier || null,
      badgeName: currentBadge?.badgeName || null,
      hasUnlockedBadge: level > 0,
      badgeSource: adminAwarded ? "admin_awarded" : level > 0 ? "earned" : null,
      adminAwarded,
      grantedLevel,
      progressionResetAt: context.override?.progressionResetAt || null,
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
      excluded: ["Coin purchases", "Gifts received", "Failed gift attempts", "Duplicate transactions"],
      maximumLevel: LEVEL_CAP,
      firstLevelRequiresCoinsSent: 1,
      newGifterIdentityDays: 7,
      adminAwardPolicy: "Admin grants unlock badges separately and never add to Coin spend or wallet balances.",
      resetPolicy: "Admin resets set a new progression start while preserving the original gift ledger and lifetime history."
    }
  };
}
