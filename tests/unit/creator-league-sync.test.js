import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureCreatorLeagueProfile,
  recordLiveGiftForLeagues,
  settleCreatorLeagueDay,
  settleScheduledCreatorLeagueDays
} from "../../backend/modules/leagues/service.js";

function makeDb() {
  return {
    users: [],
    creatorLeagueProfiles: [],
    creatorLeagueGiftLedger: [],
    creatorLeagueDailyScores: [],
    creatorLeagueDailySettlements: [],
    creatorLeagueMatches: [],
    creatorLeaguePowerupUses: [],
    creatorLeagueEvents: []
  };
}

test("an inactive creator stays in the starting class through empty daily settlements", () => {
  const db = makeDb();
  const now = new Date("2026-11-15T12:00:00.000Z");
  const profile = ensureCreatorLeagueProfile(db, "inactive-creator", "GLOBAL", now);

  for (let day = 1; day <= 7; day += 1) {
    const dayKey = "2026-11-" + String(day).padStart(2, "0");
    const result = settleCreatorLeagueDay(db, dayKey, now);
    assert.equal(result.settled, true);
    assert.equal(profile.leagueClass, "D5");
    assert.equal(profile.fragments, 0);
    assert.equal(profile.leagueShields, 0);
  }
});

test("daily League placement awards the supplied fragment thresholds independently of lifetime totals", () => {
  const db = makeDb();
  const previousDay = new Date("2026-11-05T12:00:00.000Z");
  const currentDay = new Date("2026-11-06T12:00:00.000Z");

  recordLiveGiftForLeagues(db, {
    giftId: "top-creator-gift",
    recipientId: "top-creator",
    region: "GLOBAL",
    coinAmount: 1000,
    now: previousDay
  });
  recordLiveGiftForLeagues(db, {
    giftId: "second-creator-gift",
    recipientId: "second-creator",
    region: "GLOBAL",
    coinAmount: 100,
    now: previousDay
  });

  const firstRun = settleScheduledCreatorLeagueDays(db, currentDay);
  const topProfile = db.creatorLeagueProfiles.find(item => item.userId === "top-creator");
  const secondProfile = db.creatorLeagueProfiles.find(item => item.userId === "second-creator");

  assert.deepEqual(firstRun.settledDays, ["2026-11-05"]);
  assert.equal(firstRun.placementsProcessed, 2);
  assert.equal(topProfile.fragments, 2, "first place in D5 earns the reference +2 fragment band");
  assert.equal(topProfile.leagueClass, "D5", "two fragments do not promote before four are accumulated");
  assert.equal(secondProfile.fragments, 0, "lower placement in D5 earns no fragment");
  assert.equal(secondProfile.leagueClass, "D5");
  assert.equal(db.creatorLeagueDailySettlements.length, 1);

  const secondRun = settleScheduledCreatorLeagueDays(db, currentDay);
  assert.deepEqual(secondRun.settledDays, []);
  assert.equal(topProfile.fragments, 2, "a completed day is not rewarded twice");
  assert.equal(topProfile.leagueClass, "D5");
  assert.equal(db.creatorLeagueDailySettlements.length, 1);
});

test("scheduled reconciliation corrects season and lifetime points for every creator from non-refunded ledger entries", () => {
  const db = makeDb();
  const profile = ensureCreatorLeagueProfile(
    db,
    "creator-one",
    "GLOBAL",
    new Date("2026-11-06T12:00:00.000Z")
  );
  profile.seasonKey = "2026-10-26";
  profile.seasonPoints = 9999;
  profile.lifetimeGiftPoints = 9999;

  db.creatorLeagueGiftLedger.push(
    {
      id: "old-season-ledger",
      giftId: "old-season-gift",
      userId: "creator-one",
      coinAmount: 300,
      dayKey: "2026-10-30",
      seasonKey: "2026-10-26",
      createdAt: "2026-10-30T12:00:00.000Z"
    },
    {
      id: "current-season-ledger",
      giftId: "current-season-gift",
      userId: "creator-one",
      coinAmount: 200,
      dayKey: "2026-11-06",
      seasonKey: "2026-11-02",
      createdAt: "2026-11-06T12:00:00.000Z"
    },
    {
      id: "refunded-ledger",
      giftId: "refunded-gift",
      userId: "creator-one",
      coinAmount: 150,
      dayKey: "2026-11-06",
      seasonKey: "2026-11-02",
      refundedAt: "2026-11-06T12:30:00.000Z",
      status: "refunded",
      createdAt: "2026-11-06T12:15:00.000Z"
    }
  );

  const result = settleScheduledCreatorLeagueDays(db, new Date("2026-11-06T13:00:00.000Z"));

  assert.equal(result.profilesUpdated, 1);
  assert.equal(profile.seasonKey, "2026-11-02");
  assert.equal(profile.seasonPoints, 200);
  assert.equal(profile.lifetimeGiftPoints, 500);
});

test("scheduled reconciliation creates a default Creator League profile for every account", () => {
  const db = makeDb();
  db.users = [
    { id: "new-creator", username: "new_creator" },
    { id: "jamaica-creator", username: "jamaica_creator", country: "Jamaica" }
  ];

  const now = new Date("2026-11-06T13:00:00.000Z");
  const firstRun = settleScheduledCreatorLeagueDays(db, now);

  assert.equal(firstRun.profilesCreated, 2);
  assert.equal(firstRun.changed, true);
  assert.equal(db.creatorLeagueProfiles.length, 2);
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "new-creator").leagueClass, "D5");
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "jamaica-creator").region, "JAMAICA");

  const secondRun = settleScheduledCreatorLeagueDays(db, now);
  assert.equal(secondRun.profilesCreated, 0);
  assert.equal(db.creatorLeagueProfiles.length, 2);
});
