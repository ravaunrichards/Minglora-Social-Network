import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const liveKit = readFileSync(path.join(root, "backend/modules/live/livekit.js"), "utf8");
const server = readFileSync(path.join(root, "src/server.js"), "utf8");
const app = readFileSync(path.join(root, "public/app.js"), "utf8");

test("confirmed LIVE gifts are reliably broadcast to every connected room participant", () => {
  assert.match(liveKit, /sendData\(roomName, payload, DataPacket_Kind\.RELIABLE, \{ topic: String\(topic\) \}\)/);
  assert.match(server, /broadcastLiveKitData\(session\.roomName,\{type:'minglora\.live\.gift',version:1,event:liveGiftEvent\},'minglora-live-gift'\)/);
  assert.match(server, /Room-wide gift broadcast failed; polling remains the recovery path/);
});

test("host, guest, viewer, and sender use the same deduplicated 3D gift presentation", () => {
  assert.match(app, /function presentLiveGiftEvent\(event\)/);
  assert.match(app, /rememberLiveGiftEvent\(eventId\)/);
  assert.match(app, /MingloraGiftFX\?\.mount\(stage,gift\)/);
  assert.match(app, /topic==="minglora-live-gift"&&\!participant\?\.identity/);
  assert.match(app, /for\(const event of events\)presentLiveGiftEvent\(event\)/);
  assert.doesNotMatch(app, /if\(String\(event\.sender\?\.id\|\|''\)===String\(state\.user\?\.id\|\|''\)\)continue/);
});

test("LIVE entry primes browser audio and retains polling recovery", () => {
  assert.match(app, /async function openLiveRoom\(session,role,issuedLiveKit\)\{\n  stopLiveChatRefresh\(\);stopLiveSpeakerRefresh\(\);stopLiveParticipantSync\(\);[\s\S]*?window\.MingloraGiftFX\?\.prime\(\);/);
  assert.match(app, /liveGiftEventsTimer=setInterval\(\(\)=>void refreshLiveGiftEvents\(session\),2200\)/);
});
