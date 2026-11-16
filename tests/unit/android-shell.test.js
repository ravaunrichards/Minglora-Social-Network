import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora Android promotes HTML video fullscreen into an immersive native surface', async () => {
  const java = await read('../../apps/android/app/src/main/java/com/minglora/social/MainActivity.java');

  assert.match(java, /onShowCustomView\(View view, CustomViewCallback callback\)/);
  assert.match(java, /onHideCustomView\(\)/);
  assert.match(java, /private void showCustomView\(/);
  assert.match(java, /private void hideCustomView\(/);
  assert.match(java, /SYSTEM_UI_FLAG_FULLSCREEN/);
  assert.match(java, /SYSTEM_UI_FLAG_HIDE_NAVIGATION/);
  assert.match(java, /SYSTEM_UI_FLAG_IMMERSIVE_STICKY/);
  assert.match(java, /if \(customView != null\) \{\s*hideCustomView\(\);\s*return;\s*\}/);
  assert.ok(java.indexOf('if (customView != null) {\n            hideCustomView();') <
    java.indexOf('if (webView != null && webView.canGoBack()) webView.goBack();'),
    'Android Back exits immersive video before traversing page history');
});

test('Minglora Android has a native recoverable main-page loading state', async () => {
  const java = await read('../../apps/android/app/src/main/java/com/minglora/social/MainActivity.java');

  assert.match(java, /private View createLoadErrorPanel\(\)/);
  assert.match(java, /Unable to connect/);
  assert.match(java, /private void showLoadError\(String message\)/);
  assert.match(java, /private void hideLoadError\(\)/);
  assert.match(java, /private void retryPage\(\)/);
  assert.match(java, /request\.isForMainFrame\(\)/);
  assert.match(java, /onReceivedHttpError\(/);
  assert.match(java, /onReceivedSslError\(/);
  assert.match(java, /onRenderProcessGone\(/);
  assert.match(java, /createWebView\(\);\s*webView\.loadUrl\(BuildConfig\.MINGLORA_BASE_URL\);/);
});

test('Minglora Android keeps media selection and WebView lifecycle aligned with the platform', async () => {
  const [java, docs] = await Promise.all([
    read('../../apps/android/app/src/main/java/com/minglora/social/MainActivity.java'),
    read('../../apps/android/README.md')
  ]);

  assert.match(java, /Intent intent = params\.createIntent\(\)/);
  assert.match(java, /params\.getMode\(\) == WebChromeClient\.FileChooserParams\.MODE_OPEN_MULTIPLE/);
  assert.match(java, /protected void onPause\(\)/);
  assert.match(java, /webView\.onPause\(\)/);
  assert.match(java, /webView\.onResume\(\)/);
  assert.match(java, /CookieManager\.getInstance\(\)\.flush\(\)/);
  assert.match(docs, /Video players that request HTML fullscreen/);
  assert.match(docs, /renderer/);
});

test('Minglora Android opens the native share sheet only for trusted Minglora HTTPS pages and links', async () => {
  const [java, app, docs] = await Promise.all([
    read('../../apps/android/app/src/main/java/com/minglora/social/MainActivity.java'),
    read('../../public/app.js'),
    read('../../apps/android/README.md')
  ]);

  assert.match(java, /import android\.webkit\.JavascriptInterface/);
  assert.match(java, /addJavascriptInterface\(new MingloraAndroidBridge\(\), "MingloraAndroid"\)/);
  assert.match(java, /private boolean isTrustedMingloraPage\(\)/);
  assert.match(java, /"https"\.equalsIgnoreCase\(current\.getScheme\(\)\)/);
  assert.match(java, /APP_HOST\.equalsIgnoreCase\(current\.getHost\(\)\)/);
  assert.match(java, /public void shareText\(String title, String text, String rawUrl\)/);
  assert.match(java, /APP_HOST\.equalsIgnoreCase\(shareUri\.getHost\(\)\)/);
  assert.match(java, /new Intent\(Intent\.ACTION_SEND\)/);
  assert.match(java, /Intent\.createChooser\(shareIntent, chooserTitle\)/);
  assert.match(app, /window\.MingloraAndroid\.shareText\(shareTitle,shareText,shareUrl\)/);
  assert.match(app, /navigator\.share\(\{title:shareTitle,text:shareText,url:shareUrl\}\)/);
  assert.match(docs, /Android Sharesheet/);
});
