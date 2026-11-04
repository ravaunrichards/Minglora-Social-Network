import test from "node:test";
import assert from "node:assert/strict";
import {
  getGifterLevel,
  getGifterLevelChart,
  gifterXpRequired,
  recordGifterGift,
  getGifterProgressionOverview
} from "../../backend/modules/gifter-progression/service.js";

test("gifter levels use ascending lifetime XP thresholds from level 1 through 50", () => {
  assert.equal(gifterXpRequired(1), 0);
  assert.equal(gifterXpRequired(2), 100);
  assert.ok(gifterXpRequired(50) > gifterXpRequired(49));
  assert.equal(getGifterLevel(0), 1);
  assert.equal(getGifterLevel(99), 1);
  assert.equal(getGifterLevel(100), 2);
  assert.equal(getGifterLevel(gifterXpRequired(50)), 50);
  assert.equal(getGifterLevelChart(0).length, 50);
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
  assert.equal(overview.current.level, 2);
  assert.equal(overview.current.rankPosition, 1);
  assert.equal(overview.history.length, 1);
  assert.equal(overview.history[0].contextType, "live");
  assert.equal(overview.leaderboard.length, 2);
});
