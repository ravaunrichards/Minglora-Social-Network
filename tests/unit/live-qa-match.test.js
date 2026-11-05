import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLiveSettings } from '../../backend/modules/live/settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('src/server.js');
const app = read('public/app.js');

test('LIVE Q&A, guardian mode and stage effects are first-class validated settings', () => {
  const defaults = normalizeLiveSettings();
  assert.equal(defaults.valid, true);
  assert.equal(defaults.settings.qaEnabled, true);
  assert.equal(defaults.settings.guardianMode, false);
  assert.equal(defaults.settings.effectsEnabled, true);
  assert.equal(normalizeLiveSettings({ qaEnabled: false }).settings.qaEnabled, false);
  assert.equal(normalizeLiveSettings({ guardianMode: true }).settings.guardianMode, true);
  assert.equal(normalizeLiveSettings({ effectsEnabled: false }).settings.effectsEnabled, false);
  assert.equal(normalizeLiveSettings({ qaEnabled: 'yes' }).valid, false);
});

test('LIVE Q&A routes require an active, viewable room and a connected LiveKit participant', () => {
  assert.match(server, /const liveQuestionsMatch=p\.match/);
  assert.match(server, /const liveQuestionAction=p\.match/);
  assert.match(server, /listLiveKitParticipants\(session\.roomName\)/);
  assert.match(server, /Join this LIVE room before asking a question/);
  assert.match(server, /Join this LIVE room before voting on a question/);
  assert.match(server, /Please wait before submitting another LIVE question/);
  assert.match(server, /This LIVE question is closed to voting/);
  assert.match(server, /sessionQuestions\.length>=100/);
});

test('LIVE Q&A moderation and guardian mode are enforced by the server', () => {
  assert.match(server, /Only the LIVE host or an assigned moderator can manage Q&A/);
  for (const action of ['pin', 'unpin', 'answer', 'close', 'reopen']) {
    assert.ok(server.includes("'" + action + "'"), 'missing Q&A action ' + action);
  }
  assert.match(server, /guardianRestricted\.test\(question\)/);
  assert.match(server, /guardianRestricted\.test\(chatBody\)/);
  assert.match(server, /guardianRestricted\.test\(answer\)/);
});

test('LIVE Q&A panel submits, votes, refreshes and exposes host/moderator actions', () => {
  assert.match(app, /function setupLiveQaPanel\(session,role\)/);
  assert.match(app, /\/questions'\s*,\{method:'POST'/);
  assert.match(app, /data-live-qa-vote/);
  assert.match(app, /data-live-qa-action/);
  assert.match(app, /'live-qa-panel'/);
  assert.match(app, /liveQaRefreshTimer=setInterval/);
  assert.match(app, /session\.liveModerators/);
});

test('Creator League Match panel uses the existing challenge, accept, support and power-up API routes', () => {
  assert.match(server, /createCreatorLeagueMatch\(db/);
  assert.match(server, /acceptCreatorLeagueMatch\(db,match,user\.id\)/);
  assert.match(server, /supportCreatorLeagueMatch\(db,match,user\.id/);
  assert.match(server, /useCreatorLeaguePowerup\(db,match,user\.id/);
  assert.match(app, /function setupLiveMatchPanel\(session,role\)/);
  assert.match(app, /\/leagues\/matches/);
  for (const powerup of ['momentum_boost', 'shield', 'score_multiplier', 'time_boost']) {
    assert.ok(app.includes("data-powerup-id='" + powerup + "'"), 'missing ' + powerup + ' control');
  }
  assert.match(app, /data-live-match-action='support-challenger'/);
  assert.match(app, /data-live-match-action='support-opponent'/);
});

test('LIVE recordings remain in the settings panel and use the real private upload routes', () => {
  assert.match(app, /function setupLiveRecordingPanel\(session,role,room\)/);
  assert.match(app, /Start recording/);
  assert.match(app, /Stop & save/);
  assert.match(server, /liveRecordingListMatch/);
  assert.match(server, /media_upload_prepare/);
  assert.match(server, /media_upload_complete/);
  assert.match(server, /sharedWithGuests===true/);
});
