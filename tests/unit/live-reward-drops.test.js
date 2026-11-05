import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("database/migrations/078_minglora_live_goody_bags_and_treasure_boxes.sql");
const runtime = read("supabase/functions/minglora-runtime-state/index.ts");
const server = read("src/server.js");
const app = read("public/app.js");
const styles = read("public/styles.css");

test("Goody Bags and Treasure Boxes use separate durable reward-drop records", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.live_reward_drops/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.live_reward_participants/);
  assert.match(migration, /kind IN \('goody_bag','treasure_box'\)/);
  assert.match(migration, /UNIQUE \(drop_id, user_id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /TO service_role/);
});

test("reward pools are funded from the existing Minglora coin wallet and audited ledger", () => {
  assert.match(migration, /UPDATE public\.coin_wallets SET balance_coins=new_balance/);
  assert.match(migration, /'live_reward_escrow'/);
  assert.match(migration, /'live_reward_award'/);
  assert.match(migration, /'live_reward_refund'/);
  assert.doesNotMatch(migration, /creator_earnings_ledger/);
  assert.match(migration, /greatest\(0,reward_drop\.total_coins-awarded_coins\)/);
});

test("Goody Bag draw is randomized and Treasure Box claims are serialized and limited", () => {
  assert.match(migration, /ORDER BY gen_random_uuid\(\)/);
  assert.match(migration, /FROM public\.live_reward_drops WHERE id=p_drop_id FOR UPDATE/);
  assert.match(migration, /claimant_count>=reward_drop\.winner_count/);
  assert.match(migration, /reward_drop\.opens_at>now\(\)/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test("reward RPC functions are service-role only", () => {
  for (const name of [
    "minglora_create_live_reward_drop",
    "minglora_join_live_goody_bag",
    "minglora_claim_live_treasure_box",
    "minglora_settle_live_reward_drops"
  ]) {
    assert.match(migration, new RegExp("CREATE OR REPLACE FUNCTION public\\." + name));
    assert.match(migration, new RegExp("REVOKE ALL ON FUNCTION public\\." + name));
  }
  assert.match(runtime, /"economy_live_reward_create"/);
  assert.match(runtime, /"economy_live_reward_list"/);
  assert.match(runtime, /"economy_live_reward_join"/);
  assert.match(runtime, /"economy_live_reward_claim"/);
  assert.match(runtime, /"economy_live_reward_settle"/);
});

test("LIVE API requires the host to own the room and viewers to be connected participants", () => {
  assert.match(server, /reward-drops/);
  assert.match(server, /Only the LIVE host can launch a Goody Bag or Treasure Box/);
  assert.match(server, /listLiveKitParticipants\(session\.roomName\)/);
  assert.match(server, /Join this LIVE room before entering or claiming its rewards/);
  assert.match(server, /setInterval\(async\(\)=>[\s\S]{0,300}economy_live_reward_settle/);
});

test("LIVE room exposes reward setup, viewer entry and claim controls on the same room", () => {
  assert.match(app, /Goody Bags & Treasure Boxes/);
  assert.match(app, /Launch Goody Bag/);
  assert.match(app, /Join Goody Bag/);
  assert.match(app, /Open & claim/);
  assert.match(app, /setupLiveRewardPanel\(session,role\)/);
  assert.match(app, /live-rewards-toggle/);
  assert.match(app, /liveRewardWalletFetchedAt/);
  assert.match(styles, /\.live-reward-panel/);
  assert.match(styles, /@media\(max-width:760px\)/);
});
