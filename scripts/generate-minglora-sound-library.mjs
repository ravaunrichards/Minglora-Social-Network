import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OUT=path.join(ROOT,"public","assets","sound-studio");
const legacyFolders=["voice","video","notifications"];

fs.mkdirSync(OUT,{recursive:true});
// Retire only the old synthesized subfolders. Preserve the dedicated assets/
// folder because it contains the downloaded authentic recordings.
for(const folder of legacyFolders){
  fs.rmSync(path.join(OUT,folder),{recursive:true,force:true});
}
fs.mkdirSync(path.join(OUT,"assets"),{recursive:true});
const manifest={
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  source:"Authentic recordings are published only by scripts/validate-authentic-audio-library.mjs after per-file provenance, commercial and redistribution rights, checksum, human authenticity review and playback-test validation.",
  voiceRingtones:[],
  videoRingtones:[],
  notifications:[],
  counts:{voiceRingtones:0,videoRingtones:0,notifications:0,total:0}
};
fs.writeFileSync(path.join(OUT,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
fs.writeFileSync(path.join(OUT,"README.txt"),
  "Minglora Authentic Sound Studio library\n"+
  "The former 120 procedurally synthesized WAV cues have been retired and are not accepted.\n"+
  "Only original, authentic recordings with verified provenance, commercial-use permission, hosted redistribution permission, SHA-256 integrity, human authenticity review and playback testing may be placed in assets/ and approved in data/minglora-authentic-audio-library.json.\n"+
  "Run npm run check:audio-library to validate approved assets and publish the Sound Studio manifest.\n"
);
console.log("Retired generated sound tones; preserved the authentic asset directory and wrote an empty-safe manifest.");
