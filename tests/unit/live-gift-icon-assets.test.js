import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const gifts = read("public/gifts.js");
const app = read("public/app.js");
const styles = read("public/styles.css");
const shell = read("public/sw.js");
const html = read("public/index.html");

test("Gift Studio renders generated category and per-gift SVG icons rather than emoji category chips", () => {
  assert.ok(gifts.includes('const categoryIconUrl=k=>"/assets/gifts/categories/"+encodeURIComponent(k)+".svg"'));
  assert.ok(gifts.includes('const giftIconUrl=g=>g?.code?"/assets/gifts/catalog/"+encodeURIComponent(g.code)+"-icon.svg":""'));
  assert.ok(gifts.includes("gift-category-icon"));
  assert.ok(gifts.includes("data-category-icon"));
  assert.ok(gifts.includes("data-gift-icon"));
  assert.ok(!gifts.includes("const emojis="));
  assert.ok(gifts.includes("Artwork unavailable"));
});

test("LIVE gift cards use dedicated transparent SVG icons and accessible asset fallbacks", () => {
  assert.ok(app.includes("function liveGiftIconUrl(gift)"));
  assert.ok(app.includes('"-icon.svg"'));
  assert.ok(app.includes("data-live-gift-icon"));
  assert.ok(app.includes("Gift artwork unavailable"));
  assert.ok(!app.includes("live-gift-card-emoji"));
  assert.ok(!app.includes("live-gift-preview-emoji"));
  assert.ok(!app.includes('toast(sender+\' sent \'+gift.name+(recipient?\' to \'+recipient:\'\')+\' 🎁\')'));
  assert.ok(!app.includes('toast(sender+\' sent \'+gift.name+(recipient?\' to \'+recipient:\'\')+\' 🎁\');'));
});

test("transparent gift icon sizing and error text remain readable inside the existing layout", () => {
  assert.ok(styles.includes(".gift-category-icon{"));
  assert.ok(styles.includes(".gift-card-image{"));
  assert.ok(styles.includes("object-fit:contain"));
  assert.ok(styles.includes(".live-gift-image{"));
  assert.ok(styles.includes(".gift-art-unavailable"));
  assert.ok(styles.includes(".live-gift-card-unavailable"));
});

test("service worker caches the 18 category SVGs and the current UI versions", () => {
  const categories = ["all","flowers","hearts","animals","vehicles","music","sports","food_drink","fashion_beauty","luxury","celebrations","fantasy","nature","travel","games","community","symbols","other"];
  for (const category of categories) {
    assert.ok(shell.includes("/assets/gifts/categories/" + category + ".svg?v=20261114-live-transparent-gift-icons-1"));
  }
  assert.ok(shell.includes("minglora-shell-v305-live-transparent-gift-icons-2"));
  assert.ok(shell.includes("/styles.css?v=20261114-live-transparent-gift-icons-1"));
  assert.ok(shell.includes("/gifts.js?v=20261114-live-transparent-gift-icons-1"));
  assert.ok(shell.includes("/app.js?v=20261114-live-transparent-gift-icons-1"));
  assert.ok(html.includes("/styles.css?v=20261114-live-transparent-gift-icons-1"));
  assert.ok(html.includes("/gifts.js?v=20261114-live-transparent-gift-icons-1"));
  assert.ok(html.includes("/app.js?v=20261114-live-transparent-gift-icons-1"));
});
