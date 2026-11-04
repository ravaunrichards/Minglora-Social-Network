const LEVEL_CAP = 50;

const TIERS = [
  "Newcomer", "Bronze", "Silver", "Gold", "Platinum",
  "Diamond", "Royal", "Mythic", "Celestial", "Legend"
];

function safeText(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export function gifterXpRequired(level) {
  const value = Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));
  if (value === 1) return 0;
  return Math.round(100 * Math.pow(value - 1, 1.65));
}

export function getGifterLevel(xp) {
  const total = Math.max(0, Number.isFinite(Number(xp)) ? Math.floor(Number(xp)) : 0);
  let level = 1;
  for (let candidate = 2; candidate <= LEVEL_CAP; candidate += 1) {
    if (total < gifterXpRequired(candidate)) break;
    level = candidate;
  }
  return level;
}

export function getGifterLevelChart(xp = 0) {
  const currentLevel = getGifterLevel(xp);
  return Array.from({ length: LEVEL_CAP }, (_, index) => {
    const level = index + 1;
    const tier = TIERS[Math.floor(index / 5)];
    const milestone = level % 5 === 0;
    return {
      level,
      xpRequired: gifterXpRequired(level),
      tier,
      badgeName: tier + " Gifter · Level " + level,
      reward: level === 25 ? "Special LIVE entrance badge" : milestone ? "Milestone badge finish" : "Level badge",
      unlocked: level <= currentLevel,
      current: level === currentLevel
    };
  });
}

function aggregateBySender(events) {
  const totals = new Map();
  for (const event of events) {
    if (!event?.senderId) continue;
    const item = totals.get(event.senderId) || {
      xp: 0, giftsSent: 0, recipients: new Set(), lastGiftAt: ""
    };
    const amount = Number(event.coinAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    item.xp += amount;
    item.giftsSent += 1;
    if (event.recipientId) item.recipients.add(event.recipientId);
    if (event.createdAt && event.createdAt > item.lastGiftAt) item.lastGiftAt = event.createdAt;
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
  const own = getDeduplicatedSenderTotals(db).get(userId);
  if (!own || own.giftsSent < 1) return null;
  const level = getGifterLevel(own.xp);
  const badge = getGifterLevelChart(own.xp)[level - 1];
  return {
    level,
    tier: badge.tier,
    badgeName: badge.badgeName,
    liveEntranceUnlocked: level >= 25
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
  const own = totals.get(userId) || { xp: 0, giftsSent: 0, recipients: new Set(), lastGiftAt: "" };
  const level = getGifterLevel(own.xp);
  const nextLevel = level < LEVEL_CAP ? level + 1 : null;
  const currentThreshold = gifterXpRequired(level);
  const nextThreshold = nextLevel ? gifterXpRequired(nextLevel) : null;
  const xpIntoLevel = Math.max(0, own.xp - currentThreshold);
  const xpForLevel = nextThreshold === null ? 0 : nextThreshold - currentThreshold;
  const xpRemaining = nextThreshold === null ? 0 : Math.max(0, nextThreshold - own.xp);
  const progressPercent = xpForLevel > 0
    ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)))
    : 100;
  const chart = getGifterLevelChart(own.xp);
  const currentBadge = chart[level - 1];

  const members = new Map((db.users || []).map(member => [member.id, member]));
  const leaderboard = [...totals.entries()]
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
      totalCoinsSent: own.xp,
      giftsSent: own.giftsSent,
      uniqueRecipients: own.recipients.size,
      rankPosition,
      tier: currentBadge.tier,
      badgeName: currentBadge.badgeName,
      nextLevel,
      nextLevelXp: nextThreshold,
      xpRemaining,
      xpIntoLevel,
      xpForLevel,
      progressPercent,
      maxLevel: level === LEVEL_CAP
    },
    levels: chart,
    leaderboard: leaderboard.slice(0, 20),
    history,
    rules: {
      xpPerCoin: 1,
      source: "Confirmed member-to-member and LIVE gifts sent",
      excluded: ["Coin purchases", "Gifts received", "Unconfirmed or duplicate transactions"],
      maximumLevel: LEVEL_CAP
    }
  };
}
