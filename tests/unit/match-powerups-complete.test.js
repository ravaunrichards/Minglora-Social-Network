import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_POWERUPS,
  createCreatorLeagueMatch,
  acceptCreatorLeagueMatch,
  useCreatorLeaguePowerup,
  recordLiveGiftForLeagues,
  ensureCreatorLeagueProfile,
  listCreatorLeagueMatches
} from "../../backend/modules/leagues/service.js";

const START = new Date("2026-11-16T16:00:00.000Z");
function blankDb() {
  return {
    users: [], creatorLeagueProfiles: [], creatorLeagueGiftLedger: [],
    creatorLeagueDailyScores: [], creatorLeagueDailySettlements: [],
    creatorLeagueMatches: [], creatorLeaguePowerupUses: [], creatorLeagueEvents: []
  };
}
function liveMatch() {
  const db = blankDb();
  const match = createCreatorLeagueMatch(db, {
    challengerId: "host-a", opponentId: "host-b",
    challengerSessionId: "live-a", opponentSessionId: "live-b",
    giftMode: "all", now: START
  });
  acceptCreatorLeagueMatch(db, match, "host-b", START);
  return { db, match };
}
function gift(db, { id, senderId, side = "challenger", points, at = START, random }) {
  return recordLiveGiftForLeagues(db, {
    giftId: id, senderId, recipientId: side === "challenger" ? "host-a" : "host-b",
    broadcastId: side === "challenger" ? "live-a" : "live-b",
    giftCode: "rose", coinAmount: points, now: at, ...(random ? { random } : {})
  });
}

test("the complete Match Power-Up catalog contains the six reference mechanics", () => {
  assert.deepEqual(MATCH_POWERUPS.map(item => item.id), [
    "boosting_glove", "magic_mist", "stun_hammer",
    "time_maker", "boosters", "speed_challenge"
  ]);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "boosting_glove").durationMs, 30000);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "boosting_glove").chance, 0.30);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "boosting_glove").multiplier, 5);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "magic_mist").durationMs, 30000);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "stun_hammer").durationMs, 30000);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "time_maker").durationMs, 10000);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "time_maker").maxUsesPerMatch, 3);
  assert.deepEqual(MATCH_POWERUPS.find(item => item.id === "boosters").ranks, [2, 3]);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "speed_challenge").durationMs, 52000);
});

test("Boosting Glove applies a 5x Match score bonus at 30% chance, never Creator League points", () => {
  const { db, match } = liveMatch();
  useCreatorLeaguePowerup(db, match, "host-a", "boosting_glove", START);
  const hit = gift(db, {
    id: "glove-hit", senderId: "gifter-a", points: 10,
    at: new Date(START.getTime() + 1000), random: () => 0.29
  });
  const miss = gift(db, {
    id: "glove-miss", senderId: "gifter-b", points: 10,
    at: new Date(START.getTime() + 2000), random: () => 0.30
  });
  assert.equal(hit.matchPoints, 50);
  assert.equal(miss.matchPoints, 10);
  const expired = gift(db, {
    id: "glove-expired", senderId: "gifter-c", points: 10,
    at: new Date(START.getTime() + 31000), random: () => 0.01
  });
  assert.equal(expired.matchPoints, 10);
  assert.equal(match.scores.challenger, 70);
  const profile = ensureCreatorLeagueProfile(db, "host-a", "GLOBAL", START);
  assert.equal(profile.seasonPoints, 30);
  assert.equal(profile.lifetimeGiftPoints, 30);
  assert.equal(db.creatorLeagueDailyScores[0].points, 30);
});

test("Magic Mist hides only the activated side's score from the opposing creator", () => {
  const { db, match } = liveMatch();
  gift(db, { id: "before-mist", senderId: "gifter-a", points: 25 });
  const activatedAt = new Date(START.getTime() + 1000);
  useCreatorLeaguePowerup(db, match, "host-a", "magic_mist", activatedAt);
  const viewerAt = new Date(START.getTime() + 2000);
  const ownView = listCreatorLeagueMatches(db, db.users, "host-a", viewerAt)[0];
  const opponentView = listCreatorLeagueMatches(db, db.users, "host-b", viewerAt)[0];
  const spectatorView = listCreatorLeagueMatches(db, db.users, "spectator", viewerAt)[0];

  assert.equal(ownView.scores.challenger, 25);
  assert.equal(ownView.scoreVisibility.challenger, true);
  assert.equal(opponentView.scores.challenger, null);
  assert.equal(opponentView.scoreVisibility.challenger, false);
  assert.equal(spectatorView.scores.challenger, 25);
  assert.equal(spectatorView.scoreVisibility.challenger, true);
  const afterExpiry = listCreatorLeagueMatches(db, db.users, "host-b", new Date(START.getTime() + 32000))[0];
  assert.equal(afterExpiry.scoreVisibility.challenger, true);
});

test("Stun Hammer applies a 30-second opponent-side visual effect without changing scores", () => {
  const { db, match } = liveMatch();
  useCreatorLeaguePowerup(db, match, "host-a", "stun_hammer", START);
  assert.deepEqual(match.scores, { challenger: 0, opponent: 0 });
  const view = listCreatorLeagueMatches(db, db.users, "host-b", new Date(START.getTime() + 1000))[0];
  assert.ok(view.matchEffects.some(effect =>
    effect.type === "stun_hammer" && effect.side === "challenger" && effect.targetSide === "opponent"
  ));
  const afterExpiry = listCreatorLeagueMatches(db, db.users, "host-b", new Date(START.getTime() + 31000))[0];
  assert.equal(afterExpiry.matchEffects.some(effect => effect.type === "stun_hammer"), false);
  assert.equal(MATCH_POWERUPS.find(item => item.id === "stun_hammer").durationMs, 30000);
});

test("Time Maker adds 10 seconds per use and enforces three shared uses per match", () => {
  const { db, match } = liveMatch();
  const originalEnd = Date.parse(match.endsAt);
  useCreatorLeaguePowerup(db, match, "host-a", "time_maker", new Date(START.getTime() + 1000));
  useCreatorLeaguePowerup(db, match, "host-b", "time_maker", new Date(START.getTime() + 2000));
  useCreatorLeaguePowerup(db, match, "host-a", "time_maker", new Date(START.getTime() + 3000));
  assert.equal(match.timeMakerUses, 3);
  assert.equal(Date.parse(match.endsAt), originalEnd + 30000);
  assert.throws(
    () => useCreatorLeaguePowerup(db, match, "host-b", "time_maker", new Date(START.getTime() + 4000)),
    /three-use limit/i
  );
});

test("Boosters double Gifts from both the No. 2 and No. 3 ranked match gifters", () => {
  const { db, match } = liveMatch();
  gift(db, { id: "rank-one", senderId: "gifter-1", points: 100, at: new Date(START.getTime() + 100) });
  gift(db, { id: "rank-two", senderId: "gifter-2", points: 50, at: new Date(START.getTime() + 200) });
  gift(db, { id: "rank-three", senderId: "gifter-3", points: 25, at: new Date(START.getTime() + 300) });
  useCreatorLeaguePowerup(db, match, "host-a", "boosters", new Date(START.getTime() + 400));

  const second = gift(db, {
    id: "rank-two-bonus", senderId: "gifter-2", points: 10,
    at: new Date(START.getTime() + 500)
  });
  const third = gift(db, {
    id: "rank-three-bonus", senderId: "gifter-3", points: 10,
    at: new Date(START.getTime() + 600)
  });
  const fourth = gift(db, {
    id: "rank-four-no-bonus", senderId: "gifter-4", points: 10,
    at: new Date(START.getTime() + 700)
  });

  assert.equal(second.matchPoints, 20);
  assert.equal(third.matchPoints, 20);
  assert.equal(fourth.matchPoints, 10);
  const afterExpiry = gift(db, {
    id: "rank-two-after-expiry", senderId: "gifter-2", points: 10,
    at: new Date(START.getTime() + 31000)
  });
  assert.equal(afterExpiry.matchPoints, 10);
  const bonusEvents = match.events.filter(event => event.type === "gift_score" && event.triggeredEffects?.includes("boosters"));
  assert.deepEqual(bonusEvents.map(event => event.senderRank), [2, 3]);
  assert.equal(ensureCreatorLeagueProfile(db, "host-a", "GLOBAL", START).seasonPoints, 215);
});

test("Speed Challenge doubles both match sides for 52 seconds, once per match", () => {
  const { db, match } = liveMatch();
  const activatedAt = new Date(START.getTime() + 1000);
  useCreatorLeaguePowerup(db, match, "host-a", "speed_challenge", activatedAt);
  assert.equal(Date.parse(match.speedChallenge.expiresAt), activatedAt.getTime() + 52000);
  assert.throws(
    () => useCreatorLeaguePowerup(db, match, "host-b", "speed_challenge", new Date(START.getTime() + 2000)),
    /already been used/i
  );
  const duringA = gift(db, { id: "speed-a", senderId: "gifter-a", points: 10, at: new Date(START.getTime() + 3000) });
  const duringB = gift(db, { id: "speed-b", senderId: "gifter-b", side: "opponent", points: 10, at: new Date(START.getTime() + 4000) });
  const after = gift(db, { id: "speed-ended", senderId: "gifter-c", points: 10, at: new Date(START.getTime() + 54000) });
  assert.equal(duringA.matchPoints, 20);
  assert.equal(duringB.matchPoints, 20);
  assert.equal(after.matchPoints, 10);
  assert.equal(ensureCreatorLeagueProfile(db, "host-a", "GLOBAL", START).seasonPoints, 20);
  assert.equal(ensureCreatorLeagueProfile(db, "host-b", "GLOBAL", START).seasonPoints, 10);
});
