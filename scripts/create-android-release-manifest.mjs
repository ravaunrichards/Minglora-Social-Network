import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'ravaunrichards/Minglora-Social-Network';
const APPLICATION_ID = 'com.minglora.social';

export async function createAndroidUpdateManifest({
  versionCode,
  versionName,
  minimumSupportedVersionCode = 1,
  apkPath,
  releaseNotes = '',
  repository = REPOSITORY
}) {
  const parsedVersionCode = Number(versionCode);
  const parsedMinimumVersion = Number(minimumSupportedVersionCode);
  if (!Number.isSafeInteger(parsedVersionCode) || parsedVersionCode < 1) {
    throw new Error('versionCode must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(parsedMinimumVersion) || parsedMinimumVersion < 1 || parsedMinimumVersion > parsedVersionCode) {
    throw new Error('minimumSupportedVersionCode must be positive and no greater than versionCode.');
  }
  if (typeof versionName !== 'string' || !versionName.trim()) throw new Error('versionName is required.');
  if (typeof apkPath !== 'string' || !apkPath.trim()) throw new Error('apkPath is required.');
  const apk = await readFile(apkPath);
  if (apk.length === 0) throw new Error('The release APK is empty.');
  const sha256 = createHash('sha256').update(apk).digest('hex');
  return {
    schemaVersion: 1,
    applicationId: APPLICATION_ID,
    versionCode: parsedVersionCode,
    versionName: versionName.trim(),
    minimumSupportedVersionCode: parsedMinimumVersion,
    releaseNotes: String(releaseNotes || '').trim() || `Minglora Android ${versionName.trim()}.`,
    apkUrl: `https://github.com/${repository}/releases/latest/download/minglora-android.apk`,
    releasePageUrl: `https://github.com/${repository}/releases/latest`,
    apkSha256: sha256,
    generatedAt: new Date().toISOString()
  };
}

async function run() {
  const apkPath = process.env.MINGLORA_ANDROID_APK_PATH;
  const outputPath = process.env.MINGLORA_ANDROID_UPDATE_OUTPUT || 'android-update.json';
  const manifest = await createAndroidUpdateManifest({
    versionCode: process.env.MINGLORA_ANDROID_VERSION_CODE,
    versionName: process.env.MINGLORA_ANDROID_VERSION_NAME,
    minimumSupportedVersionCode: process.env.MINGLORA_ANDROID_MIN_VERSION_CODE || '1',
    apkPath,
    releaseNotes: process.env.MINGLORA_ANDROID_RELEASE_NOTES || '',
    repository: REPOSITORY
  });
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`Created ${outputPath} for Minglora Android ${manifest.versionName} (code ${manifest.versionCode}).\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().catch(error => {
    process.stderr.write(`Android update manifest generation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
