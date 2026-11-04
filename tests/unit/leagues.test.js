import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATOR_LEAGUE_CLASSES, MATCH_RANKS, ensureCreatorLeagueProfile,
  recordLiveGiftForLeagues, settleCreatorLeagueDay, createCreatorLeagueMatch,
  acceptCreatorLeagueMatch, useCreatorLeaguePowerup, supportCreatorLeagueMatch,
  settleExpiredLeagueMatches, getCreatorLeagueOverview, listCreatorLeagueMatches
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


test("League reads collapse duplicate creator profiles and repeated active matches without double-counting scores", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const profile = {
    userId: "creator-a", region: "JAMAICA", leagueClass: "D5",
    fragments: 2, leagueShields: 0, lifetimeGiftPoints: 20,
    seasonPoints: 15, seasonKey: "2026-11-02",
    matchRankIndex: 0, matchRankPoints: 0,
    matchWins: 0, matchLosses: 0, matchDraws: 0,
    createdAt: now.toISOString(), updatedAt: now.toISOString()
  };
  db.creatorLeagueProfiles.push({ ...profile }, { ...profile, updatedAt: new Date(now.getTime() + 1000).toISOString() });
  const match = {
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    status: "live", scores: { challenger: 20, opponent: 10 },
    supporters: [], activeEffects: [], pendingEffects: [], events: [],
    timeBoostUsed: { challenger: false, opponent: false },
    createdAt: now.toISOString(), startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 300000).toISOString()
  };
  db.creatorLeagueMatches.push(
    { ...match, id: "match-copy-1" },
    { ...match, id: "match-copy-2", scores: { challenger: "20", opponent: "10" } }
  );

  ensureCreatorLeagueProfile(db, "creator-a", "JAMAICA", now);
  const matches = listCreatorLeagueMatches(db, db.users, "creator-a", now);

  assert.equal(db.creatorLeagueProfiles.length, 1);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].scores.challenger, 20);
  assert.equal(matches[0].scores.opponent, 10);
});

test("completed match history uses the supplied clock rather than the server wall clock", () => {
  const db = blankDb();
  const now = new Date("2020-01-10T12:00:00.000Z");
  db.creatorLeagueMatches.push({
    id: "recent-completed-match",
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    status: "completed", result: "win", winnerId: "creator-a",
    scores: { challenger: 10, opponent: 5 },
    supporters: [], activeEffects: [], pendingEffects: [], events: [],
    timeBoostUsed: { challenger: false, opponent: false },
    createdAt: "2020-01-05T11:00:00.000Z",
    startedAt: "2020-01-05T11:00:00.000Z",
    completedAt: "2020-01-05T12:00:00.000Z"
  });

  const matches = listCreatorLeagueMatches(db, db.users, "creator-a", now);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "recent-completed-match");
});

test("legacy string match scores are normalized before viewer support is added", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const match = {
    id: "string-score-match",
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    status: "live", scores: { challenger: "0", opponent: "0" },
    supporters: [], activeEffects: [], pendingEffects: [], events: [],
    timeBoostUsed: { challenger: false, opponent: false },
    createdAt: now.toISOString(), startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 300000).toISOString()
  };
  db.creatorLeagueMatches.push(match);

  supportCreatorLeagueMatch(db, match, "viewer-1", "challenger", now);
  assert.equal(match.scores.challenger, 3);
  assert.equal(typeof match.scores.challenger, "number");
});


test("stale live snapshots never revive a completed League Match during deduplication", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const completedAt = new Date(now.getTime() - 60000).toISOString();
  const matchId = "same-match-id";
  db.creatorLeagueMatches.push(
    {
      id: matchId, challengerId: "creator-a", opponentId: "creator-b",
      challengerSessionId: "live-a", opponentSessionId: "live-b",
      status: "completed", result: "win", winnerId: "creator-a",
      scores: { challenger: 25, opponent: 10 }, ratingAwarded: true,
      supporters: [], activeEffects: [], pendingEffects: [], events: [],
      timeBoostUsed: { challenger: false, opponent: false },
      createdAt: new Date(now.getTime() - 360000).toISOString(),
      startedAt: new Date(now.getTime() - 300000).toISOString(),
      completedAt
    },
    {
      id: matchId, challengerId: "creator-a", opponentId: "creator-b",
      challengerSessionId: "live-a", opponentSessionId: "live-b",
      status: "live", scores: { challenger: 25, opponent: 10 },
      supporters: [], activeEffects: [], pendingEffects: [], events: [],
      timeBoostUsed: { challenger: false, opponent: false },
      createdAt: new Date(now.getTime() - 360000).toISOString(),
      startedAt: new Date(now.getTime() - 300000).toISOString(),
      endsAt: new Date(now.getTime() + 300000).toISOString(),
      updatedAt: now.toISOString()
    }
  );

  const matches = listCreatorLeagueMatches(db, db.users, "creator-a", now);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, "completed");
  assert.equal(matches[0].ratingAwarded, true);
  assert.equal(matches[0].winnerId, "creator-a");
});


test("League actions update the canonical record after duplicate matches are compacted", () => {
  const db = blankDb();
  const now = new Date("2026-11-04T12:00:00.000Z");
  const base = {
    id: "duplicate-action-match",
    challengerId: "creator-a", opponentId: "creator-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    giftMode: "all", selectedGiftCode: null, status: "pending",
    scores: { challenger: 0, opponent: 0 }, supporters: [],
    activeEffects: [], pendingEffects: [], events: [],
    timeBoostUsed: { challenger: false, opponent: false },
    timerMode: "flexible",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 120000).toISOString()
  };
  db.creatorLeagueMatches.push({ ...base }, { ...base });

  const staleAcceptReference = db.creatorLeagueMatches[0];
  const accepted = acceptCreatorLeagueMatch(db, staleAcceptReference, "creator-b", now);
  assert.equal(accepted.status, "live");
  assert.equal(db.creatorLeagueMatches.length, 1);
  assert.equal(db.creatorLeagueMatches[0].status, "live");

  db.creatorLeagueMatches.push({
    ...structuredClone(db.creatorLeagueMatches[0]),
    updatedAt: new Date(now.getTime() + 1).toISOString()
  });
  const staleSupportReference = db.creatorLeagueMatches[0];
  supportCreatorLeagueMatch(db, staleSupportReference, "viewer-1", "challenger", new Date(now.getTime() + 1000));
  assert.equal(db.creatorLeagueMatches.length, 1);
  assert.equal(db.creatorLeagueMatches[0].scores.challenger, 3);
  assert.ok(db.creatorLeagueMatches[0].supporters.some(item => item.userId === "viewer-1"));

  db.creatorLeagueMatches.push({
    ...structuredClone(db.creatorLeagueMatches[0]),
    updatedAt: new Date(now.getTime() + 2).toISOString()
  });
  const stalePowerupReference = db.creatorLeagueMatches[0];
  useCreatorLeaguePowerup(db, stalePowerupReference, "creator-a", "score_multiplier", new Date(now.getTime() + 2000));
  assert.equal(db.creatorLeagueMatches.length, 1);
  assert.ok(db.creatorLeagueMatches[0].activeEffects.some(item => item.type === "score_multiplier"));
  assert.equal(db.creatorLeaguePowerupUses.length, 1);
});
