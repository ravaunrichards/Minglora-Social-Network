import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATOR_LEAGUE_CLASSES, MATCH_RANKS, ensureCreatorLeagueProfile,
  recordLiveGiftForLeagues, settleCreatorLeagueDay, createCreatorLeagueMatch,
  acceptCreatorLeagueMatch, useCreatorLeaguePowerup, supportCreatorLeagueMatch,
  settleExpiredLeagueMatches, getCreatorLeagueOverview
} from "../../backend/modules/leagues/service.js";

function blankDb() { return { users: [], creatorLeagueProfiles: [], creatorLeagueGiftLedger: [], creatorLeagueDailyScores: [], creatorLeagueDailySettlements: [], creatorLeagueMatches: [], creatorLeaguePowerupUses: [], creatorLeagueEvents: [] }; }

test("Minglora keeps the full creator class and match rank hierarchies", () => {
  assert.equal(CREATOR_LEAGUE_CLASSES[0], "D5");
  assert.equal(CREATOR_LEAGUE_CLASSES.at(-1), "A1");
  assert.equal(CREATOR_LEAGUE_CLASSES.length, 18);
  assert.equal(MATCH_RANKS[0], "Bronze III");
  assert.equal(MATCH_RANKS.at(-1), "Grandmaster");
  assert.equal(MATCH_RANKS.length, 21);
});

test("only confirmed LIVE Gift value enters Creator League points, once per transaction", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const first = recordLiveGiftForLeagues(db, { giftId: "gift-1", recipientId: "creator-1", broadcastId: "live-1", giftCode: "rose", coinAmount: 50, now });
  const duplicate = recordLiveGiftForLeagues(db, { giftId: "gift-1", recipientId: "creator-1", broadcastId: "live-1", giftCode: "rose", coinAmount: 50, now });
  assert.equal(first.creatorLeaguePoints, 50);
  assert.equal(duplicate.reason, "duplicate_transaction");
  const profile = ensureCreatorLeagueProfile(db, "creator-1", "JAMAICA", now);
  assert.equal(profile.lifetimeGiftPoints, 50);
  assert.equal(profile.seasonPoints, 50);
  assert.equal(db.creatorLeagueDailyScores[0].points, 50);
});

test("match boosts affect match score only, not Creator League points", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const match = createCreatorLeagueMatch(db, {
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    giftMode: "all", now
  });
  acceptCreatorLeagueMatch(db, match, "creator-b", now);
  useCreatorLeaguePowerup(db, match, "creator-a", "score_multiplier", now);
  const result = recordLiveGiftForLeagues(db, {
    giftId: "gift-match-1", recipientId: "creator-a", broadcastId: "live-a",
    giftCode: "rose", coinAmount: 10, now: new Date(now.getTime() + 1000)
  });
  assert.equal(result.creatorLeaguePoints, 10);
  assert.equal(result.matchPoints, 20);
  assert.equal(match.scores.challenger, 20);
  const profile = ensureCreatorLeagueProfile(db, "creator-a", "GLOBAL", now);
  assert.equal(profile.seasonPoints, 10);
});

test("Shield blocks an opposing boost bonus but never removes the base Gift score; fixed-timer matches reject Time Boost", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const match = createCreatorLeagueMatch(db, {
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    giftMode: "all", now
  });
  acceptCreatorLeagueMatch(db, match, "creator-b", now);
  useCreatorLeaguePowerup(db, match, "creator-a", "shield", now);
  useCreatorLeaguePowerup(db, match, "creator-b", "score_multiplier", now);
  const result = recordLiveGiftForLeagues(db, {
    giftId: "gift-shield-block", recipientId: "creator-b", broadcastId: "live-b",
    giftCode: "rose", coinAmount: 10, now: new Date(now.getTime() + 1000)
  });
  assert.equal(result.creatorLeaguePoints, 10);
  assert.equal(result.matchPoints, 10);
  assert.equal(match.scores.opponent, 10);
  assert.ok(match.events.some(item => item.type === "shield_blocked_bonus" && item.side === "challenger"));
  match.timerMode = "fixed";
  assert.throws(() => useCreatorLeaguePowerup(db, match, "creator-a", "time_boost", now), /fixed-timer/i);
});

test("one viewer may support one side of a live match only once", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const match = createCreatorLeagueMatch(db, {
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    giftMode: "all", now
  });
  acceptCreatorLeagueMatch(db, match, "creator-b", now);
  supportCreatorLeagueMatch(db, match, "viewer-1", "challenger", now);
  assert.equal(match.scores.challenger, 3);
  assert.throws(() => supportCreatorLeagueMatch(db, match, "viewer-1", "opponent", now), /already supported/i);
  assert.throws(() => supportCreatorLeagueMatch(db, match, "creator-a", "opponent", now), /cannot support/i);
});

test("daily regional placements award promotion fragments and keep D5 as the floor", () => {
  const db = blankDb();
  const start = new Date("2026-11-02T12:00:00.000Z");
  ensureCreatorLeagueProfile(db, "creator-top", "JAMAICA", start);
  ensureCreatorLeagueProfile(db, "creator-bottom", "JAMAICA", start);
  for (let offset = 0; offset < 4; offset += 1) {
    const day = new Date(start.getTime() + offset * 86400000);
    const dayKey = day.toISOString().slice(0,10);
    db.creatorLeagueDailyScores.push(
      { id: "top-" + offset, userId: "creator-top", dayKey, points: 100 },
      { id: "bottom-" + offset, userId: "creator-bottom", dayKey, points: 10 }
    );
    settleCreatorLeagueDay(db, dayKey, new Date(day.getTime() + 86400000));
  }
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "creator-top").leagueClass, "D4");
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "creator-top").leagueShields, 1);
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "creator-bottom").leagueClass, "D5");
});

test("match completion awards match rating only once", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const match = createCreatorLeagueMatch(db, {
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    giftMode: "all", now
  });
  acceptCreatorLeagueMatch(db, match, "creator-b", now);
  match.scores.challenger = 20;
  match.scores.opponent = 10;
  match.endsAt = new Date(now.getTime() - 1000).toISOString();
  assert.equal(settleExpiredLeagueMatches(db, now), 1);
  assert.equal(settleExpiredLeagueMatches(db, now), 0);
  assert.equal(ensureCreatorLeagueProfile(db, "creator-a", "GLOBAL", now).matchRankPoints, 25);
  assert.equal(ensureCreatorLeagueProfile(db, "creator-b", "GLOBAL", now).matchRankPoints, 0);
  assert.equal(getCreatorLeagueOverview(db, {id:"creator-a",country:"JAMAICA"}, now).profile.matchRank, "Bronze III");
});


test("tied daily boundaries do not cause arbitrary promotions or demotions", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  ensureCreatorLeagueProfile(db, "creator-a", "JAMAICA", now);
  ensureCreatorLeagueProfile(db, "creator-b", "JAMAICA", now);
  const dayKey = now.toISOString().slice(0, 10);
  db.creatorLeagueDailyScores.push(
    { id: "score-a", userId: "creator-a", dayKey, points: 100 },
    { id: "score-b", userId: "creator-b", dayKey, points: 100 }
  );
  settleCreatorLeagueDay(db, dayKey, now);
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "creator-a").leagueClass, "D5");
  assert.equal(db.creatorLeagueProfiles.find(item => item.userId === "creator-b").leagueClass, "D5");
});
