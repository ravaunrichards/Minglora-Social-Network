import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const legacyStyles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/live-guest-layout-reference.css'), 'utf8');

const screenLayouts = [
  ['full-screen', 'Full Screen', 'Full Screen.jpg'],
  ['fluid-panel', 'Fluid Panel', 'Fluid Panel.jpg'],
  ['fluid-grid', 'Fluid Grid', 'Fluid Grid.jpg'],
  ['fixed-grid', 'Fixed Grid', 'Fixed Grid.jpg'],
  ['fixed-panel', 'Fixed Panel', 'Fixed Panel.jpg'],
  ['side-by-side', 'Side by Side', 'Side by Side.jpg'],
  ['spotlight', 'Spotlight', 'Spotlight.jpg']
];
const guestLayouts = [
  ['roundtable-1', 'Roundtable 1', 'Roundtable 1.jpg'],
  ['roundtable-2', 'Roundtable 2', 'Roundtable 2.jpg']
];

test('All nine supplied references, exact picker labels and stable IDs are preserved', () => {
  for (const [value, label, reference] of [...screenLayouts, ...guestLayouts]) {
    assert.ok(app.includes("value:'" + value + "',label:'" + label + "'"),
      label + ' must keep its exact visible label and stable identifier');
    assert.ok(fs.existsSync(path.join(root, 'assets/Guests Layout', reference)),
      label + ' supplied reference file must remain present and read-only');
  }
  assert.match(app, /const LIVE_SCREEN_LAYOUT_OPTIONS=Object\.freeze/);
  assert.match(app, /const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze/);
});

test('The reference stylesheet loads after every existing stylesheet', () => {
  const canonical = html.indexOf('/live-guest-layout-reference.css');
  assert.ok(canonical >= 0, 'canonical reference stylesheet is linked');
  const stylesheetLinks = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+>/g)]
    .map(match => match[0]);
  assert.ok(stylesheetLinks.length > 0);
  assert.equal(stylesheetLinks.at(-1).includes('/live-guest-layout-reference.css'), true,
    'reference layout rules must load last so legacy declarations cannot override them');
});

test('The seven video screen layouts are isolated from Audio Only grid rules', () => {
  assert.equal((css.match(/#live-video-stage:not\(\.live-audio-stage\)/g) || []).length >= 25, true);
  assert.doesNotMatch(css, /#live-video-stage:not\(\.live-audio-stage\)[^{]*\{[^}]*\.live-audio-stage/);
  assert.match(app, /const fullScreenHostOnly=activeLiveScreenLayout==="full-screen"&&!root\.closest\("\.live-audio-stage"\)/);
});

test('Full Screen keeps its host-first implementation and connected guest strip', () => {
  assert.match(app, /classList\.toggle\('live-full-screen-layout',activeLiveScreenLayout==='full-screen'\)/);
  assert.match(legacyStyles, /\.live-host-only-layout:not\(\.has-active-guests\)/);
  assert.match(legacyStyles, /\.live-host-only-layout\.has-active-guests:not\(\.has-many-guests\)/);
  assert.doesNotMatch(css, /data-live-layout="full-screen"\]\{/,
    'the additive file must not override the existing Full Screen host/guest sizing contract');
});

test('Fluid Panel has a full-stage host with exactly two bottom-right overlay guest boxes', () => {
  assert.match(css, /data-live-layout="fluid-panel"\]\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1\/-1!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat:nth-child\(3\)\{[\s\S]*?grid-column:4!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat:nth-child\(4\)\{[\s\S]*?grid-column:4!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat:nth-child\(n\+5\)\{display:none!important\}/);
});

test('Fluid Grid has one large left tile and two stacked right tiles', () => {
  assert.match(css, /data-live-layout="fluid-grid"\]\{[\s\S]*?grid-template-columns:minmax\(0,1\.35fr\) minmax\(0,\.65fr\)!important/);
  assert.match(css, /data-live-layout="fluid-grid"\]\s*>\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1!important;\s*grid-row:2\/4!important/);
  assert.match(css, /data-live-layout="fluid-grid"\]\s*>\.live-guest-seat:nth-child\(3\)\{[\s\S]*?grid-row:2!important/);
  assert.match(css, /data-live-layout="fluid-grid"\]\s*>\.live-guest-seat:nth-child\(4\)\{[\s\S]*?grid-row:3!important/);
});

test('Fixed Grid is exactly 3 columns by 3 equal rows for nine participants', () => {
  const fixedGrid = css.slice(css.indexOf('/* 4. Fixed Grid'), css.indexOf('/* 5. Fixed Panel'));
  assert.match(fixedGrid, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(fixedGrid, /grid-template-rows:repeat\(3,minmax\(72px,1fr\)\)!important/);
  assert.match(fixedGrid, /aspect-ratio:1\/1!important/);
  assert.match(app, /guests\.slice\(0,8\)/);
});

test('Fixed Panel has one large left panel and three fixed right-side boxes', () => {
  const fixedPanel = css.slice(css.indexOf('/* 5. Fixed Panel'), css.indexOf('/* 6. Side by Side'));
  assert.match(fixedPanel, /grid-template-columns:minmax\(0,1\.7fr\) minmax\(76px,\.7fr\)!important/);
  assert.match(fixedPanel, /\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1!important;\s*grid-row:1\/4!important/);
  for (const child of [3, 4, 5]) assert.ok(fixedPanel.includes('nth-child(' + child + ')'));
  assert.match(fixedPanel, /nth-child\(n\+6\)\{display:none!important\}/);
});

test('Side by Side has two large upper tiles above the compact guest grid', () => {
  const side = css.slice(css.indexOf('/* 6. Side by Side'), css.indexOf('/* 7. Spotlight'));
  assert.match(side, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(side, /\.live-guest-seat\.is-host\{\s*grid-column:1\/3!important;grid-row:2!important/);
  assert.match(side, /\.live-guest-seat:nth-child\(3\)\{\s*grid-column:3\/5!important;grid-row:2!important/);
  assert.match(side, /repeat\(2,minmax\(54px,\.58fr\)\)/);
});

test('Spotlight has one wide primary tile over two compact rows', () => {
  const spotlight = css.slice(css.indexOf('/* 7. Spotlight'), css.indexOf('/* Guest-box layouts'));
  assert.match(spotlight, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(spotlight, /\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1\/-1!important;\s*grid-row:2!important/);
  assert.match(spotlight, /repeat\(2,minmax\(54px,\.6fr\)\)/);
});

test('Roundtable guest-box choices do not replace the selected screen grid', () => {
  const start = css.indexOf('/* Guest-box layouts');
  const end = css.indexOf('/* Layout picker thumbnails', start);
  const roundtable = css.slice(start, end);
  assert.match(roundtable, /data-live-guest-layout="roundtable-1"\]\s*>\.live-guest-seat\.is-host\{\s*grid-column:2!important;grid-row:2!important/);
  assert.match(roundtable, /data-live-guest-layout="roundtable-2"\]\s*>\.live-guest-seat\.is-host\{\s*grid-column:span 2!important;grid-row:span 2!important/);
  assert.doesNotMatch(roundtable, /grid-template-(columns|rows)/);
  assert.match(app, /topic:"minglora-live-guest-layout"/);
});

test('All nine labels have matching visual previews and responsive grid rules', () => {
  for (const [value] of screenLayouts) {
    assert.ok(css.includes('#live-layout-options .live-layout-option[data-live-screen-layout="' + value + '"]::before{background-image:url("data:image/svg+xml;'),
      value + ' needs its own screen-layout preview');
  }
  for (const [value] of guestLayouts) {
    assert.ok(css.includes('#live-guest-layout-options .live-layout-option[data-live-guest-layout="' + value + '"]::before{background-image:url("data:image/svg+xml;'),
      value + ' needs its own guest-box preview');
  }
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /fixed-grid"\]\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css, /spotlight"\]\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});
