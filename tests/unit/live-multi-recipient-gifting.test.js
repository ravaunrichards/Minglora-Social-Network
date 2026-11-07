import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => readFileSync(path.join(root, file), "utf8");
const server = read("src/server.js");
const app = read("public/app.js");
const runtime = read("supabase/functions/minglora-runtime-state/index.ts");
const migration = read("supabase/migrations/20261106100000_minglora_live_multi_recipient_gifting.sql");

test("LIVE gift recipient list is derived from connected LiveKit participants", () => {
  assert.match(server, /gift-recipients/);
  assert.match(server, /listLiveKitParticipants\(session\.roomName\)/);
  assert.match(server, /recipientId!==String\(session\.hostId\)&&\(!recipientParticipant\|\|!\['guest','cohost'\]\.includes/);
});

test("viewers can gift hosts or guests and hosts and guests can gift each other", () => {
  assert.match(app, /id='live-gift-recipient'/);
  assert.match(app, /loadLiveGiftRecipients\(session\)/);
  assert.doesNotMatch(app, /if\(!gift\|\|liveGiftSending\|\|role==="host"\|\|!giftsEnabled\)return/);
  assert.match(app, /recipientUserId/);
  assert.match(server, /recipientUserId:recipientId/);
  assert.match(server, /!\['guest','cohost'\]\.includes\(String\(recipientParticipant\.role\|\|''\)\)/);
  assert.match(runtime, /p_recipient_id: recipientUserId/);
});

test("the database credits the selected recipient and preserves source-backed earnings", () => {
  assert.match(migration, /p_recipient_id uuid/);
  assert.match(migration, /lp\.role IN \('guest','cohost'\)/);
  assert.match(migration, /lp\.status='connected'/);
  assert.match(migration, /receiver_id,[\s\S]*?creator_share_minor/);
  assert.match(migration, /p_recipient_id,gift\.code/);
  assert.match(migration, /creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor/);
  assert.match(migration, /eligible_gross := cash_used\+marketing_used/);
});

test("gift event reports the selected recipient and broadcasts across the room", () => {
  assert.match(server, /recipient:\{id:String\(recipientId\)/);
  assert.match(server, /creatorId:recipientId/);
  assert.match(server, /broadcastLiveKitData\(session\.roomName,\{type:'minglora\.live\.gift'/);
  assert.match(app, /recipient:\{id:selectedRecipient\.id/);
});
