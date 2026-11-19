import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  createLiveKitToken,
  deleteLiveKitRoom,
  ensureLiveKitRoom,
  listLiveKitParticipants,
  LIVEKIT_TRACK_SOURCE
} from '../../backend/modules/live/livekit.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportDirectory = path.join(repoRoot, 'artifacts/live-cohost-livekit');
const appSource = await fs.readFile(path.join(repoRoot, 'public/app.js'), 'utf8');
const cloneStart = appSource.indexOf('async function syncLiveCohostLocalTracks(');
const cloneEnd = appSource.indexOf('\nasync function stopLiveCohostLocal()', cloneStart);
assert.ok(cloneStart >= 0 && cloneEnd > cloneStart,
  'The production Co-host track-cloning function must exist in public/app.js.');
const productionCloneFunction = appSource.slice(cloneStart, cloneEnd).trim();

const requiredEnv = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const missingEnv = requiredEnv.filter(key => !String(process.env[key] || '').trim());
if (missingEnv.length) {
  throw new Error('Real LiveKit acceptance cannot run; missing GitHub Actions secrets: ' + missingEnv.join(', '));
}

const suffix = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 10);
const roomNames = {
  hostPrimary: 'minglora_cohost_test_host_' + suffix,
  creatorPrimary: 'minglora_cohost_test_creator_' + suffix,
  cohost: 'minglora_cohost_shared_' + suffix
};
const identities = {
  host: 'cohost-host-' + suffix,
  creator: 'cohost-invited-creator-' + suffix
};
const report = {
  test: 'Minglora two-creator LiveKit Co-host acceptance',
  status: 'running',
  identities: Object.values(identities),
  rooms: Object.values(roomNames),
  checks: {}
};
let browser;
let server;
let contexts = [];
let cleanupError = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForParticipants(roomName, expectedIdentities, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const participants = await listLiveKitParticipants(roomName);
      const found = new Set(participants.map(item => item.identity));
      if (expectedIdentities.every(identity => found.has(identity)) &&
          found.size === expectedIdentities.length) return participants;
    } catch {}
    await sleep(250);
  }
  const final = await listLiveKitParticipants(roomName).catch(() => []);
  throw new Error('LiveKit participant state did not settle for ' + roomName +
    '; found: ' + final.map(item => item.identity).join(', '));
}

async function createPage(page, liveKitModulePath) {
  await page.goto('http://127.0.0.1:' + server.address().port + '/__livekit-acceptance__.html');
  await page.evaluate(async modulePath => {
    window.LivekitAcceptance = await import(modulePath);
    window.LivekitAcceptanceRooms = {};
  }, liveKitModulePath);
}

async function connectPrimary(page, identity, roomName, token) {
  await page.evaluate(async ({ identity, roomName, url, token }) => {
    const { Room, RoomEvent, createLocalTracks } = window.LivekitAcceptance;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const remoteTracks = [];
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      remoteTracks.push({ identity: participant.identity, kind: track.kind });
    });
    await room.connect(url, token);
    const localTracks = await createLocalTracks({ audio: true, video: true });
    const published = [];
    for (const track of localTracks) {
      await room.localParticipant.publishTrack(track);
      published.push(track.kind);
    }
    if (!published.includes('audio') || !published.includes('video')) {
      throw new Error('The primary LIVE did not publish both microphone and camera tracks.');
    }
    window.LivekitAcceptanceRooms.primary = room;
    window.LivekitAcceptanceRooms.primaryTracks = localTracks;
    window.LivekitAcceptanceRooms.primaryRemoteTracks = remoteTracks;
    window.LivekitAcceptanceRooms.identity = identity;
    window.LivekitAcceptanceRooms.primaryRoomName = roomName;
  }, { identity, roomName, url: process.env.LIVEKIT_URL, token });
}

async function connectCohostAndClone(page, token, identity, sourceCode) {
  await page.evaluate(async ({ token, identity, url, sourceCode }) => {
    const { Room, RoomEvent } = window.LivekitAcceptance;
    const secondary = new Room({ adaptiveStream: true, dynacast: true });
    const remoteTracks = [];
    secondary.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      remoteTracks.push({ identity: participant.identity, kind: track.kind });
    });
    await secondary.connect(url, token);
    const clonedTracks = [];
    const attachTrack = () => {};
    const state = { user: { id: identity, name: identity, username: identity } };
    const build = new Function(
      'activeLiveCohostClonedTracks',
      'activeLiveCohostRoom',
      'client',
      'attachLiveCohostTrack',
      'state',
      sourceCode + '\nreturn syncLiveCohostLocalTracks;'
    );
    const syncProductionTracks = build(
      clonedTracks,
      secondary,
      window.LivekitAcceptance,
      attachTrack,
      state
    );
    await syncProductionTracks(
      window.LivekitAcceptanceRooms.primary,
      secondary,
      window.LivekitAcceptance
    );
    window.LivekitAcceptanceRooms.secondary = secondary;
    window.LivekitAcceptanceRooms.clonedTracks = clonedTracks;
    window.LivekitAcceptanceRooms.secondaryRemoteTracks = remoteTracks;
  }, { token, identity, url: process.env.LIVEKIT_URL, sourceCode });
}

async function disconnectCohostOnly(page) {
  await page.evaluate(async () => {
    const rooms = window.LivekitAcceptanceRooms;
    if (rooms.secondary) await rooms.secondary.disconnect();
    for (const item of rooms.clonedTracks || []) {
      try { item.clone?.stop?.(); } catch {}
    }
    rooms.clonedTracks = [];
  });
}

async function main() {
  const liveKitClientEntry = fileURLToPath(import.meta.resolve('livekit-client'));
  const liveKitModulePath = '/' + path.relative(repoRoot, liveKitClientEntry).split(path.sep).join('/');

  server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (pathname === '/__livekit-acceptance__.html' || pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>Minglora LiveKit acceptance</title></head><body><main id="test-root">LiveKit acceptance runner</main></body></html>');
        return;
      }
      const filePath = path.resolve(repoRoot, '.' + decodeURIComponent(pathname));
      if (!filePath.startsWith(repoRoot + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.wasm': 'application/wasm',
        '.css': 'text/css; charset=utf-8'
      };
      res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'access-control-allow-origin': '*' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  for (const roomName of Object.values(roomNames)) await ensureLiveKitRoom(roomName, 4);

  const hostPrimary = await createLiveKitToken({
    identity: identities.host, name: 'Minglora Co-host test host',
    roomName: roomNames.hostPrimary, canPublish: true,
    publishSources: [LIVEKIT_TRACK_SOURCE.MICROPHONE, LIVEKIT_TRACK_SOURCE.CAMERA]
  });
  const creatorPrimary = await createLiveKitToken({
    identity: identities.creator, name: 'Minglora invited creator',
    roomName: roomNames.creatorPrimary, canPublish: true,
    publishSources: [LIVEKIT_TRACK_SOURCE.MICROPHONE, LIVEKIT_TRACK_SOURCE.CAMERA]
  });
  const hostCohost = await createLiveKitToken({
    identity: identities.host, name: 'Minglora Co-host test host',
    roomName: roomNames.cohost, canPublish: true,
    publishSources: [LIVEKIT_TRACK_SOURCE.MICROPHONE, LIVEKIT_TRACK_SOURCE.CAMERA]
  });
  const creatorCohost = await createLiveKitToken({
    identity: identities.creator, name: 'Minglora invited creator',
    roomName: roomNames.cohost, canPublish: true,
    publishSources: [LIVEKIT_TRACK_SOURCE.MICROPHONE, LIVEKIT_TRACK_SOURCE.CAMERA]
  });

  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });
  const hostContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const creatorContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  contexts = [hostContext, creatorContext];
  const hostPage = await hostContext.newPage();
  const creatorPage = await creatorContext.newPage();
  await Promise.all([createPage(hostPage, liveKitModulePath), createPage(creatorPage, liveKitModulePath)]);

  await Promise.all([
    connectPrimary(hostPage, identities.host, roomNames.hostPrimary, hostPrimary.token),
    connectPrimary(creatorPage, identities.creator, roomNames.creatorPrimary, creatorPrimary.token)
  ]);
  report.checks.independentPrimaryRooms =
    'passed: host and invited creator each connected to a distinct original LIVE room and published camera plus microphone';

  await Promise.all([
    connectCohostAndClone(hostPage, hostCohost.token, identities.host, productionCloneFunction),
    connectCohostAndClone(creatorPage, creatorCohost.token, identities.creator, productionCloneFunction)
  ]);

  await waitForParticipants(roomNames.hostPrimary, [identities.host]);
  await waitForParticipants(roomNames.creatorPrimary, [identities.creator]);
  await waitForParticipants(roomNames.cohost, [identities.host, identities.creator]);
  report.checks.sharedCohostRoom =
    'passed: both creator identities joined the same secondary Co-host room while their original rooms remained separate';

  for (const [label, page, remoteIdentity] of [
    ['host', hostPage, identities.creator],
    ['invitedCreator', creatorPage, identities.host]
  ]) {
    await page.waitForFunction(identity => {
      const subscribed = window.LivekitAcceptanceRooms.secondaryRemoteTracks || [];
      return subscribed.some(item => item.identity === identity && item.kind === 'audio') &&
        subscribed.some(item => item.identity === identity && item.kind === 'video');
    }, remoteIdentity, { timeout: 30000 });
    const result = await page.evaluate(() => {
      const rooms = window.LivekitAcceptanceRooms;
      const localKinds = Array.from(rooms.secondary.localParticipant.trackPublications?.values?.() || [])
        .map(item => String(item.track?.kind || item.kind || '').toLowerCase());
      const clones = rooms.clonedTracks || [];
      const original = rooms.primaryTracks || [];
      return {
        localKinds,
        cloneKinds: clones.map(item => item.kind),
        clonedTrackStates: clones.map(item => item.clone?.readyState || null),
        originalTrackStates: original.map(item => item.mediaStreamTrack?.readyState || item.state || null),
        primaryConnected: String(rooms.primary.state).toLowerCase().includes('connected')
      };
    });
    assert.ok(result.cloneKinds.includes('audio') && result.cloneKinds.includes('video'),
      label + ' did not clone and publish both microphone and camera tracks: ' + JSON.stringify(result));
    assert.ok(result.localKinds.includes('audio') && result.localKinds.includes('video'),
      label + ' did not publish audio and video into the Co-host room: ' + JSON.stringify(result));
    assert.ok(result.clonedTrackStates.every(state => state === 'live'),
      label + ' cloned media tracks were not live: ' + JSON.stringify(result.clonedTrackStates));
    assert.ok(result.primaryConnected, label + ' original LIVE disconnected during Co-host setup.');
    assert.ok(result.originalTrackStates.every(state => state === 'live'),
      label + ' original media tracks stopped when cloned.');
    report.checks[label + 'MediaCloneAndRemoteSubscription'] =
      'passed: original microphone/camera cloned, published to Co-host and received by the other creator';
  }

  await disconnectCohostOnly(creatorPage);
  await waitForParticipants(roomNames.cohost, [identities.host]);
  const originalRoomsAfterCreatorLeave = await Promise.all([
    waitForParticipants(roomNames.hostPrimary, [identities.host]),
    waitForParticipants(roomNames.creatorPrimary, [identities.creator])
  ]);
  assert.equal(originalRoomsAfterCreatorLeave[0].length, 1);
  assert.equal(originalRoomsAfterCreatorLeave[1].length, 1);
  const creatorStillLive = await creatorPage.evaluate(() =>
    String(window.LivekitAcceptanceRooms.primary.state).toLowerCase().includes('connected'));
  const hostStillLive = await hostPage.evaluate(() =>
    String(window.LivekitAcceptanceRooms.primary.state).toLowerCase().includes('connected'));
  assert.ok(creatorStillLive && hostStillLive,
    'A creator primary LIVE room disconnected when the invited creator left Co-host.');
  report.checks.creatorLeaveIsolation =
    'passed: invited creator left the secondary room; host Co-host remained and both original LIVE rooms stayed connected';

  await deleteLiveKitRoom(roomNames.cohost);
  await sleep(500);
  const hostPrimaryAfterEnd = await waitForParticipants(roomNames.hostPrimary, [identities.host]);
  const creatorPrimaryAfterEnd = await waitForParticipants(roomNames.creatorPrimary, [identities.creator]);
  assert.equal(hostPrimaryAfterEnd.length, 1);
  assert.equal(creatorPrimaryAfterEnd.length, 1);
  const primariesAfterEnd = await Promise.all([
    hostPage.evaluate(() => String(window.LivekitAcceptanceRooms.primary.state).toLowerCase().includes('connected')),
    creatorPage.evaluate(() => String(window.LivekitAcceptanceRooms.primary.state).toLowerCase().includes('connected'))
  ]);
  assert.ok(primariesAfterEnd.every(Boolean),
    'Ending the shared Co-host room disconnected an original creator LIVE room.');
  report.checks.hostEndIsolation =
    'passed: shared Co-host room ended and both creators original LIVE rooms remained connected';
  report.status = 'passed';
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} catch (error) {
  report.status = 'failed';
  report.error = String(error?.stack || error?.message || error).slice(0, 4000);
  console.error('[Minglora two-account LiveKit acceptance failed]', report.error);
  process.exitCode = 1;
} finally {
  for (const context of contexts) {
    try {
      for (const page of context.pages()) {
        await page.evaluate(async () => {
          const rooms = window.LivekitAcceptanceRooms || {};
          for (const room of [rooms.secondary, rooms.primary]) {
            try { await room?.disconnect?.(); } catch {}
          }
          for (const item of rooms.clonedTracks || []) {
            try { item.clone?.stop?.(); } catch {}
          }
          for (const track of rooms.primaryTracks || []) {
            try { track.stop?.(); } catch {}
          }
        }).catch(() => {});
      }
      await context.close();
    } catch (error) {
      cleanupError ||= String(error?.message || error);
    }
  }
  try { await browser?.close(); } catch (error) { cleanupError ||= String(error?.message || error); }
  for (const roomName of Object.values(roomNames)) {
    try { await deleteLiveKitRoom(roomName); } catch {}
  }
  try { server?.close(); } catch (error) { cleanupError ||= String(error?.message || error); }
  try {
    await fs.mkdir(reportDirectory, { recursive: true });
    if (cleanupError) report.cleanupWarning = cleanupError;
    await fs.writeFile(
      path.join(reportDirectory, 'two-account-livekit-acceptance.json'),
      JSON.stringify(report, null, 2) + '\n'
    );
  } catch (error) {
    console.error('[Minglora test evidence write failed]', String(error?.message || error));
  }
}
