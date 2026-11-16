import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createAndroidUpdateManifest } from '../../scripts/create-android-release-manifest.mjs';

test('Android release manifest binds package, versions, release URL and APK checksum', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'minglora-android-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const apkPath = path.join(directory, 'minglora.apk');
  await writeFile(apkPath, Buffer.from('test-apk-binary'));
  const manifest = await createAndroidUpdateManifest({
    versionCode: '42',
    versionName: '1.0.42',
    minimumSupportedVersionCode: '40',
    apkPath,
    releaseNotes: 'Native update check improvements.'
  });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.applicationId, 'com.minglora.social');
  assert.equal(manifest.versionCode, 42);
  assert.equal(manifest.minimumSupportedVersionCode, 40);
  assert.equal(manifest.apkUrl, 'https://github.com/ravaunrichards/Minglora-Social-Network/releases/latest/download/minglora-android.apk');
  assert.match(manifest.apkSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.releaseNotes, 'Native update check improvements.');
});

test('Android release manifest rejects a minimum version greater than its release', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'minglora-android-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const apkPath = path.join(directory, 'minglora.apk');
  await writeFile(apkPath, Buffer.from('test-apk-binary'));
  await assert.rejects(
    createAndroidUpdateManifest({
      versionCode: 10,
      versionName: '1.0.10',
      minimumSupportedVersionCode: 11,
      apkPath
    }),
    /no greater than versionCode/
  );
});
