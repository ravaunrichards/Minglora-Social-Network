import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureCreatorLeagueProfile,
  recordLiveGiftForLeagues,
  getCreatorLeagueLeaderboard
} from "../../backend/modules/leagues/service.js";

function blankDb() {
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

function addMember(db, id, country = "JAMAICA") {
  db.users.push({ id, name: id, username: id.replaceAll("-", "_"), country });
  ensureCreatorLeagueProfile(db, id, country);
}

function addConfirmedGift(db, giftId, recipientId, coinAmount, now, region = "JAMAICA") {
  return recordLiveGiftForLeagues(db, {
    giftId,
    recipientId,
    region,
    broadcastId: "live-" + recipientId,
    giftCode: "rose",
    coinAmount,
    now
  });
}

test("daily and weekly Creator League rankings browse divisions without mixing regions or score tracks", () => {
  const db = blankDb();
  const now = new Date("2026-11-15T12:00:00.000Z");
  const previousWeek = new Date("2026-11-08T12:00:00.000Z");

  for (const id of ["creator-a", "creator-b", "creator-c", "outside-region"]) addMember(db, id);
  db.users.find(item => item.id === "outside-region").country = "USA";
  db.creatorLeagueProfiles.find(item => item.userId === "outside-region").region = "USA";

  addConfirmedGift(db, "creator-a-old-week", "creator-a", 800, previousWeek);
  addConfirmedGift(db, "creator-a-current-day", "creator-a", 100, now);
  addConfirmedGift(db, "creator-b-current-day", "creator-b", 300, now);
  addConfirmedGift(db, "creator-c-current-day", "creator-c", 985092, now);
  addConfirmedGift(db, "outside-region-current-day", "outside-region", 500, now, "USA");

  const viewer = { id: "creator-a", country: "JAMAICA" };
  const daily = getCreatorLeagueLeaderboard(db, viewer, {
    period: "daily", leagueClass: "D5", now
  });
  const weekly = getCreatorLeagueLeaderboard(db, viewer, {
    period: "weekly", leagueClass: "D5", now
  });
  const higherDivision = getCreatorLeagueLeaderboard(db, viewer, {
    period: "daily", leagueClass: "C1", now
  });

  assert.equal(daily.period, "daily");
  assert.equal(daily.region, "JAMAICA");
  assert.deepEqual(daily.leaderboard.map(item => item.id), ["creator-c", "creator-b", "creator-a"]);
  assert.deepEqual(daily.leaderboard.map(item => item.points), [985092, 300, 100]);

  assert.equal(weekly.period, "weekly");
  assert.deepEqual(weekly.leaderboard.map(item => item.id), ["creator-c", "creator-b", "creator-a"]);
  assert.deepEqual(weekly.leaderboard.map(item => item.points), [985092, 300, 100]);
  assert.equal(weekly.leaderboard.find(item => item.id === "creator-a").lifetimeGiftPoints, 900);

  assert.deepEqual(higherDivision.leaderboard, [], "lifetime gift totals alone do not move a creator into a higher division");
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "creator-c").leagueClass, "D5");
  assert.ok(!daily.leaderboard.some(item => item.id === "outside-region"));
});

test("Creator League ranking rejects unsupported periods and invalid divisions", () => {
  const db = blankDb();
  const now = new Date("2026-11-15T12:00:00.000Z");
  addMember(db, "creator-a");
  const viewer = { id: "creator-a", country: "JAMAICA" };

  assert.throws(
    () => getCreatorLeagueLeaderboard(db, viewer, { period: "monthly", now }),
    /daily or weekly/i
  );
  assert.throws(
    () => getCreatorLeagueLeaderboard(db, viewer, { period: "daily", leagueClass: "A0", now }),
    /valid Creator League class/i
  );
});
