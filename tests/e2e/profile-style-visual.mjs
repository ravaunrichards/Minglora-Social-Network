import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'public');
const artifactsDir = path.join(root, 'artifacts', 'profile-style-visual');
const appHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

const styles = [
  'facebook', 'tiktok', 'instagram', 'youtube', 'x',
  'linkedin', 'pinterest', 'twitch', 'snapchat', 'custom-minglora'
];
const layouts = [
  'full-screen', 'fluid-panel', 'fluid-grid', 'fixed-grid', 'fixed-panel',
  'side-by-side', 'spotlight', 'roundtable-1', 'roundtable-2'
];
const viewports = [
  { name: 'compact-phone', width: 320, height: 640 },
  { name: 'standard-phone', width: 360, height: 800 },
  { name: 'large-phone', width: 390, height: 844 },
  { name: 'wide-phone', width: 430, height: 932 },
  { name: 'phone-landscape', width: 740, height: 360 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'wide-desktop', width: 2560, height: 1440 }
];

const tabsByStyle = {
  facebook: [['posts', 'All'], ['about', 'About'], ['friends', 'Friends'], ['photos', 'Photos'], ['reels', 'Reels'], ['more', 'More']],
  tiktok: [['videos', 'Videos'], ['posts', 'Posts'], ['friends', 'Friends'], ['photos', 'Photos'], ['about', 'About'], ['more', 'More']],
  instagram: [['posts', 'Posts'], ['reels', 'Reels'], ['photos', 'Photos'], ['friends', 'Friends'], ['about', 'About'], ['more', 'More']],
  youtube: [['posts', 'Home'], ['videos', 'Videos'], ['reels', 'Shorts'], ['friends', 'Community'], ['about', 'About'], ['more', 'More']],
  x: [['posts', 'Posts'], ['about', 'About'], ['friends', 'Friends'], ['photos', 'Media'], ['reels', 'Videos'], ['more', 'More']],
  linkedin: [['posts', 'Activity'], ['about', 'About'], ['friends', 'Connections'], ['photos', 'Media'], ['reels', 'Videos'], ['more', 'More']],
  pinterest: [['photos', 'Pins'], ['posts', 'Created'], ['friends', 'Friends'], ['about', 'About'], ['reels', 'Videos'], ['more', 'More']],
  twitch: [['posts', 'Home'], ['videos', 'Videos'], ['reels', 'Clips'], ['about', 'About'], ['friends', 'Community'], ['more', 'More']],
  snapchat: [['highlights', 'Stories'], ['reels', 'Spotlight'], ['posts', 'Posts'], ['friends', 'Friends'], ['photos', 'Photos'], ['more', 'More']],
  'custom-minglora': [['posts', 'All'], ['about', 'About'], ['friends', 'Friends'], ['photos', 'Photos'], ['reels', 'Reels'], ['more', 'More']]
};
const metricsByStyle = {
  facebook: ['followers', 'following', 'friends', 'subscribers', 'posts', 'likes'],
  tiktok: ['following', 'followers', 'likes'],
  instagram: ['posts', 'followers', 'following', 'likes', 'friends', 'subscribers'],
  youtube: ['subscribers', 'posts', 'followers', 'likes', 'following', 'friends'],
  x: ['posts', 'followers', 'following', 'likes', 'friends', 'subscribers'],
  linkedin: ['followers', 'friends', 'posts', 'following', 'subscribers', 'likes'],
  pinterest: ['followers', 'following', 'posts', 'likes', 'friends', 'subscribers'],
  twitch: ['followers', 'subscribers', 'posts', 'likes', 'following', 'friends'],
  snapchat: ['friends', 'followers', 'following', 'posts', 'likes', 'subscribers'],
  'custom-minglora': ['followers', 'following', 'friends', 'subscribers', 'posts', 'likes']
};
const metricLabels = {
  followers: 'Followers', following: 'Following', friends: 'Friends',
  subscribers: 'Subscribers', posts: 'Posts', likes: 'Likes'
};
const stylesheetLinks = [...appHtml.matchAll(/<link\b[^>]*>/gi)]
  .map(match => match[0])
  .filter(tag => /\brel=["']stylesheet["']/i.test(tag))
  .map(tag => tag.match(/\bhref=["']([^"']+)["']/i)?.[1])
  .filter(href => href && href.startsWith('/') && !href.startsWith('//'));

function metricMarkup(style) {
  return metricsByStyle[style].map(id => {
    const value = ({ followers: 1284, following: 316, friends: 87, subscribers: 42, posts: 126, likes: 975 })[id];
    const control = ['followers', 'following', 'friends', 'subscribers'].includes(id);
    return control
      ? '<button type="button" class="connection-count" data-profile-metric="' + id + '" data-open-connections="' + id + '"><strong>' + value.toLocaleString() + '</strong><span>' + metricLabels[id] + '</span></button>'
      : '<div class="profile-count-item" data-profile-metric="' + id + '"><strong>' + value.toLocaleString() + '</strong><span>' + metricLabels[id] + '</span></div>';
  }).join('');
}

function profileMarkup(style, layout) {
  const tabs = tabsByStyle[style].map(([key, label], index) =>
    '<button type="button" data-profile-tab="' + key + '"' + (index === 0 ? ' class="active" aria-current="page"' : '') + '>' + label + '</button>'
  ).join('');
  const cover = '<div class="profile-cover"><img class="profile-cover-image" src="/assets/default-profile-cover.svg?v=20261106-profile-defaults-1" alt=""></div>';
  const actions = '<div class="profile-actions profile-owner-actions">' +
    '<button type="button" class="primary profile-edit" id="profile-add-story">Add to story</button>' +
    '<button type="button" class="secondary profile-edit" id="edit-profile">Edit Profile</button>' +
    '<button type="button" class="secondary profile-people-toggle" id="profile-people-toggle" aria-label="People you may know">⌄</button>' +
    '</div>';
  const highlights = style === 'tiktok'
    ? '<section class="profile-tiktok-highlights"><div class="profile-tiktok-highlights-list">' +
      ['Travel', 'Events', 'Creator'].map(label => '<button type="button" class="profile-tiktok-highlight"><span class="profile-tiktok-highlight-art">✧</span><small>' + label + '</small></button>').join('') +
      '</div></section>'
    : '';
  const imageTiles = Array.from({ length: 6 }, (_, index) =>
    '<article class="profile-media-tile"><img src="/assets/default-profile-cover.svg?v=20261106-profile-defaults-1" alt=""><span>Photo ' + (index + 1) + '</span></article>'
  ).join('');
  const reelTiles = Array.from({ length: 6 }, (_, index) =>
    '<article class="profile-reel-tile"><img src="/assets/default-profile-cover.svg?v=20261106-profile-defaults-1" alt=""><span>Video ' + (index + 1) + '</span></article>'
  ).join('');
  const friendNames = ['Ari', 'Mia', 'Noah', 'Zoe', 'Jay', 'Kai'];
  const friends = friendNames.map(name =>
    '<article class="profile-friend-card"><img src="/assets/default-profile-avatar-3d.svg?v=20261106-profile-defaults-2" alt=""><strong>' + name + '</strong></article>'
  ).join('');
  const about = [
    ['Intro', 'A short introduction visible on the profile.'],
    ['Work', 'Work and professional experience.'],
    ['Education', 'Education and qualifications.'],
    ['Interests', 'Interests and activities.']
  ].map(([title, body]) =>
    '<section class="card about-section-card"><h3>' + title + '</h3><p>' + body + '</p></section>'
  ).join('');
  const post = '<article class="card post-card"><div class="post-header"><strong>Minglora member</strong><small>Shared recently</small></div><p>A profile post used only to check layout, wrapping and readable content.</p><div class="post-actions"><button type="button">Like</button><button type="button">Comment</button><button type="button">Share</button></div></article>';
  return '<div class="minglora-profile-page" data-profile-style="' + style + '" data-profile-screen-layout="' + layout + '">' +
    '<section class="card profile-header-card profile-layout-advanced profile-header-card--owner" style="padding:0">' +
      cover +
      '<div class="profile-info">' +
        '<div class="profile-avatar-edit-wrap"><img class="avatar" src="/assets/default-profile-avatar-3d.svg?v=20261106-profile-defaults-2" alt="Profile picture"></div>' +
        '<div class="profile-info-main"><h1 class="profile-name-with-badges"><span>Minglora Creator</span></h1><p class="profile-username-line">@minglora_creator</p></div>' +
        actions +
        '<div class="profile-counts" aria-label="Profile counts">' + metricMarkup(style) + '</div>' +
      '</div>' +
      '<section class="profile-people-panel" hidden aria-label="People you may know"></section>' +
      highlights +
      '<nav class="profile-tabs" aria-label="Profile sections"><div class="profile-tabs-list">' + tabs + '</div></nav>' +
    '</section>' +
    '<div id="profile-tab-panel">' +
      '<div class="profile-body profile-body--established">' +
        '<aside class="profile-side-column"><section class="card profile-intro-card"><h2>Intro</h2><p>Creator and community member.</p></section><section class="card"><h2>About</h2>' + about + '</section></aside>' +
        '<div class="profile-post-column">' +
          '<section class="card profile-status-composer"><p>Share a thought…</p><button type="button">Create post</button></section>' +
          post +
          '<section class="card"><h2>Photos</h2><div class="profile-media-grid">' + imageTiles + '</div></section>' +
          '<section class="card"><h2>Videos</h2><div class="profile-reels-grid">' + reelTiles + '</div></section>' +
          '<section class="card"><h2>Friends</h2><div class="profile-friends-grid">' + friends + '</div></section>' +
          '<section class="card"><h2>Albums</h2><div class="profile-albums-grid">' + imageTiles + '</div></section>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function htmlFixture(style, layout) {
  const links = stylesheetLinks.map(href => '<link rel="stylesheet" href="' + href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">').join('\n');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Minglora profile visual QA</title>' + links + '</head>' +
    '<body><div id="app"><header class="topbar"><div class="top-left"><span class="brand">Minglora</span></div></header>' +
    '<main class="layout"><aside class="left-rail" aria-hidden="true"></aside><section id="main-content" class="main-content">' + profileMarkup(style, layout) + '</section><aside class="right-rail" aria-hidden="true"></aside></main></div></body></html>';
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.json': 'application/json; charset=utf-8'
  })[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
  if (requestUrl.pathname === '/__profile-style-visual') {
    const style = requestUrl.searchParams.get('style') || 'facebook';
    const layout = requestUrl.searchParams.get('layout') || 'fluid-panel';
    if (!styles.includes(style) || !layouts.includes(layout)) {
      res.writeHead(400); res.end('Invalid QA scenario'); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(htmlFixture(style, layout));
    return;
  }
  const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});

await fs.promises.rm(artifactsDir, { recursive: true, force: true });
await fs.promises.mkdir(artifactsDir, { recursive: true });

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
const baseUrl = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({ headless: true });
let browserChecks = 0;
let screenshots = 0;
const failures = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const style of styles) {
      const fixtureUrl = baseUrl + '/__profile-style-visual?style=' + encodeURIComponent(style) + '&layout=fluid-panel';
      await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('.minglora-profile-page').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts?.ready);
      const results = await page.evaluate(({ layouts, viewportName, style }) => {
        const root = document.querySelector('.minglora-profile-page');
        const main = document.querySelector('#main-content');
        const allFailures = [];
        const intersects = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        for (const layout of layouts) {
          root.dataset.profileScreenLayout = layout;
          const rootRect = root.getBoundingClientRect();
          const mainRect = main.getBoundingClientRect();
          const avatar = root.querySelector('.profile-avatar-edit-wrap .avatar');
          const identity = root.querySelector('.profile-name-with-badges');
          const actions = [...root.querySelectorAll('.profile-owner-actions button')];
          const counts = [...root.querySelectorAll('.profile-counts [data-profile-metric]')];
          const tabs = root.querySelector('.profile-tabs');
          const panel = root.querySelector('#profile-tab-panel');
          const cover = root.querySelector('.profile-cover');
          const avatarRect = avatar.getBoundingClientRect();
          const identityRect = identity.getBoundingClientRect();
          const tabsRect = tabs.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const hiddenCover = getComputedStyle(cover).display === 'none';
          const expectedHiddenCover = ['tiktok', 'instagram', 'pinterest', 'snapchat'].includes(style);
          const visibleActions = actions.filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(node).display !== 'none';
          });
          const visibleMetrics = counts.filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(node).display !== 'none';
          });
          const actualActionMetricOverlap = visibleActions.some(action =>
            visibleMetrics.some(metric => intersects(action.getBoundingClientRect(), metric.getBoundingClientRect()))
          );
          const checks = [];
          const add = (ok, name, detail = '') => { if (!ok) checks.push({ name, detail }); };
          add(rootRect.width > 0 && rootRect.height > 0, 'profile-root-rendered');
          add(root.scrollWidth <= root.clientWidth + 2, 'profile-no-inner-horizontal-overflow', root.scrollWidth + '/' + root.clientWidth);
          add(main.scrollWidth <= main.clientWidth + 2, 'main-no-horizontal-overflow', main.scrollWidth + '/' + main.clientWidth);
          add(document.documentElement.scrollWidth <= window.innerWidth + 2, 'viewport-no-horizontal-overflow', document.documentElement.scrollWidth + '/' + window.innerWidth);
          add(avatarRect.width >= 48 && avatarRect.height >= 48, 'avatar-visible');
          add(identityRect.width > 0 && identityRect.height > 0, 'identity-visible');
          add(visibleActions.length === 3, 'owner-actions-visible', visibleActions.length + '/3');
          add(visibleMetrics.length === (style === 'tiktok' ? 3 : 6), 'profile-metrics-visible', visibleMetrics.length);
          add(tabsRect.width > 0 && tabsRect.height > 0, 'profile-navigation-visible');
          add(panelRect.width > 0 && panelRect.height > 0, 'profile-content-visible');
          add(rootRect.left >= mainRect.left - 2 && rootRect.right <= mainRect.right + 2, 'profile-inside-main-column');
          add(hiddenCover === expectedHiddenCover, 'style-cover-treatment', style + ':' + hiddenCover);
          add(!intersects(avatarRect, identityRect), 'avatar-identity-no-overlap');
          add(!actualActionMetricOverlap, 'action-controls-metrics-no-overlap');
          add([...root.querySelectorAll('.profile-tabs-list button')].length === 6, 'six-profile-navigation-actions');
          add(visibleMetrics.length === (style === 'tiktok' ? 3 : 6), 'real-style-metric-count', visibleMetrics.length);
          add(root.querySelectorAll('.profile-media-grid .profile-media-tile').length === 6, 'media-grid-content-present');
          add(root.querySelectorAll('.profile-friends-grid .profile-friend-card').length === 6, 'friends-grid-content-present');
          allFailures.push(...checks.map(item => ({ ...item, style, layout, viewport: viewportName })));
        }
        return allFailures;
      }, { layouts, viewportName: viewport.name, style });

      browserChecks += layouts.length;
      failures.push(...results);

      if (viewport.width === 1280) {
        for (const layout of layouts) {
          await page.locator('.minglora-profile-page').evaluate((node, selectedLayout) => {
            node.dataset.profileScreenLayout = selectedLayout;
          }, layout);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const file = path.join(artifactsDir, style + '__' + layout + '__desktop.jpg');
          await page.screenshot({ path: file, type: 'jpeg', quality: 76, fullPage: true });
          screenshots += 1;
        }
      }
      if (viewport.width === 360) {
        await page.locator('.minglora-profile-page').evaluate(node => {
          node.dataset.profileScreenLayout = 'fluid-panel';
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file = path.join(artifactsDir, style + '__fluid-panel__phone.jpg');
        await page.screenshot({ path: file, type: 'jpeg', quality: 76, fullPage: true });
        screenshots += 1;
      }
    }
  }

  const report = {
    styles: styles.length,
    screenLayouts: layouts.length,
    viewports: viewports.length,
    browserCombinationsChecked: browserChecks,
    screenshotsCaptured: screenshots,
    failures
  };
  fs.writeFileSync(path.join(artifactsDir, 'profile-style-visual-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, failures: failures.slice(0, 40) }, null, 2));
  assert.equal(failures.length, 0, failures.slice(0, 25).map(item =>
    item.style + '/' + item.layout + '/' + item.viewport + ': ' + item.name + ' ' + item.detail
  ).join('\n') || 'Visual profile QA failed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
