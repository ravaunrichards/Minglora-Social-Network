export const DEFAULT_EXPERIENCE_SETTINGS = Object.freeze({
  style: 'minglora',
  chlStyle: 'default',
  typography: 'system',
  surfaces: 'standard',
  density: 'comfortable',
  motion: 'standard',
  contrast: 'standard',
  customAccentColor: '#1769e0',
  customBackgroundColor: '#f1f3f7',
  wallpaperType: 'gradient',
  wallpaperFit: 'cover',
  wallpaperColor: '#f1f3f7',
  wallpaperGradient: 'linear-gradient(135deg, #eaf1ff, #f7f1ff)',
  wallpaperOpacity: 100,
  wallpaperBlur: 0,
  avatarFrame: 'none',
  screenSaverEnabled: false,
  screenSaverEffect: 'bubbles',
  screenSaverWaitValue: 60,
  screenSaverWaitUnit: 'minutes',
  screenSaverText: 'Welcome to Minglora',
  osdClock: true,
  osdDate: true,
  osdNotifications: false,
  osdBattery: true,
  osdPosition: 'top-right',
  osdOpacity: 85,
  soundMode: 'sound',
  vibrateOnRing: true,
  voiceCallSound: true,
  videoCallSound: true,
  messageSound: true,
  notificationSound: true,
  ringtoneVolume: 80,
  mediaVolume: 80,
  notificationVolume: 80,
  systemVolume: 80,
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '07:00',
  dndAllowedCalls: 'none',
  notificationSort: 'newest',
  lockScreenNotifications: 'content',
  fontScale: 100,
  screenZoom: 100,
  screenTimeoutSeconds: 60,
  inAppBrightness: 100,
  showBatteryPercentage: true,
  dataSaverEnabled: false,
  parentalControlsEnabled: false
});

const ENUMS = {
  style: ['minglora', 'chl-night', 'chl-ocean', 'chl-violet', 'chl-emerald', 'chl-rose', 'chl-light'],
  chlStyle: ['default', 'minimal', 'flat', 'swiss', 'editorial', 'material', 'fluent', 'glass', 'frost', 'neo', 'brutal', 'neumorphic', 'clay', 'aurora', 'cyber', 'memphis', 'y2k', 'pixel', 'skeuo'],
  typography: ['system', 'studio', 'readable'],
  surfaces: ['standard', 'soft', 'sharp'],
  density: ['comfortable', 'compact'],
  motion: ['standard', 'reduced'],
  contrast: ['standard', 'high'],
  wallpaperType: ['none', 'color', 'gradient', 'image', 'video'],
  wallpaperFit: ['fit', 'fill', 'stretch', 'tile', 'center', 'span', 'cover', 'contain', 'custom'],
  wallpaperGradient: ['linear-gradient(135deg, #eaf1ff, #f7f1ff)', 'linear-gradient(135deg, #071923, #163f57)', 'linear-gradient(135deg, #2b1245, #7a2f78)', 'linear-gradient(135deg, #092b1d, #3b8c63)', 'linear-gradient(135deg, #321426, #a33f72)', 'linear-gradient(135deg, #f4f6fb, #ffffff)'],
  avatarFrame: ['none', 'glow', 'ribbon', 'glass', 'neon'],
  screenSaverEffect: ['bubbles', 'text', 'mystifying', 'photos', 'ribbons', 'particles', 'stars', 'waves', 'fireflies', 'clock', 'none'],
  screenSaverWaitUnit: ['seconds', 'minutes', 'hours'],
  osdPosition: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
  soundMode: ['sound', 'vibrate', 'mute'],
  dndAllowedCalls: ['everyone', 'none'],
  notificationSort: ['newest', 'oldest', 'unread', 'priority', 'people', 'category'],
  lockScreenNotifications: ['content', 'hide-content', 'icon-only', 'hidden'],
  screenTimeoutSeconds: [15, 30, 60, 120, 300, 600, 1800]
};
const BOOLEAN_KEYS = [
  'screenSaverEnabled', 'osdClock', 'osdDate', 'osdNotifications', 'osdBattery',
  'vibrateOnRing', 'voiceCallSound', 'videoCallSound', 'messageSound',
  'notificationSound', 'dndEnabled', 'showBatteryPercentage', 'dataSaverEnabled',
  'parentalControlsEnabled'
];
const RANGE_KEYS = {
  wallpaperOpacity: [0, 100],
  wallpaperBlur: [0, 24],
  osdOpacity: [0, 100],
  ringtoneVolume: [0, 100],
  mediaVolume: [0, 100],
  notificationVolume: [0, 100],
  systemVolume: [0, 100],
  fontScale: [85, 150],
  screenZoom: [85, 150],
  inAppBrightness: [50, 120],
  screenSaverWaitValue: [5, 7200]
};
const COLOR_KEYS = ['customAccentColor', 'customBackgroundColor', 'wallpaperColor'];
const TIME_KEYS = ['dndStart', 'dndEnd'];
const TEXT_LIMITS = { screenSaverText: 120 };

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isClock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function validateExperienceSettingsPatch(current, patch) {
  if (!isRecord(patch)) return { valid: false, error: 'Experience settings must be an object.' };
  const next = { ...DEFAULT_EXPERIENCE_SETTINGS, ...(isRecord(current) ? current : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_EXPERIENCE_SETTINGS, key)) {
      return { valid: false, error: 'Unsupported experience setting: ' + key };
    }
    if (ENUMS[key]) {
      if (!ENUMS[key].includes(value)) return { valid: false, error: 'Choose a supported value for ' + key + '.' };
    } else if (BOOLEAN_KEYS.includes(key)) {
      if (typeof value !== 'boolean') return { valid: false, error: key + ' must be true or false.' };
    } else if (RANGE_KEYS[key]) {
      const [min, max] = RANGE_KEYS[key];
      if (!Number.isInteger(value) || value < min || value > max) return { valid: false, error: key + ' is outside its supported range.' };
    } else if (COLOR_KEYS.includes(key)) {
      if (!isColor(value)) return { valid: false, error: key + ' must be a six-digit HEX color.' };
    } else if (TIME_KEYS.includes(key)) {
      if (!isClock(value)) return { valid: false, error: key + ' must use 24-hour HH:MM format.' };
    } else if (Object.hasOwn(TEXT_LIMITS, key)) {
      if (typeof value !== 'string' || value.length > TEXT_LIMITS[key]) return { valid: false, error: key + ' is too long.' };
    }
    next[key] = value;
  }
  const waitMultiplier = next.screenSaverWaitUnit === 'hours' ? 3600 : next.screenSaverWaitUnit === 'minutes' ? 60 : 1;
  if (next.screenSaverWaitValue * waitMultiplier > 24 * 60 * 60) {
    return { valid: false, error: 'Screen saver wait cannot exceed 24 hours.' };
  }
  return { valid: true, settings: next };
}
