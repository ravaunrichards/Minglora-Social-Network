import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const AUTHENTIC_AUDIO_CATEGORIES = Object.freeze([
  "phone_ringtones","video_call_ringtones","notifications","message_alerts","human_voices",
  "laughter_reactions","animals_wildlife","vehicles_engines","musical_instruments",
  "environment_weather","footsteps_movement","household_everyday","gift_effects",
  "celebration_party","traditional_instruments","jamaican_caribbean","interface_feedback"
]);
export const AUTHENTIC_AUDIO_CALL_TYPES = Object.freeze(["voice","video","notification","effect"]);
export const AUTHENTIC_AUDIO_FORMATS = Object.freeze(["mp3","m4a","ogg","webm","wav","flac","aac"]);
export const AUTHENTIC_RECORDING_METHODS = Object.freeze([
  "field_recording","human_recording","instrument_recording","device_recording",
  "wildlife_recording","archival_recording","environmental_recording"
]);
const SHA256 = /^[a-f0-9]{64}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS = /^https:\/\/\S+$/i;
const AUDIO_ROOT = "public/assets/sound-studio/assets/";

const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
const validHttps = value => {
  if (typeof value !== "string" || !HTTPS.test(value)) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
const validDate = value => DATE_ONLY.test(String(value || "")) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
const validTimestamp = value => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function validateAuthenticAudioAsset(asset) {
  const errors = [];
  if (!isRecord(asset)) return { valid: false, errors: ["Asset record must be an object."] };
  const requireText = (key, min = 2) => {
    if (typeof asset[key] !== "string" || asset[key].trim().length < min) errors.push(key + " is required.");
  };
  requireText("id");
  requireText("name");
  requireText("originalFilename");
  requireText("sourceName");
  requireText("recordingDescription", 20);
  requireText("licenseName");
  requireText("attributionText", asset.attributionRequired === true ? 4 : 0);
  requireText("authenticityReviewNotes", 20);
  requireText("assetPath");
  if (!validHttps(asset.originalDownloadPage)) errors.push("originalDownloadPage must be an HTTPS page for the exact recording.");
  if (!validHttps(asset.licenseUrl)) errors.push("licenseUrl must be an HTTPS link to the applicable license or rights statement.");
  if (!AUTHENTIC_AUDIO_FORMATS.includes(asset.fileFormat)) errors.push("fileFormat is not supported.");
  if (!AUTHENTIC_AUDIO_CALL_TYPES.includes(asset.callType)) errors.push("callType is not supported.");
  if (!AUTHENTIC_AUDIO_CATEGORIES.includes(asset.category)) errors.push("category is not supported.");
  if (!AUTHENTIC_RECORDING_METHODS.includes(asset.recordingMethod)) errors.push("recordingMethod must identify a real-world recording method.");
  if (!validDate(asset.downloadDate)) errors.push("downloadDate must be a valid YYYY-MM-DD date.");
  if (!SHA256.test(String(asset.sha256 || ""))) errors.push("sha256 must contain exactly 64 hexadecimal characters.");
  if (!Number.isSafeInteger(Number(asset.durationMs)) || Number(asset.durationMs) <= 0) errors.push("durationMs must be a positive integer.");
  if (asset.attributionRequired !== true && asset.attributionRequired !== false) errors.push("attributionRequired must be explicitly true or false.");
  if (asset.attributionRequired === true && (typeof asset.attributionText !== "string" || !asset.attributionText.trim())) errors.push("Attribution text is required by this license.");
  if (asset.commercialUseAllowed !== true) errors.push("Commercial use must be explicitly permitted.");
  if (/\bNC\b|non[-\s]?commercial|noncommercial/i.test(String(asset.licenseName || ""))) errors.push("A non-commercial license cannot be used for Minglora commercial features.");
  if (asset.redistributionAllowed !== true) errors.push("Online playback/redistribution by Minglora must be explicitly permitted.");
  if (asset.authenticityVerified !== true) errors.push("A human reviewer must verify that this is an authentic recording.");
  if (!validTimestamp(asset.authenticityReviewedAt)) errors.push("authenticityReviewedAt must record the human authenticity review.");
  if (asset.playbackTested !== true) errors.push("The downloaded file must pass a real playback/listening test.");
  if (!validTimestamp(asset.playbackTestedAt)) errors.push("playbackTestedAt must record the completed playback test.");
  if (asset.status !== "approved") errors.push("Only assets with status 'approved' may enter the active library.");
  for (const flag of ["aiGenerated","robotic","synthetic","procedural","oscillator"]) {
    if (asset[flag] !== false) errors.push(flag + " must be explicitly false.");
  }
  if (asset.generationMethod != null && /ai|synthe|procedur|oscillator|robot/i.test(String(asset.generationMethod))) {
    errors.push("Generated or synthetic audio is not accepted.");
  }
  const relative = String(asset.assetPath || "").replace(/\\/g, "/");
  if (!relative.startsWith(AUDIO_ROOT) || relative.split("/").some(part => part === "..")) {
    errors.push("assetPath must stay inside " + AUDIO_ROOT + ".");
  }
  const expectedPublicUrl = relative.startsWith("public/") ? "/" + relative.slice("public/".length) : "";
  if (asset.publicUrl !== expectedPublicUrl) errors.push("publicUrl must map to the verified public assetPath.");
  const ext = path.extname(relative).replace(/^\./, "").toLowerCase();
  if (asset.fileFormat && ext && ext !== asset.fileFormat) errors.push("fileFormat must match the file extension.");
  return { valid: errors.length === 0, errors };
}

export function detectAudioFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (buffer.toString("ascii", 0, 4) === "fLaC") return "flac";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (buffer.toString("hex", 0, 4) === "1a45dfa3") return "webm";
  if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") return "m4a";
  if (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) return "aac";
    return "mp3";
  }
  return null;
}

export function verifyAuthenticAudioFile(asset, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const errors = [];
  const metadata = validateAuthenticAudioAsset(asset);
  errors.push(...metadata.errors);
  const relative = String(asset?.assetPath || "").replace(/\\/g, "/");
  if (!relative.startsWith(AUDIO_ROOT) || relative.split("/").some(part => part === "..")) {
    return { valid: false, errors: [...errors, "Unsafe asset path."] };
  }
  const absolute = path.resolve(rootDir, relative);
  const expectedRoot = path.resolve(rootDir, AUDIO_ROOT);
  if (!absolute.startsWith(expectedRoot + path.sep)) {
    return { valid: false, errors: [...errors, "Asset path escapes the approved audio directory."] };
  }
  let stat, bytes;
  try {
    const lstat = fs.lstatSync(absolute);
    if (lstat.isSymbolicLink() || !lstat.isFile()) throw new Error("not a regular file");
    stat = fs.statSync(absolute);
    bytes = fs.readFileSync(absolute);
  } catch {
    return { valid: false, errors: [...errors, "The original audio file is missing or is not a regular file."] };
  }
  const detected = detectAudioFormat(bytes);
  if (detected !== asset.fileFormat) errors.push("The file signature does not match fileFormat (" + String(detected || "unknown") + ").");
  const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== String(asset.sha256 || "").toLowerCase()) errors.push("SHA-256 checksum does not match the downloaded file.");
  if (!stat.size) errors.push("The audio file is empty.");
  return { valid: errors.length === 0, errors, bytes: stat.size, sha256: actualHash, detectedFormat: detected };
}

export function buildAuthenticSoundStudioManifest(assets = []) {
  const approved = assets.filter(asset => asset?.status === "approved");
  const map = asset => ({
    id: asset.id,
    name: asset.name,
    kind: asset.callType,
    theme: "authentic",
    category: asset.category,
    filename: asset.originalFilename,
    url: asset.publicUrl,
    durationMs: Number(asset.durationMs),
    sha256: asset.sha256,
    license: asset.licenseName,
    licenseUrl: asset.licenseUrl,
    attributionRequired: asset.attributionRequired,
    attributionText: asset.attributionText || "",
    commercialUseAllowed: true,
    redistributionAllowed: true,
    acceptanceStatus: "approved",
    recordingMethod: asset.recordingMethod,
    authenticRecording: true
  });
  const voiceRingtones = approved.filter(asset => asset.callType === "voice").map(map);
  const videoRingtones = approved.filter(asset => asset.callType === "video").map(map);
  const notifications = approved.filter(asset => asset.callType === "notification" || asset.callType === "effect").map(map);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: "Only individually verified authentic recordings with documented commercial and redistribution rights are published.",
    voiceRingtones,
    videoRingtones,
    notifications,
    counts: {
      voiceRingtones: voiceRingtones.length,
      videoRingtones: videoRingtones.length,
      notifications: notifications.length,
      total: voiceRingtones.length + videoRingtones.length + notifications.length
    }
  };
}
