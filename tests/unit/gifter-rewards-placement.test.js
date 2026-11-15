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

test('Gift entry retains the original Gifters Rewards artwork and mounts the full level journey inline', () => {
  assert.match(giftEntry, /<section class='gift-level-up-banner'[^>]*>[\s\S]*?<img src='\/assets\/gifters-rewards\.png' alt='Gifters Rewards'/);
  assert.match(giftEntry, /<h2 id='minglora-gifter-rewards-title'>Gifters Rewards<\/h2>/);
  assert.match(giftEntry, /id='minglora-gifter-level-up-open'>View all 50 levels/);
  assert.doesNotMatch(giftEntry, /gifters-level-up\.svg/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'Gifters Badge Levels', 'Gifters Rewards.png')), 'the original artwork remains in assets');
  assert.match(giftEntry, /id='minglora-gifter-rewards-content' class='gift-gifter-rewards-content'/);
  assert.match(giftEntry, /MingloraGifterProgression\?\.renderInto\?\.\(/);
});

test('Gifters Rewards embeds the same complete server-backed 50-level badge renderer', () => {
  assert.match(progression, /async function renderInto\(container\)/);
  assert.match(progression, /renderMarkup\(overview, \{ embedded: true \}\)/);
  assert.match(progression, /window\.MingloraGifterProgression = \{ render, renderInto, onNavigateAway \}/);
  assert.match(progression, /BADGE_LEVEL_PANELS = Object\.freeze\(\[/);
  assert.match(progression, /function renderBadgePanels\(\)/);
  assert.match(progression, /function renderLevelDirectory\(items\)/);
  assert.match(progression, /levels\.length !== 50/);
  assert.match(progression, /\/api\/gifter-progression\/overview/);
  assert.match(progression, /gp-page--embedded/);
  assert.match(giftEntry, /scrollIntoView\(\{behavior:"smooth",block:"start"\}\)/);
});

test('Gifters Level Up remains inside the separate Gifter Progression page', () => {
  assert.ok(progression.includes("src='/assets/gifters-level-up.png' alt='Original Minglora 50-level Gifters badge progression chart'"));
  assert.ok(progression.includes("href='/assets/gifters-level-up.png' target='_blank' rel='noopener noreferrer'"));
  assert.ok(progression.includes("<h1>Gifter Level &amp; Badges</h1>"));
  assert.ok(progression.includes("const badgePanels = renderBadgePanels();"));
  assert.ok(!progression.includes("Gifters Rewards"));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'Gifters Badge Levels', 'Gifters Level Up.png')), 'the original Level-Up artwork remains in its canonical folder');
  assert.ok(server.includes("if(p==='/assets/gifters-level-up.png')"));
  assert.ok(server.includes("path.join(__dirname,'..','assets','Gifters Badge Levels','Gifters Level Up.png')"));
});


test('Gifters Badge Progression chart sits in its own responsive reference card above personal status', () => {
  const chart = progression.indexOf("<section class='gp-chart-reference card'");
  const personalStatus = progression.indexOf("<section class='gp-hero card'");
  assert.ok(chart >= 0 && personalStatus > chart, 'the chart appears directly before the member status card');
  assert.ok(progression.includes("<h2 id='gp-chart-reference-title'>Gifters Badge Progression</h2>"));
  assert.ok(progression.includes("class='gp-chart-reference-frame'"));
  assert.ok(progression.includes("class='gp-chart-image' src='/assets/gifters-level-up.png'"));
  assert.ok(progression.includes("class='gp-chart-open' href='/assets/gifters-level-up.png'"));
  assert.ok(progression.includes("id='gp-level-up-reference-note'"));
  assert.ok(styles.includes('.gp-chart-reference{'));
  assert.ok(styles.includes('background:linear-gradient(128deg,#19163f 0%,#242255 56%,#4b2b70 100%)'));
  assert.ok(styles.includes('.gp-chart-image{'));
  assert.ok(styles.includes('object-fit:contain;'));
  assert.match(styles, /\.gp-chart-reference-heading/);
  assert.ok(styles.includes('.gp-chart-reference-heading{flex-direction:column;gap:9px}'));
  assert.ok(serviceWorker.includes("'/assets/gifters-level-up.png'"), 'the exact working chart route remains precached');
});

test('Gifters Rewards image route serves the exact repository artwork', () => {
  assert.match(server, /if\(p==='\/assets\/gifters-rewards\.png'\)[\s\S]*?path\.join\(__dirname,'\.\.','assets','Gifters Badge Levels','Gifters Rewards\.png'\)/);
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
  const script = html.match(/\/gifts\.js\?v=[^"']+/)?.[0] || '';
  assert.ok(script, 'HTML shell references the Gift entry script version');
  assert.ok(serviceWorker.includes(script), 'service worker precaches the exact Gift entry script version');
  assert.ok(serviceWorker.includes("'/assets/gifters-rewards.png'"), 'service worker precaches the Rewards artwork');
  assert.match(serviceWorker, /const CACHE_NAME='minglora-shell-v\d+-self-updating-1';/);
});
