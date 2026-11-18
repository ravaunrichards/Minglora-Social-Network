import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_POWERUPS,
  createCreatorLeagueMatch,
  acceptCreatorLeagueMatch,
  recordLiveGiftForLeagues,
  useCreatorLeaguePowerupCard,
  listCreatorLeagueMatches,
  settleExpiredLeagueMatches,
  getCreatorLeagueOverview
} from "../../backend/modules/leagues/service.js";

const START = new Date("2026-11-18T16:00:00.000Z");
function blankDb() {
  return {
    users: [
      { id: "creator-a", name: "Creator A" },
      { id: "creator-b", name: "Creator B" },
      { id: "viewer", name: "Viewer" }
    ],
    creatorLeagueProfiles: [],
    creatorLeagueGiftLedger: [],
    creatorLeagueDailyScores: [],
    creatorLeagueDailySettlements: [],
    creatorLeagueMatches: [],
    creatorLeaguePowerupUses: [],
    creatorLeaguePowerupInventory: [],
    creatorLeagueEvents: []
  };
}
function liveMatch() {
  const db = blankDb();
  const match = createCreatorLeagueMatch(db, {
    challengerId: "creator-a",
    opponentId: "creator-b",
    challengerSessionId: "live-a",
    opponentSessionId: "live-b",
    giftMode: "all",
    now: START
  });
  acceptCreatorLeagueMatch(db, match, "creator-b", START);
  return { db, match };
}
function card(db, powerupId, creatorId = "creator-a", userId = "viewer", suffix = powerupId) {
  const entry = {
    id: "card-" + suffix + "-" + db.creatorLeaguePowerupInventory.length,
    userId,
    creatorId,
    matchId: "awarded-match",
    powerupId,
    rank: 1,
    awardedAt: START.toISOString(),
    expiresAt: new Date(START.getTime() + 5 * 86400000).toISOString(),
    usedAt: null,
    usedInMatchId: null
  };
  db.creatorLeaguePowerupInventory.push(entry);
  return entry;
}
function use(db, match, entry, side = "challenger", at = new Date(START.getTime() + 1000)) {
  return useCreatorLeaguePowerupCard(db, match, entry.userId, entry.id, side, at);
}
function gift(db, match, { id, senderId, side = "challenger", points, at = new Date(START.getTime() + 2000), random }) {
  return recordLiveGiftForLeagues(db, {
    giftId: id,
    senderId,
    recipientId: side === "challenger" ? match.challengerId : match.opponentId,
    broadcastId: side === "challenger" ? match.challengerSessionId : match.opponentSessionId,
    giftCode: "rose",
    coinAmount: points,
    now: at,
    ...(random ? { random } : {})
  });
}

test("the reference Match Power-Up deck contains all six approved effects", () => {
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

test("Boosting Glove applies a deterministic 5x match-only score chance", () => {
  const { db, match } = liveMatch();
  const entry = card(db, "boosting_glove");
  use(db, match, entry);
  const result = gift(db, match, { id: "glove-gift", senderId: "gifter-1", points: 20, random: () => 0.29 });
  assert.equal(result.creatorLeaguePoints, 20);
  assert.equal(result.matchPoints, 100);
  assert.equal(match.scores.challenger, 100);
  assert.equal(db.creatorLeagueGiftLedger[0].coinAmount, 20);
});

test("Boosting Glove does not trigger when the 30 percent roll misses", () => {
  const { db, match } = liveMatch();
  const entry = card(db, "boosting_glove");
  use(db, match, entry);
  const result = gift(db, match, { id: "glove-miss", senderId: "gifter-1", points: 20, random: () => 0.30 });
  assert.equal(result.matchPoints, 20);
  assert.equal(match.scores.challenger, 20);
});

test("Boosters doubles only confirmed No. 2 and No. 3 gifters on the activating side", () => {
  const { db, match } = liveMatch();
  gift(db, match, { id: "rank-1", senderId: "gifter-1", points: 30 });
  gift(db, match, { id: "rank-2", senderId: "gifter-2", points: 20 });
  gift(db, match, { id: "rank-3", senderId: "gifter-3", points: 10 });
  const entry = card(db, "boosters");
  use(db, match, entry, "challenger", new Date(START.getTime() + 3000));
  const rankTwo = gift(db, match, { id: "rank-2-bonus", senderId: "gifter-2", points: 5, at: new Date(START.getTime() + 4000) });
  const rankThree = gift(db, match, { id: "rank-3-bonus", senderId: "gifter-3", points: 5, at: new Date(START.getTime() + 5000) });
  const rankFour = gift(db, match, { id: "rank-4-normal", senderId: "gifter-4", points: 12, at: new Date(START.getTime() + 6000) });
  assert.equal(rankTwo.matchPoints, 10);
  assert.equal(rankThree.matchPoints, 10);
  assert.equal(rankFour.matchPoints, 12);
});

test("Magic Mist hides an activating side from the opposing creator without changing scoring or neutral visibility", () => {
  const { db, match } = liveMatch();
  const entry = card(db, "magic_mist");
  use(db, match, entry);
  const result = gift(db, match, { id: "mist-gift", senderId: "gifter-1", points: 25 });
  assert.equal(result.matchPoints, 25);
  const now = new Date(START.getTime() + 3000);
  const opposingCreator = listCreatorLeagueMatches(db, db.users, "creator-b", now, {
    broadcastId: "live-b",
    viewerHostId: "creator-b"
  }).find(item => item.id === match.id);
  assert.equal(opposingCreator.scoreVisibility.challenger, false);
  assert.equal(opposingCreator.scores.challenger, null);
  assert.ok(!opposingCreator.events.some(item => item.type === "gift_score" && item.side === "challenger"));
  const neutral = listCreatorLeagueMatches(db, db.users, "viewer", now, {
    broadcastId: "live-b",
    viewerHostId: "neutral-host"
  }).find(item => item.id === match.id);
  assert.equal(neutral.scores.challenger, 25);
});

test("Stun Hammer targets the opposing LIVE panel without modifying match score", () => {
  const { db, match } = liveMatch();
  const entry = card(db, "stun_hammer");
  use(db, match, entry);
  const result = gift(db, match, { id: "hammer-gift", senderId: "gifter-1", side: "opponent", points: 10 });
  assert.equal(result.matchPoints, 10);
  const view = listCreatorLeagueMatches(db, db.users, "viewer", new Date(START.getTime() + 3000), {
    broadcastId: "live-b",
    viewerHostId: "creator-b"
  }).find(item => item.id === match.id);
  const hammer = view.matchEffects.find(item => item.type === "stun_hammer");
  assert.equal(hammer.targetSide, "opponent");
  assert.equal(hammer.impactCount, 1);
  assert.equal(match.scores.opponent, 10);
});

test("Time Maker adds ten seconds per activation and enforces three shared match uses", () => {
  const { db, match } = liveMatch();
  const initialEnd = Date.parse(match.endsAt);
  for (let index = 1; index <= 3; index += 1) {
    const entry = card(db, "time_maker", "creator-a", "viewer", "time-" + index);
    use(db, match, entry);
  }
  assert.equal(match.timeMakerUses, 3);
  assert.equal(Date.parse(match.endsAt), initialEnd + 30000);
  const fourth = card(db, "time_maker", "creator-a", "viewer", "time-four");
  assert.throws(() => use(db, match, fourth), /three-use limit/i);
});

test("Speed Challenge is a single 52-second 2x bonus round for both sides", () => {
  const { db, match } = liveMatch();
  const entry = card(db, "speed_challenge");
  use(db, match, entry);
  assert.equal(Date.parse(match.speedChallenge.expiresAt) - Date.parse(match.speedChallenge.startedAt), 52000);
  const challenger = gift(db, match, { id: "speed-a", senderId: "gifter-a", points: 10 });
  const opponent = gift(db, match, { id: "speed-b", senderId: "gifter-b", side: "opponent", points: 8 });
  assert.equal(challenger.matchPoints, 20);
  assert.equal(opponent.matchPoints, 16);
  const second = card(db, "speed_challenge", "creator-a", "viewer", "speed-second");
  assert.throws(() => use(db, match, second), /already been used/i);
});

test("Backpack cards are creator-bound, single-use, expire and appear in the owner's League overview", () => {
  const { db, match } = liveMatch();
  const entry = card(db, "magic_mist");
  const overview = getCreatorLeagueOverview(db, { id: "viewer", country: "GLOBAL" }, START);
  assert.equal(overview.powerupInventory.length, 1);
  assert.equal(overview.powerupInventory[0].powerup.id, "magic_mist");
  assert.throws(() => useCreatorLeaguePowerupCard(db, match, "creator-a", entry.id, "challenger", START), /creators cannot use/i);
  assert.throws(() => useCreatorLeaguePowerupCard(db, match, "viewer", entry.id, "opponent", START), /earned for/i);
  use(db, match, entry);
  assert.throws(() => use(db, match, entry), /already been used/i);
  const expired = card(db, "boosting_glove", "creator-a", "viewer", "expired");
  expired.expiresAt = new Date(START.getTime() - 1).toISOString();
  assert.throws(() => use(db, match, expired), /expired/i);
});

test("only the winning side top three confirmed, non-refunded Gifters receive cards once", () => {
  const { db, match } = liveMatch();
  gift(db, match, { id: "award-1", senderId: "gifter-1", points: 30 });
  gift(db, match, { id: "award-2", senderId: "gifter-2", points: 20 });
  gift(db, match, { id: "award-3", senderId: "gifter-3", points: 10 });
  gift(db, match, { id: "award-4", senderId: "gifter-4", points: 5 });
  gift(db, match, { id: "losing-side", senderId: "gifter-5", side: "opponent", points: 2 });
  const refunded = db.creatorLeagueGiftLedger.find(item => item.giftId === "award-3");
  refunded.refundedAt = new Date(START.getTime() + 4000).toISOString();
  settleExpiredLeagueMatches(db, new Date(START.getTime() + 6 * 60 * 1000));
  assert.equal(match.status, "completed");
  assert.equal(match.winnerId, "creator-a");
  assert.equal(match.powerupRewardsDistributed, true);
  assert.equal(match.powerupAwards.length, 3);
  assert.deepEqual(match.powerupAwards.map(item => item.rank), [1, 2, 3]);
  assert.ok(match.powerupAwards.every(item => item.creatorId === "creator-a"));
  assert.equal(db.creatorLeaguePowerupInventory.length, 3);
  assert.equal(new Set(db.creatorLeaguePowerupInventory.map(item => item.userId)).size, 3);
  assert.ok(db.creatorLeaguePowerupInventory.every(item => Date.parse(item.expiresAt) - Date.parse(item.awardedAt) === 5 * 86400000));
  settleExpiredLeagueMatches(db, new Date(START.getTime() + 7 * 60 * 1000));
  assert.equal(db.creatorLeaguePowerupInventory.length, 3);
});
