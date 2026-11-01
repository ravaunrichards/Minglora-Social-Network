'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'public');
const androidAssetsDir = path.join(
  root,
  'meetwave-release-keystore',
  'app',
  'src',
  'main',
  'assets'
);

const requiredFiles = ['index.html', 'app.js', 'styles.css'];

if (!fs.existsSync(webDir) || !fs.statSync(webDir).isDirectory()) {
  throw new Error('The canonical website directory public/ is missing.');
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(webDir, file))) {
    throw new Error(`Required website asset is missing: public/${file}`);
  }
}

// public/ is the single source of truth. Recreate the packaged Android web
// assets on every test and release build so stale copies cannot ship.
fs.rmSync(androidAssetsDir, { recursive: true, force: true });
fs.mkdirSync(androidAssetsDir, { recursive: true });
fs.cpSync(webDir, androidAssetsDir, { recursive: true, force: true });

for (const file of requiredFiles) {
  const webFile = fs.readFileSync(path.join(webDir, file));
  const androidFile = fs.readFileSync(path.join(androidAssetsDir, file));
  if (!webFile.equals(androidFile)) {
    throw new Error(`Android asset synchronization failed for ${file}`);
  }
}

console.log(
  `MeetWave: synchronized ${requiredFiles.length} canonical web assets into the Android app.`
);
