import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const giftUi = readFileSync(path.join(root, "public/gifts.js"), "utf8");
const server = readFileSync(path.join(root, "src/server.js"), "utf8");

test("the Gifts screen offers direct-to-member recipient selection only", () => {
  assert.match(giftUi, /Choose who receives it/);
  assert.match(giftUi, /Recipient username/);
  assert.doesNotMatch(giftUi, /Gift destination|Post \/ photo \/ attached video|Short video|Photo album|Content ID/);
  assert.doesNotMatch(giftUi, /minglora-gift-context|state\.contextType|state\.contextId/);
  assert.match(giftUi, /JSON\.stringify\(\{username,giftCode:gift\.code\}\)/);
});

test("the social gift API always records a direct member gift", () => {
  const start = server.indexOf("if(method==='POST'&&p==='/api/gifts/send')");
  assert.notEqual(start, -1, "social gift API route must exist");
  const end = server.indexOf("let liveAction=p.match", start);
  assert.notEqual(end, -1, "social gift route must end before live gift routes");
  const handler = server.slice(start, end);
  assert.match(handler, /const contextType='user'/);
  assert.match(handler, /const contextId=null/);
  assert.doesNotMatch(handler, /input\.contextType|input\.contextId/);
  assert.match(handler, /economy_send_social_gift/);
});
