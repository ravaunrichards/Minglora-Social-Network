import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const server = read('src/server.js');
const styles = read('public/styles.css');

test('LIVE uses a single heart-like control beside the host profile instead of a reaction bar', () => {
  assert.match(app, /class='live-stage-topbar'/);
  assert.match(app, /class='live-host-profile'/);
  assert.match(app, /id='live-heart-like'.*data-live-reaction='heart'/);
  assert.match(app, /id='live-reaction-count'/);
  assert.match(app, /Object\.freeze\(\{heart:"❤️"\}\)/);
  assert.doesNotMatch(app, /live-reaction-bar|data-live-reaction='clap'|data-live-reaction='fire'|data-live-reaction='laugh'/);
  assert.match(styles, /\.live-heart-button/);
});

test('LIVE reactions travel over the room data channel and are validated before display', () => {
  assert.match(app, /RoomEvent\.DataReceived/);
  assert.match(app, /topic==="minglora-live-reaction"/);
  assert.match(app, /packet\?\.type!=="minglora\.live\.reaction"/);
  assert.match(app, /Object\.hasOwn\(liveReactionEmoji,packet\.reaction\)/);
  assert.match(app, /publishData\(packet,\{reliable:false,topic:"minglora-live-reaction"\}\)/);
  assert.match(app, /receivedLiveReactionAt/);
});

test('Viewer join grants data packets only and retains subscribe-only media permissions', () => {
  const joinStart = server.indexOf("let liveMatch = p.match(/^\\/api\\/live\\/sessions\\/([^/]+)\\/join");
  const joinEnd = server.indexOf("const liveConnectedMatch", joinStart);
  const joinRoute = server.slice(joinStart, joinEnd);
  assert.ok(joinStart >= 0 && joinEnd > joinStart);
  assert.match(joinRoute, /canPublish: role === 'host' \|\| role === 'guest'/);
  assert.match(joinRoute, /canPublishData: true/);
});

test('Reaction effects are transient overlays and respect reduced-motion settings', () => {
  assert.match(styles, /\.live-reaction-layer/);
  assert.match(styles, /\.live-reaction-float/);
  assert.match(styles, /@keyframes minglora-live-reaction-rise/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});
