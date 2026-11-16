import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora Android downloads shared files through the system Download Manager over HTTPS', async () => {
  const java = await read('../../apps/android/app/src/main/java/com/minglora/social/MainActivity.java');
  const docs = await read('../../apps/android/README.md');

  assert.match(java, /webView\.setDownloadListener\(/);
  assert.match(java, /private void startUserDownload\(/);
  assert.match(java, /"https"\.equalsIgnoreCase\(uri\.getScheme\(\)\)/);
  assert.match(java, /uri\.getUserInfo\(\) != null/);
  assert.match(java, /URLUtil\.guessFileName\(/);
  assert.match(java, /replaceAll\("\[\^A-Za-z0-9\._ -\]", "_"\)/);
  assert.match(java, /DownloadManager manager = \(DownloadManager\) getSystemService\(DOWNLOAD_SERVICE\)/);
  assert.match(java, /request\.addRequestHeader\("User-Agent", userAgent\)/);
  assert.match(java, /CookieManager\.getInstance\(\)\.getCookie\(rawUrl\)/);
  assert.match(java, /request\.addRequestHeader\("Cookie", cookie\)/);
  assert.match(java, /setNotificationVisibility\(DownloadManager\.Request\.VISIBILITY_VISIBLE_NOTIFY_COMPLETED\)/);
  assert.match(java, /setAllowedOverRoaming\(false\)/);
  assert.match(java, /setDestinationInExternalFilesDir\(this, Environment\.DIRECTORY_DOWNLOADS, fileName\)/);
  assert.match(docs, /HTTPS media\/document links use Android Download Manager/);
});
