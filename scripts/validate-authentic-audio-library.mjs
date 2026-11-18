import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuthenticSoundStudioManifest, verifyAuthenticAudioFile } from "../backend/modules/sounds/authentic-audio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data", "minglora-authentic-audio-library.json");
const output = path.join(root, "public", "assets", "sound-studio", "manifest.json");
const library = JSON.parse(fs.readFileSync(source, "utf8"));
if (library.schemaVersion !== 1 || !Array.isArray(library.assets)) {
  throw new Error("Minglora authentic audio library manifest has an unsupported schema.");
}
const approved = library.assets.filter(asset => asset?.status === "approved");
const ids = new Set();
const hashes = new Set();
const failures = [];
for (const asset of approved) {
  if (ids.has(asset.id)) failures.push(String(asset.id || "(missing id)") + ": duplicate asset id.");
  ids.add(asset.id);
  if (hashes.has(asset.sha256)) failures.push(String(asset.id || "(missing id)") + ": duplicate SHA-256; review the duplicate recording.");
  hashes.add(asset.sha256);
  const result = verifyAuthenticAudioFile(asset, { rootDir: root });
  if (!result.valid) failures.push(String(asset.id || "(missing id)") + ": " + result.errors.join(" "));
}
if (failures.length) {
  process.stderr.write("Authentic audio validation failed:\n- " + failures.join("\n- ") + "\n");
  process.exitCode = 1;
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const manifest = buildAuthenticSoundStudioManifest(approved);
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write("Validated " + approved.length + " approved authentic recording(s); " + manifest.counts.total + " active Sound Studio item(s).\n");
}
