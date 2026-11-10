import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const giftEntry = read('public/gifts.js');
const progression = read('public/gifter-progression.js');
const server = read('src/server.js');
const styles = read('public/gifter-progression.css');
const html = read('public/index.html');
const serviceWorker = read('public/sw.js');

test('Gift entry shows the repository Gifters Rewards artwork outside the level journey', () => {
  assert.match(giftEntry, /<section class='gift-level-up-banner'[^>]*>[\s\S]*?<img src='\/assets\/gifters-rewards\.png' alt='Gifters Rewards'/);
  assert.match(giftEntry, /<h2 id='minglora-gifter-rewards-title'>Gifters Rewards<\/h2>/);
  assert.match(giftEntry, /id='minglora-gifter-level-up-open'>View all 50 levels/);
  assert.doesNotMatch(giftEntry, /gifters-level-up\.svg/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'Gifters Rewards.png')), 'the original artwork remains in assets');
});

test('Gifters Level Up remains inside the separate Gifter Progression page', () => {
  assert.match(progression, /src='\/assets\/Gifters%20Level%20Up\.png' alt='Gifters Level Up'/);
  assert.match(progression, /<h1>Gifter Level &amp; Badges<\/h1>/);
  assert.doesNotMatch(progression, /Gifters Rewards/);
  assert.match(server, /if\(p==='\/assets\/gifters-level-up\.png'\)/, 'existing Level Up asset route is retained');
});

test('Gifters Rewards image route serves the exact repository artwork', () => {
  assert.match(server, /if\(p==='\/assets\/gifters-rewards\.png'\)[\s\S]*?path\.join\(__dirname,'\.\.','assets','Gifters Rewards\.png'\)/);
  assert.match(server, /Content-Type':'image\/png'/);
  assert.match(server, /Gifters rewards artwork not found/);
});

test('Rewards banner remains contained, responsive and does not clip its own content', () => {
  assert.match(styles, /\.gift-level-up-banner\{[\s\S]*?min-width:0;max-width:100%;box-sizing:border-box[\s\S]*?overflow:visible/);
  assert.match(styles, /\.gift-level-up-banner>img\{[\s\S]*?max-width:100%[\s\S]*?object-fit:contain/);
  assert.match(styles, /\.gift-level-up-copy\{[\s\S]*?overflow-wrap:anywhere/);
  assert.match(styles, /\.gift-level-up-copy button\{[\s\S]*?max-width:100%;flex-wrap:wrap;white-space:normal/);
  assert.match(styles, /@media\(max-width:650px\)[\s\S]*?\.gift-level-up-banner>img\{max-height:220px\}/);
});

test('updated Gift entry script and Rewards image are refreshed through the service worker', () => {
  const script = '/gifts.js?v=20261110-gifters-rewards-outside-1';
  assert.ok(html.includes(script), 'HTML shell references the new Gift entry script version');
  assert.ok(serviceWorker.includes(script), 'service worker precaches the new Gift entry script version');
  assert.ok(serviceWorker.includes("'/assets/gifters-rewards.png'"), 'service worker precaches the Rewards artwork');
  assert.match(serviceWorker, /minglora-shell-v272-gifters-rewards-1/);
});
