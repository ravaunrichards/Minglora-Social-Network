import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXPERIENCE_SETTINGS, validateExperienceSettingsPatch } from '../src/domain/experience-settings.js';

test('experience settings start with safe, explicit defaults', () => {
  const result = validateExperienceSettingsPatch({}, {});
  assert.equal(result.valid, true);
  assert.equal(result.settings.style, 'minglora');
  assert.equal(result.settings.chlStyle, 'default');
  assert.equal(result.settings.screenTimeoutSeconds, 60);
  assert.equal(result.settings.dndAllowedCalls, 'none');
  assert.equal(result.settings.screenSaverEnabled, false);
});

test('experience settings accept valid theme, screen saver and device preferences', () => {
  const result = validateExperienceSettingsPatch(DEFAULT_EXPERIENCE_SETTINGS, {
    style: 'chl-ocean',
    chlStyle: 'glass',
    screenSaverEnabled: true,
    screenSaverEffect: 'bubbles',
    screenSaverWaitValue: 60,
    screenSaverWaitUnit: 'minutes',
    soundMode: 'vibrate',
    dndEnabled: true,
    dndStart: '22:30',
    dndEnd: '07:00',
    screenTimeoutSeconds: 1800
  });
  assert.equal(result.valid, true);
  assert.equal(result.settings.style, 'chl-ocean');
  assert.equal(result.settings.chlStyle, 'glass');
  assert.equal(result.settings.soundMode, 'vibrate');
  assert.equal(result.settings.screenTimeoutSeconds, 1800);
});

test('experience settings reject unsupported keys and invalid device values', () => {
  assert.equal(validateExperienceSettingsPatch({}, { airplaneMode: true }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { screenTimeoutSeconds: 90 }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { screenSaverWaitValue: 0 }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { screenSaverWaitValue: 1441, screenSaverWaitUnit: 'minutes' }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { screenSaverWaitValue: 24, screenSaverWaitUnit: 'hours' }).valid, true);
  assert.equal(validateExperienceSettingsPatch({}, { customAccentColor: 'red' }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { dndAllowedCalls: 'favorites' }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { chlStyle: 'totally-invalid' }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { dndStart: '25:99' }).valid, false);
});

test('experience settings patch preserves unrelated saved values', () => {
  const first = validateExperienceSettingsPatch({}, { style: 'chl-rose', dndEnabled: true });
  const second = validateExperienceSettingsPatch(first.settings, { soundMode: 'mute' });
  assert.equal(second.settings.style, 'chl-rose');
  assert.equal(second.settings.dndEnabled, true);
  assert.equal(second.settings.soundMode, 'mute');
});

test('experience settings validate separate call ringtones and per-event notification sounds', () => {
  const result = validateExperienceSettingsPatch(DEFAULT_EXPERIENCE_SETTINGS, {
    voiceCallRingtoneId: 'voice-minglora-signature',
    videoCallRingtoneId: 'video-minglora-vision',
    notificationSoundAssignments: {
      message: 'notice-message',
      newFollower: 'notice-newFollower',
      giftReceived: 'user:original-sound-123'
    }
  });
  assert.equal(result.valid, true);
  assert.equal(result.settings.voiceCallRingtoneId, 'voice-minglora-signature');
  assert.equal(result.settings.videoCallRingtoneId, 'video-minglora-vision');
  assert.equal(result.settings.notificationSoundAssignments.message, 'notice-message');
  assert.equal(result.settings.notificationSoundAssignments.newFollower, 'notice-newFollower');
  assert.equal(result.settings.notificationSoundAssignments.giftReceived, 'user:original-sound-123');
});

test('notification sound assignment patches preserve existing unrelated assignments', () => {
  const first = validateExperienceSettingsPatch(DEFAULT_EXPERIENCE_SETTINGS, {
    notificationSoundAssignments: { message: 'notice-message', like: 'notice-like' }
  });
  const second = validateExperienceSettingsPatch(first.settings, {
    notificationSoundAssignments: { newFollower: 'notice-newFollower' }
  });
  assert.equal(second.valid, true);
  assert.deepEqual(
    { ...second.settings.notificationSoundAssignments },
    { message: 'notice-message', like: 'notice-like', newFollower: 'notice-newFollower' }
  );
});

test('experience settings reject invalid ringtone IDs and notification assignment maps', () => {
  assert.equal(validateExperienceSettingsPatch({}, { voiceCallRingtoneId: '../bad/path' }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { videoCallRingtoneId: 42 }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { notificationSoundAssignments: [] }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { notificationSoundAssignments: { 'bad key': 'notice-message' } }).valid, false);
  assert.equal(validateExperienceSettingsPatch({}, { notificationSoundAssignments: { message: '../external' } }).valid, false);
});
