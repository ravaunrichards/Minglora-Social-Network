import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultGiftGalleryTarget,
  getGiftGallery,
  getGiftGalleryPeriod,
  recordGiftGalleryEvent,
  updateGiftGallerySettings
} from "../../backend/modules/gift-gallery/service.js";

function blankDb() {
  return { giftGalleryEvents: [], giftGallerySettings: [], giftGalleryPreferences: [] };
}

test("Gift Gallery periods roll over at Monday midnight in the creator time zone", () => {
  const beforeReset = getGiftGalleryPeriod(new Date("2026-11-09T04:59:59.000Z"), "America/Jamaica");
  const afterReset = getGiftGalleryPeriod(new Date("2026-11-09T05:00:00.000Z"), "America/Jamaica");
  assert.equal(beforeReset.weekKey, "2026-11-02");
  assert.equal(beforeReset.resetsAt, "2026-11-09T05:00:00.000Z");
  assert.equal(afterReset.weekKey, "2026-11-09");
  assert.equal(afterReset.startsAt, "2026-11-09T05:00:00.000Z");
});

test("same-gifter progress lights a gift; gifts from different viewers are never combined", () => {
  const db = blankDb();
  const creator = { id: "creator", country: "Jamaica" };
  const period = getGiftGalleryPeriod(new Date("2026-11-04T12:00:00.000Z"), "America/Jamaica");
  const base = {
    creatorId: creator.id, giftCode: "rose", giftName: "Minglora Rose", emoji: "🌹",
    coinAmount: 1, timeZone: "America/Jamaica"
  };
  for (let i = 0; i < 10; i += 1) {
    assert.equal(recordGiftGalleryEvent(db, {
      ...base, giftId: "a-" + i, senderId: "member-a",
      now: new Date("2026-11-04T12:00:00.000Z")
    }).recorded, true);
  }
  for (let i = 0; i < 10; i += 1) {
    recordGiftGalleryEvent(db, {
      ...base, giftId: "b-" + i, senderId: "member-b",
      now: new Date("2026-11-04T12:00:00.000Z")
    });
  }
  const gallery = getGiftGallery(db, creator, new Date("2026-11-04T12:00:00.000Z"));
  assert.equal(gallery.period.weekKey, period.weekKey);
  assert.equal(gallery.totals.gifts, 20);
  assert.equal(gallery.entries[0].giftCount, 20);
  assert.equal(gallery.entries[0].leadingGifterCount, 10);
  assert.equal(gallery.entries[0].targetCount, 20);
  assert.equal(gallery.entries[0].lit, false);
});

test("lit state, duplicate protection, opt-out, creator toggle, and reset are respected", () => {
  const db = blankDb();
  const creator = { id: "creator", country: "Jamaica" };
  const common = {
    creatorId: creator.id, senderId: "supporter", giftCode: "galaxy",
    coinAmount: 5000, giftName: "Minglora Galaxy", now: new Date("2026-11-04T12:00:00.000Z"),
    timeZone: "America/Jamaica"
  };
  assert.equal(recordGiftGalleryEvent(db, { ...common, giftId: "tx-1" }).recorded, true);
  assert.equal(recordGiftGalleryEvent(db, { ...common, giftId: "tx-1" }).reason, "duplicate_transaction");
  assert.equal(defaultGiftGalleryTarget(5000), 1);
  let gallery = getGiftGallery(db, creator, new Date("2026-11-04T12:00:00.000Z"));
  assert.equal(gallery.entries[0].lit, true);

  updateGiftGallerySettings(db, { userId: "supporter", showInGalleries: false });
  gallery = getGiftGallery(db, creator, new Date("2026-11-04T12:00:00.000Z"));
  assert.equal(gallery.totals.gifts, 0);

  updateGiftGallerySettings(db, { userId: "supporter", showInGalleries: true });
  gallery = getGiftGallery(db, creator, new Date("2026-11-04T12:00:00.000Z"));
  assert.equal(gallery.entries[0].lit, true);

  updateGiftGallerySettings(db, { userId: "creator", enabled: false });
  gallery = getGiftGallery(db, creator, new Date("2026-11-04T12:00:00.000Z"));
  assert.equal(gallery.enabled, false);
  assert.equal(gallery.entries.length, 0);

  updateGiftGallerySettings(db, { userId: "creator", enabled: true });
  gallery = getGiftGallery(db, creator, new Date("2026-11-09T05:00:00.000Z"));
  assert.equal(gallery.totals.gifts, 0);
  assert.equal(gallery.period.weekKey, "2026-11-09");
});
