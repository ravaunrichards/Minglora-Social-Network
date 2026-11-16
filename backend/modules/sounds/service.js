export const SOUND_AUDIO_MIME_TYPES = Object.freeze([
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm",
  "audio/wav", "audio/x-wav", "audio/flac", "audio/aac"
]);

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);

export function validateSoundInput(input = {}) {
  const title = cleanText(input.title, 100);
  const attribution = cleanText(input.attribution, 100);
  const rightsConfirmed = input.rightsConfirmed === true;
  const allowReuse = input.allowReuse === true;
  const durationMs = Number(input.durationMs || 0);
  const errors = [];
  if (title.length < 2) errors.push("Sound title must contain at least 2 characters.");
  if (!rightsConfirmed) errors.push("Confirm that you own this recording or have permission to publish it.");
  if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > 60 * 60 * 1000) {
    errors.push("Sound duration is invalid.");
  }
  return {
    valid: errors.length === 0,
    errors,
    value: { title, attribution, rightsConfirmed, allowReuse, durationMs }
  };
}

export function normalizeSoundtrackInput(input) {
  if (input == null || input === false) return { valid: true, value: null, errors: [] };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, value: null, errors: ["Choose a valid Minglora sound."] };
  }
  const soundId = cleanText(input.soundId, 80);
  const startMs = Number(input.startMs ?? 0);
  const endMs = Number(input.endMs ?? 0);
  const volume = Number(input.volume ?? 1);
  const fadeInMs = Number(input.fadeInMs ?? 0);
  const fadeOutMs = Number(input.fadeOutMs ?? 0);
  const errors = [];
  if (!soundId) errors.push("Choose a sound from Minglora Sounds.");
  if (!Number.isSafeInteger(startMs) || startMs < 0 || startMs > 3600000) errors.push("Sound start position is invalid.");
  if (!Number.isSafeInteger(endMs) || endMs < 0 || endMs > 3600000) errors.push("Sound end position is invalid.");
  if (endMs > 0 && endMs <= startMs) errors.push("Sound end must be after its start position.");
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) errors.push("Sound volume must be between 0 and 100%.");
  if (!Number.isSafeInteger(fadeInMs) || fadeInMs < 0 || fadeInMs > 30000) errors.push("Fade-in duration is invalid.");
  if (!Number.isSafeInteger(fadeOutMs) || fadeOutMs < 0 || fadeOutMs > 30000) errors.push("Fade-out duration is invalid.");
  if (endMs > startMs && fadeInMs + fadeOutMs > endMs - startMs) errors.push("Fade durations cannot exceed the selected sound clip.");
  return {
    valid: errors.length === 0,
    errors,
    value: errors.length ? null : { soundId, startMs, endMs, volume, fadeInMs, fadeOutMs }
  };
}

export function canUseSound(sound, userId) {
  return Boolean(sound && sound.status === "active" &&
    (sound.ownerId === userId || sound.allowReuse === true));
}

export function soundUsageCounts(db) {
  const counts = new Map();
  for (const post of db.posts || []) {
    const id = post.soundtrack?.soundId;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const story of db.stories || []) {
    const id = story.soundtrack?.soundId;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function normalizeSoundCollections(db) {
  if (!Array.isArray(db.sounds)) db.sounds = [];
  if (!Array.isArray(db.soundFavorites)) db.soundFavorites = [];
  const uniqueSounds = new Map();
  for (const sound of db.sounds) {
    if (!sound?.id || !sound?.assetId || !sound?.ownerId) continue;
    if (!uniqueSounds.has(sound.id)) uniqueSounds.set(sound.id, sound);
  }
  db.sounds = [...uniqueSounds.values()];
  const uniqueFavorites = new Map();
  for (const favorite of db.soundFavorites) {
    if (!favorite?.userId || !favorite?.soundId) continue;
    uniqueFavorites.set(favorite.userId + ":" + favorite.soundId, favorite);
  }
  db.soundFavorites = [...uniqueFavorites.values()];
  return db;
}
