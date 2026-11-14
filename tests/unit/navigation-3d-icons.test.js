import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [html, css, sprite, serviceWorker, menuScript, appScript] = await Promise.all([
  read('public/index.html'),
  read('public/styles.css'),
  read('public/assets/icons/navigation-3d.svg'),
  read('public/sw.js'),
  read('public/minglora-menu.js'),
  read('public/app.js')
]);

const useIcon = id => `<use href="/assets/icons/navigation-3d.svg?v=${["clock","gift","trophy","gamepad","game-video","reels","megaphone","ai","admin","logout"].includes(id)?'20261110-semantic-icons-3d-1':id==='recharge'?'20261104-recharge-wallet-3d-3':id==='video'?'20261108-mobile-navigation-icons-1':'20261102-navigation-3d-2'}#${id}"></use>`;

test('desktop navigation keeps its existing destinations and uses 3D icons', () => {
  const nav = html.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.ok(nav, 'desktop navigation exists');

  for (const [view, icon, label] of [
    ['feed', 'home', 'Home'],
    ['for-you', 'explore', 'For You'],
    ['live', 'live', 'LIVE'],
    ['meetwave', 'meetwave', 'MeetWave'],
  ]) {
    assert.match(nav, new RegExp(`data-view="${view}"`));
    assert.ok(nav.includes(useIcon(icon)), `${label} has its matching dimensional icon`);
    assert.ok(nav.includes(`<small>${label}</small>`), `${label} label remains visible`);
  }
  assert.match(nav,/data-view="leagues"/);
  assert.ok(nav.includes(useIcon('trophy')), 'Leagues uses a matching 3D trophy');
});

test('mobile header keeps the requested five primary tabs visible below logo and Search', () => {
  const navStart = html.indexOf('<nav class="top-nav"');
  const navEnd = html.indexOf('</nav>', navStart);
  const nav = navStart >= 0 && navEnd > navStart ? html.slice(navStart, navEnd) : '';
  assert.ok(nav, 'shared navigation is present in the header');
  for (const [view, icon, label] of [
    ['feed', 'home', 'Home'],
    ['for-you', 'explore', 'For You'],
    ['live', 'live', 'LIVE'],
    ['meetwave', 'meetwave', 'MeetWave'],
  ]) {
    assert.ok(nav.includes('data-view="' + view + '"'), view + ' remains a primary destination');
    assert.ok(nav.includes(useIcon(icon)), view + ' uses the shared 3D artwork');
    assert.ok(nav.includes('<small>' + label + '</small>'), label + ' label is visible');
  }
  assert.ok(nav.includes('data-view="leagues"') && nav.includes('Leagues'), 'Leagues remains the fifth primary tab');
  assert.ok(css.includes('.top-nav{') && css.includes('display:flex!important'), 'mobile breakpoint explicitly displays the same top navigation');
  assert.ok(css.includes('.mobile-nav{display:none!important}'), 'duplicate bottom navigation is hidden on mobile');
  assert.ok(html.includes('id="top-search-form"') && html.includes('id="top-search-input"'), 'Search remains beside the Minglora logo');
  assert.ok(html.includes('id="messenger-btn"') && html.includes(useIcon('messages')), 'Messenger remains in the account action row');
  assert.ok(html.includes('id="notifications-btn"') && html.includes(useIcon('activity')), 'Notifications remains in the account action row');
  assert.ok(!html.includes('id="mobile-more-menu"'), 'the cramped floating More menu is removed');
});
test('utility rail and header actions use the matching rendered icon assets', () => {
  assert.ok(html.includes('data-view="ai-network"') && html.includes(useIcon('ai')), 'Minglora AI Network uses the shared dimensional AI icon');
  for (const icon of ['live', 'recharge', 'creator', 'friends', 'groups', 'pages', 'messages', 'saved', 'activity']) {
    assert.ok(html.includes(useIcon(icon)), `utility icon ${icon} is wired into the interface`);
  }
  assert.ok(html.includes('id="notifications-btn"') && html.includes(useIcon('activity')));
  assert.doesNotMatch(html, /id="settings-btn"/, 'Settings is not a separate header control beside Personalise Minglora');
  assert.match(menuScript, /settings:\s*\{\s*label: 'Settings & privacy',\s*icon: 'settings'/, 'the profile dropdown reuses the existing 3D Settings icon');
  assert.match(menuScript, /sprite\(item\.icon, 'nav-3d-icon'\)/, 'account menu rows use the existing 3D icon treatment');
  assert.ok(html.includes('id="top-search-form"') && html.includes('id="top-search-input"'), 'the top bar has a real Search Minglora field');
  assert.ok(html.includes('class="top-search-submit"') && html.includes('class="nav-search-icon"'), 'the top bar search action has a visible icon');
  assert.ok(appScript.includes("$('#top-search-form')?.addEventListener('submit'"), 'global search submits through the app search handler');
  assert.ok(appScript.includes("await renderSearch(q)"), 'global search loads actual Minglora search results');
  assert.ok(menuScript.includes("sprite('search')") && menuScript.includes('minglora-menu-search'), 'the nine-dot Menu has its own Search Menu field');
  assert.ok(menuScript.includes('placeholder="Search menu"'), 'the Menu search is distinct from global Search Minglora');
});

test('the SVG sprite contains finished dimensional artwork for primary and supporting actions', () => {
  for (const id of ['home', 'explore', 'create', 'video', 'live', 'friends', 'messages', 'coins', 'creator', 'groups', 'pages', 'saved', 'activity', 'settings', 'search', 'profile', 'microphone', 'palette', 'share', 'photo', 'feeling', 'call', 'sound', 'privacy', 'request', 'archive', 'delivery', 'lock', 'block', 'external-link', 'more', 'close', 'restore', 'unlock', 'arrow-left', 'arrow-right', 'menstrual-health', 'clock', 'gift', 'trophy', 'gamepad', 'game-video', 'reels', 'megaphone', 'ai', 'admin', 'logout']) {
    assert.match(sprite, new RegExp(`<symbol id="${id}" viewBox="0 0 64 64">`), `sprite contains ${id}`);
  }
  assert.match(sprite, /<linearGradient id="blue-front"/);
  assert.match(sprite, /<linearGradient id="silver-front"/);
  assert.match(sprite, /<linearGradient id="gold-front"/);
  assert.match(sprite, /<radialGradient id="lens"/);
  assert.ok(html.includes('/assets/icons/navigation-3d.svg?v=20261110-menstrual-health-3d-1#menstrual-health'));
  assert.ok(serviceWorker.includes("/assets/icons/navigation-3d.svg?v=20261110-menstrual-health-3d-1#menstrual-health"));
  assert.doesNotMatch(sprite, /<text\b|<image\b/i, 'icon artwork is vector-rendered, not text glyphs or bitmap placeholders');
});


test('feature navigation uses distinct, semantically correct 3D icons', () => {
  assert.match(html, /data-view="calendar" aria-label="Events"[^\n]+#calendar/);
  assert.match(html, /data-view="clock-centre" aria-label="Clock Centre"[^\n]+#clock/);
  assert.match(html, /data-view="gifts" aria-label="Gifts"[^\n]+#gift/);
  assert.doesNotMatch(html, /title="Gaming is coming soon"[^\n]+#gamepad/, 'the duplicate Gaming feature is absent from the sidebar');
  assert.match(html, /title="Play Games is coming soon"[^\n]+#gamepad/, 'Play Games keeps the gamepad icon and remains available');
  assert.match(html, /data-left-action="reels"[^\n]+#reels/);
  assert.match(html, /data-view="leagues"[^\n]+#trophy/);
  assert.match(menuScript, /Clock Centre[^\n]*icon: 'clock'/);
  assert.match(menuScript, /Gaming Video[^\n]*icon: 'game-video'/);
  assert.match(menuScript, /Play Games[^\n]*icon: 'gamepad'/);
  assert.match(menuScript, /Meta AI[^\n]*icon: 'ai'/);
  assert.match(menuScript, /Ads Manager[^\n]*icon: 'megaphone'/);
  assert.match(menuScript, /label: 'Log out', icon: 'logout'/);
  assert.match(appScript, /value:'mobile_gaming'[^\n]*icon:'gamepad'/);
  assert.ok(appScript.includes("option.icon==='gamepad'?"), 'Mobile Gaming renders the dedicated gamepad artwork');
  assert.ok(appScript.includes('20261110-semantic-icons-3d-1#gamepad'), 'Mobile Gaming loads the current 3D gamepad symbol');

  for (const id of ['clock','gift','trophy','gamepad','game-video','reels','megaphone','ai','admin','logout']) {
    assert.ok(serviceWorker.includes('/assets/icons/navigation-3d.svg?v=20261110-semantic-icons-3d-1#' + id), id + ' is included in offline shell precache');
  }
});

test('3D icon presentation uses depth, lighting and reduced-motion-safe transitions', () => {
  assert.match(css, /\.nav-3d-icon\s*\{/);
  assert.match(css, /drop-shadow\(/);
  assert.match(css, /linear-gradient\(/);
  assert.match(css, /\.nav-item\.active \.nav-3d-icon/);
  assert.match(css, /\.mobile-nav button \.nav-3d-icon/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('service-worker shell pre-caches the latest icon sprite, stylesheet and app script', () => {
  const activeStyles=html.match(/href="(\/styles\.css\?v=[^"]+)"/)?.[1]||'';
  const activeScript=html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1]||'';
  assert.match(serviceWorker,/^const CACHE_NAME='minglora-shell-v[0-9]+-[^']+';$/m);
  assert.ok(activeStyles&&serviceWorker.includes("'"+activeStyles+"'"),'active stylesheet is cached');
  assert.ok(activeScript&&serviceWorker.includes("'"+activeScript+"'"),'active app script is cached');
  assert.match(serviceWorker,/mobile-profile-navigation\.css\?v=20261108-five-profile-metrics-1/);
  assert.match(serviceWorker,/\/assets\/icons\/navigation-3d\.svg/);
  assert.ok(html.includes('/minglora-menu.js?v=20261110-facebook-profile-dropdown-1'), 'the corrected Menu script is cache-busted');
  assert.ok(serviceWorker.includes("'/minglora-menu.js?v=20261110-facebook-profile-dropdown-1'"), 'the corrected Menu script is in the offline shell cache');
});

test('Facebook-style top bar keeps logo, Search, five navigation tabs and account controls in left-to-right order', () => {
  const headerMarker = html.indexOf('class="topbar"');
  const headerStart = html.lastIndexOf('<header', headerMarker);
  const headerEnd = html.indexOf('</header>', headerMarker);
  const header = headerStart >= 0 && headerEnd > headerStart ? html.slice(headerStart, headerEnd + 9) : '';
  assert.ok(header, 'top bar exists');
  const ordered = [
    'id="home-brand"',
    'id="top-search-form"',
    'class="top-nav"',
    'data-view="feed"',
    'data-view="for-you"',
    'data-view="live"',
    'data-view="meetwave"',
    'data-view="leagues"',
    'id="minglora-menu-toggle"',
    'id="messenger-btn"',
    'id="notifications-btn"',
    'id="profile-menu"'
  ];
  let last = -1;
  for (const marker of ordered) {
    const at = header.indexOf(marker);
    assert.ok(at > last, marker + ' appears in the intended left-to-right position');
    last = at;
  }
  assert.ok(header.includes('id="palette-toggle"') && header.includes('id="profile-menu"'), 'palette and profile dropdown controls remain available');
  assert.doesNotMatch(header, /id="settings-btn"/, 'Settings & Privacy is reached through the profile dropdown');
  assert.equal((menuScript.match(/label: 'Settings & privacy'/g) || []).length, 1, 'one Settings & Privacy dropdown action exists');
});

test('top bar gives navigation and action icons consistent dimensions at desktop, tablet and mobile widths', () => {
  assert.ok(css.includes('Minglora Facebook-style top bar sizing and alignment'));
  assert.ok(css.includes('height:72px'));
  assert.ok(css.includes('width:31px;height:31px'));
  assert.ok(css.includes('flex:0 0 42px;width:42px;height:42px'));
  assert.ok(css.includes('@media(max-width:980px) and (min-width:761px)'));
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(css.includes('.search-box:focus-within'));
});
