import test from "node:test";
import assert from "node:assert/strict";
import {
  getGifterLevel,
  getGifterLevelChart,
  gifterXpRequired,
  recordGifterGift,
  getGifterProgressionOverview,
  getGifterBadgeSummary
} from "../../backend/modules/gifter-progression/service.js";

test("gifter levels use the fixed cumulative coin thresholds from the reference chart", () => {
  const thresholds = [
    1, 8, 18, 34, 56, 90, 140, 220, 340, 530,
    820, 1260, 1920, 2840, 4340, 6420, 9280, 13500, 19400, 27600,
    39600, 54600, 75800, 105000, 144000, 196000, 265000, 357000, 478000, 637000,
    845000, 1120000, 1470000, 1920000, 2500000, 3230000, 4180000, 5180000, 6890000, 8780000,
    11200000, 14100000, 17800000, 22300000, 30000000, 37500000, 47500000, 60000000, 75000000, 97500000
  ];
  assert.equal(gifterXpRequired(1), 0);
  assert.equal(gifterXpRequired(2), 8);
  assert.equal(gifterXpRequired(50), 97500000);
  assert.equal(getGifterLevel(0), 1);
  assert.equal(getGifterLevel(7), 1);
  assert.equal(getGifterLevel(8), 2);
  assert.equal(getGifterLevel(17), 2);
  assert.equal(getGifterLevel(18), 3);
  assert.equal(getGifterLevel(143999), 24);
  assert.equal(getGifterLevel(144000), 25);
  assert.equal(getGifterLevel(97500000), 50);
  assert.equal(getGifterLevelChart(0).length, 50);
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
