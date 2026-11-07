const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIME_ZONE = "America/Jamaica";
const DEFAULT_TARGETS = [
  { maxCoins: 5, target: 20 },
  { maxCoins: 100, target: 10 },
  { maxCoins: 500, target: 5 },
  { maxCoins: 2000, target: 2 },
  { maxCoins: Infinity, target: 1 }
];

function validTimeZone(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return null;
  }
}

export function giftGalleryTimeZone(user) {
  const preferred = validTimeZone(user?.timeZone || user?.timezone || user?.settings?.preferences?.timeZone || user?.deviceTimeZone);
  if (preferred) return preferred;
  const country = String(user?.country || "").trim().toLowerCase();
  if (country === "jm" || country.includes("jamaica")) return "America/Jamaica";
  if (country === "tt" || country.includes("trinidad")) return "America/Port_of_Spain";
  if (country === "gb" || country.includes("united kingdom")) return "Europe/London";
  if (country === "in" || country.includes("india")) return "Asia/Kolkata";
  if (country === "au" || country.includes("australia")) return "Australia/Sydney";
  if (country === "ca" || country.includes("canada")) return "America/Toronto";
  if (country === "us" || country.includes("united states")) return "America/New_York";
  return DEFAULT_TIME_ZONE;
}

function partsAt(date, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return values;
}

function localMidnightToUtc(year, month, day, timeZone) {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const local = partsAt(new Date(guess), timeZone);
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const difference = target - representedAsUtc;
    if (difference === 0) break;
    guess += difference;
  }
  return new Date(guess);
}

export function getGiftGalleryPeriod(at = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) throw new TypeError("Gift Gallery requires a valid timestamp.");
  const zone = validTimeZone(timeZone) || DEFAULT_TIME_ZONE;
  const local = partsAt(instant, zone);
  const localDate = Date.UTC(local.year, local.month - 1, local.day);
  const weekday = new Date(localDate).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(localDate - daysSinceMonday * 24 * 60 * 60 * 1000);
  const nextMonday = new Date(monday.getTime() + WEEK_MS);
  const weekKey = monday.toISOString().slice(0, 10);
  const nextWeekKey = nextMonday.toISOString().slice(0, 10);
  return {
    timeZone: zone,
    weekKey,
    startsAt: localMidnightToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), zone).toISOString(),
    resetsAt: localMidnightToUtc(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), zone).toISOString(),
    nextWeekKey
  };
}

export function defaultGiftGalleryTarget(coinPrice) {
  const price = Number(coinPrice);
  if (!Number.isFinite(price) || price <= 0) return 1;
  return DEFAULT_TARGETS.find(item => price <= item.maxCoins)?.target || 1;
}

export function recordGiftGalleryEvent(db, details) {
  if (!db || typeof db !== "object") throw new TypeError("Gift Gallery storage is required.");
  db.giftGalleryEvents ||= [];
  const giftId = String(details?.giftId || "").trim();
  const creatorId = String(details?.creatorId || "").trim();
  const senderId = String(details?.senderId || "").trim();
  const giftCode = String(details?.giftCode || "").trim().toLowerCase();
  const coinAmount = Number(details?.coinAmount);
  if (!giftId || !creatorId || !senderId || creatorId === senderId ||
      !/^[a-z0-9_-]{1,60}$/.test(giftCode) || !Number.isSafeInteger(coinAmount) || coinAmount <= 0) {
    return { recorded: false, reason: "invalid_gift" };
  }
  if (db.giftGalleryEvents.some(event => event.giftId === giftId)) {
    return { recorded: false, reason: "duplicate_transaction" };
  }
  const createdAt = details.now instanceof Date ? details.now : new Date(details.now || Date.now());
  if (Number.isNaN(createdAt.getTime())) throw new TypeError("Gift Gallery event requires a valid timestamp.");
  const timeZone = validTimeZone(details.timeZone) || DEFAULT_TIME_ZONE;
  const period = getGiftGalleryPeriod(createdAt, timeZone);
  const event = {
    id: giftId,
    giftId,
    creatorId,
    senderId,
    giftCode,
    giftName: String(details.giftName || giftCode.replace(/[_-]+/g, " ")).slice(0, 120),
    emoji: String(details.emoji || "🎁").slice(0, 16),
    imageUrl: String(details.imageUrl || "").slice(0, 1000),
    modelUrl: String(details.modelUrl || "").slice(0, 1000),
    coinAmount,
    broadcastId: String(details.broadcastId || "").slice(0, 160),
    timeZone,
    weekKey: period.weekKey,
    createdAt: createdAt.toISOString()
  };
  db.giftGalleryEvents.push(event);
  return { recorded: true, event };
}

export function updateGiftGallerySettings(db, {
  userId, enabled, showInGalleries, giftCode, targetCount
}) {
  if (!db || !userId) throw new TypeError("Gift Gallery settings require a member account.");
  db.giftGallerySettings ||= [];
  db.giftGalleryPreferences ||= [];
  let settings = db.giftGallerySettings.find(item => item.userId === userId);
  if (!settings) {
    settings = { userId, enabled: true, targets: {}, updatedAt: new Date().toISOString() };
    db.giftGallerySettings.push(settings);
  }
  let preference = db.giftGalleryPreferences.find(item => item.userId === userId);
  if (!preference) {
    preference = { userId, showInGalleries: true, updatedAt: new Date().toISOString() };
    db.giftGalleryPreferences.push(preference);
  }
  if (enabled !== undefined) settings.enabled = Boolean(enabled);
  if (showInGalleries !== undefined) preference.showInGalleries = Boolean(showInGalleries);
  if (giftCode !== undefined || targetCount !== undefined) {
    const code = String(giftCode || "").trim().toLowerCase();
    const target = Number(targetCount);
    if (!/^[a-z0-9_-]{1,60}$/.test(code) || !Number.isSafeInteger(target) || target < 1 || target > 10000) {
      throw new RangeError("Choose a valid gift and a goal from 1 to 10,000.");
    }
    settings.targets ||= {};
    settings.targets[code] = target;
  }
  const updatedAt = new Date().toISOString();
  settings.updatedAt = updatedAt;
  preference.updatedAt = updatedAt;
  return {
    settings: { enabled: settings.enabled !== false, targets: { ...(settings.targets || {}) } },
    preference: { showInGalleries: preference.showInGalleries !== false }
  };
}

export function getGiftGallery(db, creator, at = new Date()) {
  const creatorId = String(creator?.id || "");
  if (!creatorId) throw new TypeError("Gift Gallery requires a creator account.");
  db.giftGalleryEvents ||= [];
  db.giftGallerySettings ||= [];
  db.giftGalleryPreferences ||= [];
  const timeZone = giftGalleryTimeZone(creator);
  const period = getGiftGalleryPeriod(at, timeZone);
  const settings = db.giftGallerySettings.find(item => item.userId === creatorId) || { enabled: true, targets: {} };
  const enabled = settings.enabled !== false;
  const preferences = new Map(db.giftGalleryPreferences.map(item => [item.userId, item.showInGalleries !== false]));
  if (!enabled) {
    return {
      enabled: false,
      period,
      entries: [],
      totals: { gifts: 0, giftTypes: 0, coins: 0, supporters: 0 }
    };
  }

  const currentEvents = db.giftGalleryEvents.filter(event =>
    !event.refundedAt && event.status !== "refunded" &&
    event.creatorId === creatorId &&
    event.weekKey === period.weekKey &&
    preferences.get(event.senderId) !== false
  );
  const gifts = new Map();
  for (const event of currentEvents) {
    let item = gifts.get(event.giftCode);
    if (!item) {
      item = {
        giftCode: event.giftCode,
        giftName: event.giftName,
        emoji: event.emoji,
        imageUrl: event.imageUrl || "",
        modelUrl: event.modelUrl || "",
        coinPrice: event.coinAmount,
        giftCount: 0,
        totalCoins: 0,
        supporters: new Map()
      };
      gifts.set(event.giftCode, item);
    }
    item.giftCount += 1;
    item.totalCoins += event.coinAmount;
    const supporter = item.supporters.get(event.senderId) || { userId: event.senderId, giftCount: 0, totalCoins: 0, lastSentAt: "" };
    supporter.giftCount += 1;
    supporter.totalCoins += event.coinAmount;
    if (!supporter.lastSentAt || event.createdAt > supporter.lastSentAt) supporter.lastSentAt = event.createdAt;
    item.supporters.set(event.senderId, supporter);
  }

  const entries = [...gifts.values()].map(item => {
    const supporters = [...item.supporters.values()].sort((a, b) =>
      b.giftCount - a.giftCount ||
      b.totalCoins - a.totalCoins ||
      a.lastSentAt.localeCompare(b.lastSentAt) ||
      a.userId.localeCompare(b.userId)
    );
    const leader = supporters[0] || null;
    const targetCount = Number(settings.targets?.[item.giftCode]) || defaultGiftGalleryTarget(item.coinPrice);
    return {
      giftCode: item.giftCode,
      giftName: item.giftName,
      emoji: item.emoji,
      imageUrl: item.imageUrl,
      modelUrl: item.modelUrl,
      coinPrice: item.coinPrice,
      giftCount: item.giftCount,
      totalCoins: item.totalCoins,
      supporterCount: supporters.length,
      targetCount,
      leadingGifterId: leader?.userId || null,
      leadingGifterCount: leader?.giftCount || 0,
      lit: Boolean(leader && leader.giftCount >= targetCount)
    };
  }).sort((a, b) => b.coinPrice - a.coinPrice || b.giftCount - a.giftCount || a.giftName.localeCompare(b.giftName));

  return {
    enabled: true,
    period,
    entries,
    totals: {
      gifts: currentEvents.length,
      giftTypes: entries.length,
      coins: currentEvents.reduce((sum, event) => sum + event.coinAmount, 0),
      supporters: new Set(currentEvents.map(event => event.senderId)).size
    }
  };
}
