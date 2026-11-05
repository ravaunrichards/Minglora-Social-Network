import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_MODES,
  LIVE_LAYOUTS,
  broadcastTypeForLiveMode,
  getLivePublishSourceNames,
  normalizeLiveSettings
} from '../../backend/modules/live/settings.js';

test('LIVE modes keep product modes separate from the two persisted media types', () => {
  assert.deepEqual(LIVE_MODES, ['video_audio', 'audio_only', 'mobile_gaming', 'live_studio']);
  assert.equal(broadcastTypeForLiveMode('video_audio'), 'video_audio');
  assert.equal(broadcastTypeForLiveMode('audio_only'), 'audio_only');
  assert.equal(broadcastTypeForLiveMode('mobile_gaming'), 'video_audio');
  assert.equal(broadcastTypeForLiveMode('live_studio'), 'video_audio');
});

test('LIVE settings provide compact, safe defaults', () => {
  const result = normalizeLiveSettings();
  assert.equal(result.valid, true);
  assert.equal(result.settings.noiseSuppression, true);
  assert.equal(result.settings.optimizeForStability, true);
  assert.equal(result.settings.markViewers, true);
  assert.equal(result.settings.communitySafety, true);
  assert.equal(result.settings.groupChatEnabled, true);
  assert.equal(result.settings.liveGifts, true);
  assert.deepEqual(LIVE_LAYOUTS, ['full_screen', 'fluid_panel', 'fluid_grid', 'fixed_grid', 'fixed_panel', 'side_by_side', 'spotlight', 'roundtable_1', 'roundtable_2']);
  assert.equal(result.settings.roomLayout, 'fluid_grid');
  assert.equal(result.settings.allowGuestRequests, true);
  assert.equal(result.settings.guestCamera, true);
  assert.equal(result.settings.autoAcceptRequests, false);
  assert.equal(result.settings.manageModerators, true);
});

test('practice mode automatically disables gifts', () => {
  const result = normalizeLiveSettings({ practiceMode: true, liveGifts: true });
  assert.equal(result.valid, true);
  assert.equal(result.settings.practiceMode, true);
  assert.equal(result.settings.liveGifts, false);
});

test('LIVE setup rejects unknown fields and malformed values', () => {
  assert.equal(normalizeLiveSettings({ guardian: true }).valid, false);
  assert.equal(normalizeLiveSettings({ noiseSuppression: 'yes' }).valid, false);
  assert.equal(normalizeLiveSettings({ groupChatEnabled: 'yes' }).valid, false);
  assert.equal(normalizeLiveSettings({ roomLayout: 'not-a-layout' }).valid, false);
  assert.equal(normalizeLiveSettings({ allowGuestRequests: 'yes' }).valid, false);
  assert.equal(normalizeLiveSettings({ shareRecordingsWithGuests: 'yes' }).valid, false);
  assert.equal(normalizeLiveSettings({ liveQuality: '4k' }).valid, false);
});

test('LiveKit publisher tracks follow mode and role with least privilege', () => {
  assert.deepEqual(getLivePublishSourceNames('video_audio', 'host'), ['MICROPHONE', 'CAMERA', 'SCREEN_SHARE']);
  assert.deepEqual(getLivePublishSourceNames('video_audio', 'guest'), ['MICROPHONE', 'CAMERA']);
  assert.deepEqual(getLivePublishSourceNames('video_audio', 'guest', 'video_audio', { guestCamera: false }), ['MICROPHONE']);
  assert.deepEqual(getLivePublishSourceNames('audio_only', 'host', 'audio_only'), ['MICROPHONE']);
  assert.deepEqual(getLivePublishSourceNames('mobile_gaming', 'host'), ['MICROPHONE', 'SCREEN_SHARE']);
  assert.deepEqual(getLivePublishSourceNames('mobile_gaming', 'guest'), ['MICROPHONE']);
  assert.equal(getLivePublishSourceNames('live_studio', 'viewer'), null);
  assert.deepEqual(getLivePublishSourceNames(null, 'host', 'audio_only'), ['MICROPHONE']);
});

test('client acquisition CTA requires a valid HTTPS destination', () => {
  assert.equal(normalizeLiveSettings({ clientAcquisitionEnabled: true }).valid, false);
  assert.equal(normalizeLiveSettings({
    clientAcquisitionEnabled: true,
    clientCtaLabel: 'Book a consultation',
    clientCtaUrl: 'javascript:alert(1)'
  }).valid, false);
  const valid = normalizeLiveSettings({
    clientAcquisitionEnabled: true,
    clientCtaLabel: 'Book now',
    clientCtaUrl: 'https://example.com/book'
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.settings.clientCtaUrl, 'https://example.com/book');
});
