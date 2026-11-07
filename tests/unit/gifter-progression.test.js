import test from "node:test";
import assert from "node:assert/strict";
import {
  getGifterLevel,
  getGifterLevelChart,
  gifterXpRequired,
  recordGifterGift,
  getGifterProgressionOverview,
  getGifterBadgeSummary,
  getNewGifterIdentity,
  refundGifterGift,
  getLiveGifterLeaderboard
} from "../../backend/modules/gifter-progression/service.js";

test("gifter levels use the fixed cumulative coin thresholds from the reference chart", () => {
  const thresholds = [
    1, 8, 18, 34, 56, 90, 140, 220, 340, 530,
    820, 1260, 1920, 2840, 4340, 6420, 9280, 13500, 19400, 27600,
    39600, 54600, 75800, 105000, 144000, 196000, 265000, 357000, 478000, 637000,
    845000, 1120000, 1470000, 1920000, 2500000, 3230000, 4180000, 5180000, 6890000, 8780000,
    11200000, 14100000, 17800000, 22300000, 30000000, 37500000, 47500000, 60000000, 75000000, 97500000
  ];
  assert.equal(gifterXpRequired(1), 1);
  assert.equal(gifterXpRequired(2), 8);
  assert.equal(gifterXpRequired(50), 97500000);
  assert.equal(getGifterLevel(0), 0);
  assert.equal(getGifterLevel(1), 1);
  assert.equal(getGifterLevel(7), 1);
  assert.equal(getGifterLevel(8), 2);
  assert.equal(getGifterLevel(17), 2);
  assert.equal(getGifterLevel(18), 3);
  assert.equal(getGifterLevel(143999), 24);
  assert.equal(getGifterLevel(144000), 25);
  assert.equal(getGifterLevel(97500000), 50);
  assert.equal(getGifterLevelChart(0).length, 50);
  assert.equal(getGifterLevelChart(0).every(item => item.unlocked === false && item.current === false), true);
  assert.deepEqual(getGifterLevelChart(0).map(item => item.coinsRequired), thresholds);
});

test("only confirmed positive gifts are recorded and each transaction is unique", () => {
  const db = { gifterProgressionLedger: [] };
  const details = {
    giftId: "txn-1", senderId: "sender", recipientId: "recipient",
    recipientUsername: "friend", giftCode: "rose", coinAmount: 25,
    contextType: "member", now: new Date("2026-11-04T12:00:00.000Z")
  };
  assert.equal(recordGifterGift(db, details).recorded, true);
  assert.equal(recordGifterGift(db, details).reason, "duplicate_transaction");
  assert.equal(recordGifterGift(db, { ...details, giftId: "txn-2", coinAmount: 0 }).recorded, false);
  assert.equal(db.gifterProgressionLedger.length, 1);
  assert.equal(db.gifterProgressionLedger[0].id, "txn-1");
});

test("gifter overview includes sent gifts only and ranks only real members", () => {
  const db = {
    users: [
      { id: "sender", username: "sender", name: "Sender" },
      { id: "recipient", username: "recipient", name: "Recipient" },
      { id: "other", username: "other", name: "Other" }
    ],
    gifterProgressionLedger: []
  };
  recordGifterGift(db, {
    giftId: "txn-a", senderId: "sender", recipientId: "recipient",
    recipientUsername: "recipient", giftCode: "rose", coinAmount: 120,
    contextType: "live", now: new Date("2026-11-03T12:00:00.000Z")
  });
  recordGifterGift(db, {
    giftId: "txn-b", senderId: "other", recipientId: "recipient",
    recipientUsername: "recipient", giftCode: "crown", coinAmount: 10,
    contextType: "member", now: new Date("2026-11-03T13:00:00.000Z")
  });

  const overview = getGifterProgressionOverview(db, "sender");
  assert.equal(overview.current.xp, 120);
  assert.equal(overview.current.giftsSent, 1);
  assert.equal(overview.current.uniqueRecipients, 1);
  assert.equal(overview.current.level, 6);
  assert.equal(overview.current.rankPosition, 1);
  assert.equal(overview.history.length, 1);
  assert.equal(overview.history[0].contextType, "live");
  assert.equal(overview.leaderboard.length, 2);
});


test("public gifter badge is earned only by confirmed gifts sent and Level 25 unlocks LIVE entry", () => {
  const db = { gifterProgressionLedger: [] };
  assert.equal(getGifterBadgeSummary(db, "sender"), null);

  recordGifterGift(db, {
    giftId: "badge-first-gift", senderId: "sender", recipientId: "recipient",
    giftCode: "rose", coinAmount: 1, contextType: "member"
  });
  const starterBadge = getGifterBadgeSummary(db, "sender");
  assert.equal(starterBadge.level, 1);
  assert.equal(starterBadge.liveEntranceUnlocked, false);
  assert.equal(getGifterBadgeSummary(db, "recipient"), null);

  recordGifterGift(db, {
    giftId: "badge-level-25", senderId: "sender", recipientId: "recipient",
    giftCode: "crown", coinAmount: gifterXpRequired(25) - 1,
    contextType: "live"
  });
  const milestoneBadge = getGifterBadgeSummary(db, "sender");
  assert.equal(milestoneBadge.level, 25);
  assert.equal(milestoneBadge.tier, "Platinum");
  assert.equal(milestoneBadge.liveEntranceUnlocked, true);
});

test("duplicate ledger entries never increase a member's public gifter level", () => {
  const db = { gifterProgressionLedger: [] };
  const gift = {
    giftId: "same-gift", senderId: "sender", recipientId: "recipient",
    giftCode: "rose", coinAmount: 100, contextType: "member"
  };
  recordGifterGift(db, gift);
  db.gifterProgressionLedger.push({ ...db.gifterProgressionLedger[0] });
  assert.equal(getGifterBadgeSummary(db, "sender").level, 6);
});

test("admin can unlock all 50 levels without fabricating gifts or Coin spend", () => {
  const db = {
    users: [{ id: "owner", username: "creatorhub", name: "Creator Hub" }],
    gifterProgressionLedger: [],
    gifterBadgeAdminOverrides: [{
      id: "admin-award-1", userId: "owner", grantedLevel: 50,
      grantedBy: "admin", grantedAt: "2026-11-05T12:00:00.000Z"
    }]
  };
  const overview = getGifterProgressionOverview(db, "owner");
  const badge = getGifterBadgeSummary(db, "owner");
  assert.equal(overview.current.level, 50);
  assert.equal(overview.current.xp, 0);
  assert.equal(overview.current.totalCoinsSent, 0);
  assert.equal(overview.current.giftsSent, 0);
  assert.equal(overview.current.badgeSource, "admin_awarded");
  assert.equal(overview.levels.length, 50);
  assert.equal(overview.levels.every(level => level.unlocked), true);
  assert.equal(overview.levels[49].current, true);
  assert.equal(overview.levels.every(level => level.adminAwarded), true);
  assert.equal(badge.level, 50);
  assert.equal(badge.adminAwarded, true);
  assert.equal(db.gifterProgressionLedger.length, 0);
  assert.equal(overview.leaderboard.length, 0);
});

test("admin badge reset preserves lifetime ledger and starts a new progression epoch", () => {
  const resetAt = "2026-11-05T15:00:00.000Z";
  const db = {
    users: [{ id: "owner", username: "creatorhub", name: "Creator Hub" }],
    gifterProgressionLedger: [],
    gifterBadgeAdminOverrides: [{
      id: "admin-award-2", userId: "owner", grantedLevel: 0,
      progressionResetAt: resetAt, grantedBy: "admin"
    }]
  };
  recordGifterGift(db, {
    giftId: "before-reset", senderId: "owner", recipientId: "friend",
    giftCode: "rose", coinAmount: 8, contextType: "member",
    now: new Date("2026-11-05T14:00:00.000Z")
  });
  const afterReset = getGifterProgressionOverview(db, "owner");
  assert.equal(afterReset.current.level, 0);
  assert.equal(afterReset.current.xp, 0);
  assert.equal(afterReset.current.totalCoinsSent, 8);
  assert.equal(afterReset.current.giftsSent, 1);
  assert.equal(afterReset.history.length, 1);
  assert.equal(afterReset.levels.every(level => !level.unlocked), true);
  assert.equal(getGifterBadgeSummary(db, "owner"), null);

  recordGifterGift(db, {
    giftId: "after-reset", senderId: "owner", recipientId: "friend",
    giftCode: "rose", coinAmount: 1, contextType: "member",
    now: new Date("2026-11-05T15:01:00.000Z")
  });
  const afterNewGift = getGifterProgressionOverview(db, "owner");
  assert.equal(afterNewGift.current.level, 1);
  assert.equal(afterNewGift.current.xp, 1);
  assert.equal(afterNewGift.current.totalCoinsSent, 9);
  assert.equal(afterNewGift.history.length, 2);
  assert.equal(afterNewGift.current.progressionResetAt, resetAt);
  assert.equal(afterNewGift.current.badgeSource, "earned");
});

test("NEW GIFTER starts at the first confirmed gift sent and expires after seven days", () => {
  const db = { gifterProgressionLedger: [] };
  const firstGiftAt = new Date("2026-11-05T12:00:00.000Z");
  assert.equal(getNewGifterIdentity(db, "sender", firstGiftAt), null);

  recordGifterGift(db, {
    giftId: "new-gifter-first", senderId: "sender", recipientId: "recipient",
    giftCode: "rose", coinAmount: 1, contextType: "member", now: firstGiftAt
  });
  const active = getNewGifterIdentity(db, "sender", new Date("2026-11-08T12:00:00.000Z"));
  assert.equal(active.label, "NEW GIFTER");
  assert.equal(active.active, true);
  assert.equal(active.startedAt, firstGiftAt.toISOString());
  assert.equal(active.expiresAt, "2026-11-12T12:00:00.000Z");
  assert.equal(getNewGifterIdentity(db, "sender", new Date("2026-11-12T12:00:00.000Z")), null);

  recordGifterGift(db, {
    giftId: "new-gifter-second", senderId: "sender", recipientId: "recipient",
    giftCode: "crown", coinAmount: 5, contextType: "live", now: new Date("2026-11-10T12:00:00.000Z")
  });
  const stillActive = getNewGifterIdentity(db, "sender", new Date("2026-11-11T12:00:00.000Z"));
  assert.equal(stillActive.active, true);
  assert.equal(stillActive.expiresAt, active.expiresAt);
});

test("new accounts have no gifter badge and all levels are locked until sent Coins reach thresholds", () => {
  const db = { users: [{ id: "sender", username: "sender", name: "Sender" }], gifterProgressionLedger: [] };
  const overview = getGifterProgressionOverview(db, "sender");
  assert.equal(overview.current.level, 0);
  assert.equal(overview.current.hasUnlockedBadge, false);
  assert.equal(overview.current.nextLevel, 1);
  assert.equal(overview.current.xpRemaining, 1);
  assert.equal(overview.levels.every(level => !level.unlocked), true);
  assert.equal(getGifterBadgeSummary(db, "sender"), null);

  recordGifterGift(db, {
    giftId: "first-coin", senderId: "sender", recipientId: "recipient",
    giftCode: "rose", coinAmount: 1, contextType: "member", now: new Date("2026-11-05T12:00:00.000Z")
  });
  const afterFirstCoin = getGifterProgressionOverview(db, "sender");
  assert.equal(afterFirstCoin.current.level, 1);
  assert.equal(afterFirstCoin.current.hasUnlockedBadge, true);
  assert.equal(afterFirstCoin.levels[0].unlocked, true);
  assert.equal(afterFirstCoin.levels[1].unlocked, false);
});


test("refunded gifts are excluded from Gifter XP, badges, history, NEW GIFTER, and rankings", () => {
  const db = {
    users: [{ id: "sender", username: "sender", name: "Sender" }],
    gifterProgressionLedger: []
  };
  const now = new Date("2026-11-05T20:37:31.000Z");
  recordGifterGift(db, {
    giftId: "gift-refund-2", senderId: "sender", recipientId: "recipient",
    giftCode: "rose", coinAmount: 30000, contextType: "live", now
  });
  assert.equal(getGifterProgressionOverview(db, "sender").current.xp, 30000);
  assert.ok(getNewGifterIdentity(db, "sender", new Date("2026-11-05T21:00:00.000Z")));

  const result = refundGifterGift(db, "gift-refund-2", new Date("2026-11-05T21:08:14.000Z"));
  assert.equal(result.reversed, true);
  assert.equal(db.gifterProgressionLedger.length, 1);
  assert.ok(db.gifterProgressionLedger[0].refundedAt);

  const overview = getGifterProgressionOverview(db, "sender");
  assert.equal(overview.current.xp, 0);
  assert.equal(overview.current.totalCoinsSent, 0);
  assert.equal(overview.current.giftsSent, 0);
  assert.equal(overview.current.level, 0);
  assert.equal(overview.history.length, 0);
  assert.equal(overview.leaderboard.length, 0);
  assert.equal(getGifterBadgeSummary(db, "sender"), null);
  assert.equal(getNewGifterIdentity(db, "sender", new Date("2026-11-05T21:00:00.000Z")), null);
  assert.equal(refundGifterGift(db, "gift-refund-2").reason, "already_refunded");
});


test("LIVE Top Gifters rankings use confirmed LIVE Coins, period windows, broadcast scope and earned titles", () => {
  const db = {
    users: [
      { id: "host", username: "host", name: "Host" },
      { id: "one", username: "one", name: "First gifter" },
      { id: "two", username: "two", name: "Second gifter" },
      { id: "member", username: "member", name: "Member-only sender" }
    ],
    gifterProgressionLedger: []
  };
  const now = new Date("2026-11-07T17:00:00.000Z");
  recordGifterGift(db, {
    giftId: "live-one-a", senderId: "one", recipientId: "host",
    giftCode: "crown", coinAmount: 100, contextType: "live",
    broadcastId: "room-a", now: new Date("2026-11-07T16:00:00.000Z")
  });
  recordGifterGift(db, {
    giftId: "live-two-a", senderId: "two", recipientId: "host",
    giftCode: "rose", coinAmount: 40, contextType: "live",
    broadcastId: "room-a", now: new Date("2026-11-07T16:10:00.000Z")
  });
  recordGifterGift(db, {
    giftId: "live-one-b", senderId: "one", recipientId: "host",
    giftCode: "crown", coinAmount: 50, contextType: "live",
    broadcastId: "room-b", now: new Date("2026-11-07T16:20:00.000Z")
  });
  recordGifterGift(db, {
    giftId: "member-only", senderId: "member", recipientId: "host",
    giftCode: "rose", coinAmount: 900, contextType: "member",
    now: new Date("2026-11-07T16:30:00.000Z")
  });
  recordGifterGift(db, {
    giftId: "live-old", senderId: "two", recipientId: "host",
    giftCode: "rose", coinAmount: 500, contextType: "live",
    broadcastId: "room-a", now: new Date("2026-10-20T16:00:00.000Z")
  });

  const room = getLiveGifterLeaderboard(db, { broadcastId: "room-a", now, limit: 10 });
  assert.deepEqual(room.map(item => [item.userId, item.points]), [["two", 540], ["one", 100]]);
  assert.equal(room[0].title, "TOP GIFTER");
  assert.equal(room[1].title, "TOP 3 GIFTER");

  const daily = getLiveGifterLeaderboard(db, { period: "daily", now, timeZone: "America/Jamaica" });
  assert.deepEqual(daily.map(item => [item.userId, item.points]), [["one", 150], ["two", 40]]);
  assert.equal(daily[0].title, "TOP GIFTER");

  const weekly = getLiveGifterLeaderboard(db, { period: "weekly", now, timeZone: "America/Jamaica" });
  assert.deepEqual(weekly.map(item => item.userId), ["one", "two"]);
  const allTime = getLiveGifterLeaderboard(db, { period: "all_time", now, timeZone: "America/Jamaica" });
  assert.deepEqual(allTime.map(item => [item.userId, item.points]), [["two", 540], ["one", 150]]);
  assert.equal(allTime.some(item => item.userId === "member"), false);
});
