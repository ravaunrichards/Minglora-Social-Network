import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const server=read("src/server.js"),app=read("public/app.js"),edge=read("supabase/functions/minglora-runtime-state/index.ts");
const mainGift=read("supabase/migrations/20261107110000_minglora_live_multi_recipient_gifting.sql");
const promo=read("supabase/migrations/20261107110001_minglora_admin_promotional_multi_recipient_gifting.sql");
test("LIVE gift recipients are sourced from connected LiveKit participants",()=>{
  assert.match(server,/gift-recipients/);assert.match(server,/listLiveKitParticipants\(session\.roomName\)/);
  assert.match(server,/Join this LIVE room before choosing a gift recipient/);
});
test("LIVE gift UI refreshes its host/guest recipient list and passes the selection",()=>{
  assert.match(app,/id='live-gift-recipient'/);assert.match(app,/loadLiveGiftRecipients\(session\)/);
  assert.match(app,/liveGiftRecipientsTimer=setInterval/);assert.match(app,/recipientUserId/);
  assert.match(server,/notify\(recipientId,user\.id,'gift'/);
});
test("Main Coin LIVE gifts credit the selected participant with source-backed creator earnings",()=>{
  assert.match(edge,/p_recipient_id:recipientUserId/);assert.match(mainGift,/p_recipient_id uuid DEFAULT NULL/);
  assert.match(mainGift,/lp\.role IN\('guest','cohost'\)/);assert.match(mainGift,/creator_amount:=eligible_gross::numeric\/2/);
});
test("Admin Promotional LIVE gifts credit the selected connected participant",()=>{
  assert.match(edge,/p_recipient_id:recipientUserId/);assert.match(promo,/p_recipient_id uuid DEFAULT NULL::uuid/);
  assert.match(promo,/lp\.role IN \('guest','cohost'\)/);assert.match(promo,/lp\.status IN \('connected','accepted'\)/);
});
