import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_FAN_CLUB_ACTIVE_DAYS,
  LIVE_FAN_CLUB_GIFT_CODES,
  LIVE_FAN_CLUB_JOIN_COIN_COST,
  LIVE_FAN_CLUB_JOIN_GIFT_CODE,
  LIVE_FAN_CLUB_LEVEL_THRESHOLDS,
  LIVE_FAN_CLUB_SUPER_FAN_LEVEL,
  getLiveFanClubProgress,
  awardLiveFanClubPoints,
  countActiveLiveFanClubMembers,
  getLiveFanClubMembership,
  joinLiveFanClub,
  publicLiveFanClubMembership
} from '../../backend/modules/live/fan-club.js';

const start = new Date('2026-11-05T12:00:00.000Z');
const makeDb = () => ({ liveFanClubMemberships: [], liveFanClubEvents: [] });

test('Fan Club joins require a confirmed Heart Me transaction and start a seven-day membership', () => {
  const db = makeDb();
  assert.equal(LIVE_FAN_CLUB_JOIN_COIN_COST, 1);
  assert.equal(LIVE_FAN_CLUB_JOIN_GIFT_CODE, 'heart-me-2mk7ob');
  assert.throws(() => joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', now: start }), /confirmed one-Coin Heart Me transaction/);
  const result = joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-1', now: start });
  assert.equal(result.alreadyMember, false);
  assert.equal(result.membership.status, 'active');
  assert.equal(result.membership.expiresAt, new Date(start.getTime() + LIVE_FAN_CLUB_ACTIVE_DAYS * 86400000).toISOString());
  assert.equal(countActiveLiveFanClubMembers(db, 'host', start), 1);
});

test('Active Fan Club members are not charged twice when the join action is repeated', () => {
  const db = makeDb();
  joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-1', now: start });
  const result = joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-2', now: new Date(start.getTime() + 1000) });
  assert.equal(result.alreadyMember, true);
  assert.equal(db.liveFanClubMemberships.length, 1);
  assert.equal(result.membership.lastJoinGiftTransactionId, 'gift-tx-1');
});

test('Watch points are rate limited and refresh the seven-day expiry only when awarded', () => {
  const db = makeDb();
  joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-1', now: start });
  const first = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'watch', sourceId: 'watch-1', now: start });
  const tooSoon = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'watch', sourceId: 'watch-2', now: new Date(start.getTime() + 60000) });
  const next = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'watch', sourceId: 'watch-3', now: new Date(start.getTime() + 5 * 60000) });
  assert.equal(first.points, 1);
  assert.equal(tooSoon.awarded, false);
  assert.equal(next.points, 1);
  assert.equal(next.membership.points, 2);
});

test('Chat points are rate limited and gift points are idempotent by transaction ID', () => {
  const db = makeDb();
  joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-1', now: start });
  const chat = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'chat', sourceId: 'chat-1', now: start });
  const chatAgain = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'chat', sourceId: 'chat-2', now: new Date(start.getTime() + 10000) });
  const gift = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'gift', points: 25, sourceId: 'gift-tx-2', now: new Date(start.getTime() + 11000) });
  const duplicate = awardLiveFanClubPoints(db, { hostId: 'host', fanId: 'fan', source: 'gift', points: 25, sourceId: 'gift-tx-2', now: new Date(start.getTime() + 12000) });
  assert.equal(chat.points, 1);
  assert.equal(chatAgain.awarded, false);
  assert.equal(gift.points, 25);
  assert.equal(duplicate.awarded, false);
  assert.equal(gift.membership.points, 26);
});

test('Membership pauses after seven days without points and can be rejoined', () => {
  const db = makeDb();
  joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-1', now: start });
  const expiredAt = new Date(start.getTime() + LIVE_FAN_CLUB_ACTIVE_DAYS * 86400000 + 1);
  const expired = getLiveFanClubMembership(db, 'host', 'fan', expiredAt);
  assert.equal(expired.status, 'paused');
  assert.equal(expired.pauseReason, 'no_fan_points_within_7_days');
  assert.equal(countActiveLiveFanClubMembers(db, 'host', expiredAt), 0);
  const status = publicLiveFanClubMembership(db, 'host', 'fan', expiredAt);
  assert.equal(status.status, 'paused');
  const rejoined = joinLiveFanClub(db, { hostId: 'host', fanId: 'fan', giftTransactionId: 'gift-tx-2', now: expiredAt });
  assert.equal(rejoined.alreadyMember, false);
  assert.equal(rejoined.membership.status, 'active');
});

test('Team Gift allowlist only exposes the selected verified Minglora catalogue codes', () => {
  assert.deepEqual(LIVE_FAN_CLUB_GIFT_CODES, [
    'heart-me-2mk7ob',
    'community-heart-mg6zzi',
    'blue-heart-19gp9xp',
    'flame-heart-yv4ovw',
    'fan-1avs41e'
  ]);
});

test('Fan Club points unlock visible levels and the Super Fan badge', () => {
  assert.equal(LIVE_FAN_CLUB_SUPER_FAN_LEVEL, 5);
  assert.deepEqual(LIVE_FAN_CLUB_LEVEL_THRESHOLDS, [0, 10, 25, 50, 100, 175, 275, 400, 550, 750]);
  const newFan = getLiveFanClubProgress(1);
  assert.equal(newFan.level, 1);
  assert.equal(newFan.title, 'Fan');
  assert.equal(newFan.isSuperFan, false);
  assert.equal(newFan.pointsToNextLevel, 9);
  const almostSuper = getLiveFanClubProgress(99);
  assert.equal(almostSuper.level, 4);
  assert.equal(almostSuper.isSuperFan, false);
  assert.equal(almostSuper.pointsToNextLevel, 1);
  const superFan = getLiveFanClubProgress(100);
  assert.equal(superFan.level, 5);
  assert.equal(superFan.title, 'Super Fan');
  assert.equal(superFan.isSuperFan, true);
  assert.equal(superFan.progressPercent, 0);
  const highest = getLiveFanClubProgress(900);
  assert.equal(highest.level, 10);
  assert.equal(highest.pointsToNextLevel, 0);
  assert.equal(highest.progressPercent, 100);
});
