import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = path.join(root, 'public');
const outputDir = path.join(root, 'artifacts/live-gift-model-render');
const cdnModule = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.4.0/model-viewer.min.js';

const gifts = [
  { name: 'Rose', code: 'rose-4ieccm' },
  { name: 'Hibiscus', code: 'hibiscus-5-mgl' },
  { name: 'Djembe Master', code: 'djembe-master-1v3jzkm' },
  { name: 'Palm Breeze', code: 'palm-breeze-gknyt0' },
  { name: 'Gamer Otter', code: 'gamer-otter-100-mgl' },
  { name: 'LIVE Island', code: 'live-island-rmn3mc' },
  { name: 'Crystal Crown', code: 'crystal-crown-1itryeu' },
  { name: 'Phoenix', code: 'phoenix-wep6uk' },
  { name: 'Beach Maracas', code: 'beach-maracas-1exxoag' },
  { name: 'Royal Lions Scepter', code: 'royal-lions-scepter-15000-mgl' }
];

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
];

function contentType(filePath) {
  if (filePath.endsWith('.gltf')) return 'model/gltf+json';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function previewHtml() {
  return '<!doctype html>\n' +
    '<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Minglora LIVE gift model render QA</title>' +
    '<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#090d1c;color:#f4f6ff}' +
    'body{display:grid;place-items:center;padding:18px}main{width:min(100%,960px);display:grid;gap:12px}' +
    'header{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}' +
    'header strong{font-size:clamp(16px,3vw,24px)}header span{font-size:12px;color:#b8c2d9}' +
    '.stage{height:min(72vh,660px);min-height:320px;border:1px solid #333e5a;border-radius:22px;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#29345a 0%,#121a32 48%,#090d1c 100%)}' +
    'model-viewer{display:block;width:100%;height:100%;background:transparent;--poster-color:transparent}footer{font-size:12px;color:#9ca9c4}</style>' +
    '<script type="module" src="' + cdnModule + '"></script></head><body><main>' +
    '<header><strong id="gift-name">Minglora LIVE gift</strong><span id="viewport-name">Render verification</span></header>' +
    '<section class="stage"><model-viewer id="gift-model" camera-controls auto-rotate rotation-per-second="18deg" interaction-prompt="none" shadow-intensity="0.65" exposure="1.1" alt="Original Minglora LIVE gift 3D model"></model-viewer></section>' +
    '<footer>Original Minglora gift asset · model-viewer 4.4.0 · Chromium render QA</footer></main>' +
    '<script>customElements.whenDefined("model-viewer").then(()=>{window.__mingloraModelViewerReady=true;});</script>' +
    '</body></html>';
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
  if (requestUrl.pathname === '/__gift-model-preview') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(previewHtml());
    return;
  }
  let relativePath;
  try { relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, ''); }
  catch {
    response.writeHead(400);
    response.end('Bad path');
    return;
  }
  const absolutePath = path.resolve(publicRoot, relativePath);
  if (!absolutePath.startsWith(publicRoot + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(absolutePath, (error, bytes) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end('Asset unavailable');
      return;
    }
    response.writeHead(200, {
      'content-type': contentType(absolutePath),
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    });
    response.end(bytes);
  });
});

await fs.promises.mkdir(outputDir, { recursive: true });
for (const gift of gifts) {
  assert.match(gift.code, /^[a-z0-9-]+$/);
  const base = path.join(publicRoot, 'assets/gifts/catalog');
  for (const suffix of ['.gltf', '.svg', '-icon.svg']) {
    const filePath = path.join(base, gift.code + suffix);
    assert.ok(fs.existsSync(filePath), gift.name + ' is missing generated ' + path.basename(filePath));
    assert.ok(fs.statSync(filePath).size > 0, gift.name + ' has an empty generated asset');
  }
  const document = JSON.parse(fs.readFileSync(path.join(base, gift.code + '.gltf'), 'utf8'));
  assert.equal(document.asset?.version, '2.0', gift.name + ' must be glTF 2.0');
  assert.ok((document.meshes || []).length > 0, gift.name + ' must include mesh geometry');
  assert.ok((document.buffers || []).length > 0, gift.name + ' must include geometry buffers');
}

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

let browser;
let context;
const results = [];
const pageErrors = [];
const browserConsoleMessages = [];
const httpFailures = [];
const requestFailures = [];
try {
  browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-gpu', '--enable-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader']
  });
  context = await browser.newContext({ deviceScaleFactor: 1 });
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;

  // Each gift/viewport gets a fresh page and exactly one model source.
  // This prevents source replacement from creating unrelated abort events.
  for (const viewport of viewports) {
    for (const gift of gifts) {
      const page = await context.newPage();
      const pageHttpFailures = [];
      const pageRequestFailures = [];
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        page.on('pageerror', error => pageErrors.push({
          gift: gift.name, viewport: viewport.name, message: error.message
        }));
        page.on('console', message => {
          if (message.type() === 'error' || message.type() === 'warning') {
            browserConsoleMessages.push({
              gift: gift.name, viewport: viewport.name,
              type: message.type(), message: message.text()
            });
          }
        });
        page.on('response', response => {
          if (response.status() >= 400) {
            const detail = {
              status: response.status(), url: response.url(),
              gift: gift.name, viewport: viewport.name
            };
            httpFailures.push(detail);
            pageHttpFailures.push(detail);
          }
        });
        page.on('requestfailed', request => {
          const failure = {
            url: request.url(),
            error: request.failure()?.errorText || 'unknown',
            gift: gift.name,
            viewport: viewport.name
          };
          requestFailures.push(failure);
          pageRequestFailures.push(failure);
        });

        await page.goto(baseUrl + '/__gift-model-preview', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__mingloraModelViewerReady === true, null, { timeout: 60000 });
        assert.ok(await page.evaluate(() => Boolean(customElements.get('model-viewer'))),
          'The production model-viewer 4.4.0 module must be available in Chromium.');

        const browserWebGL = await page.evaluate(() => {
          const probe = document.createElement('canvas');
          const context = probe.getContext('webgl2') || probe.getContext('webgl');
          const info = context ? {
            available: true,
            version: context.getParameter(context.VERSION),
            renderer: context.getParameter(context.RENDERER)
          } : { available: false, version: null, renderer: null };
          context?.getExtension('WEBGL_lose_context')?.loseContext();
          return info;
        });
        assert.equal(browserWebGL.available, true,
          'Chromium must expose WebGL for ' + gift.name + '/' + viewport.name + '. Browser console: ' +
          browserConsoleMessages.slice(-10).map(item => item.message).join(' | '));

        await page.evaluate(({ name, viewportName }) => {
          document.querySelector('#gift-name').textContent = name;
          document.querySelector('#viewport-name').textContent = viewportName + ' · isolated responsive render';
        }, { name: gift.name, viewportName: viewport.name });

        const modelPath = '/assets/gifts/catalog/' + gift.code + '.gltf';
        const render = await page.evaluate(async ({ source, name }) => {
          const viewer = document.querySelector('#gift-model');
          const detail = await new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              cleanup();
              reject(new Error(name + ' model-viewer load timed out'));
            }, 45000);
            const cleanup = () => {
              window.clearTimeout(timeout);
              viewer.removeEventListener('load', onLoad);
              viewer.removeEventListener('error', onError);
            };
            const onLoad = () => {
              cleanup();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve({ event: 'load' })));
            };
            const onError = event => {
              cleanup();
              reject(new Error(name + ' model-viewer emitted error: ' + String(event.detail?.type || 'unknown')));
            };
            viewer.addEventListener('load', onLoad, { once: true });
            viewer.addEventListener('error', onError, { once: true });
            viewer.src = source;
          });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const presentationCanvas = viewer.shadowRoot?.querySelector('canvas') || null;
          const imageDataUrl = viewer.toDataURL('image/png');
          const image = new Image();
          image.src = imageDataUrl;
          await image.decode();
          const pixelCanvas = document.createElement('canvas');
          pixelCanvas.width = image.naturalWidth;
          pixelCanvas.height = image.naturalHeight;
          const pixelContext = pixelCanvas.getContext('2d', { willReadFrequently: true });
          pixelContext.drawImage(image, 0, 0);
          const pixels = pixelContext.getImageData(0, 0, pixelCanvas.width, pixelCanvas.height).data;
          let visiblePixelCount = 0;
          const sampledColors = new Set();
          for (let index = 0; index < pixels.length; index += 16) {
            if (pixels[index + 3] > 16) {
              visiblePixelCount++;
              sampledColors.add(pixels[index] + ',' + pixels[index + 1] + ',' + pixels[index + 2]);
            }
          }
          return {
            event: detail.event,
            loaded: viewer.loaded,
            modelIsVisible: viewer.modelIsVisible,
            presentationCanvasPresent: Boolean(presentationCanvas),
            canvasWidth: presentationCanvas?.width || 0,
            canvasHeight: presentationCanvas?.height || 0,
            viewportWidth: Math.round(viewer.getBoundingClientRect().width),
            viewportHeight: Math.round(viewer.getBoundingClientRect().height),
            renderedImageWidth: image.naturalWidth,
            renderedImageHeight: image.naturalHeight,
            renderedImageBytes: imageDataUrl.length,
            visiblePixelSamples: visiblePixelCount,
            distinctVisibleColors: sampledColors.size
          };
        }, { source: modelPath, name: gift.name });

        assert.equal(render.loaded, true, gift.name + ' model must finish loading');
        assert.equal(render.modelIsVisible, true, gift.name + ' model must be visible');
        assert.equal(render.presentationCanvasPresent, true, gift.name + ' must mount its presentation canvas');
        assert.ok(render.canvasWidth > 0 && render.canvasHeight > 0, gift.name + ' must render to a non-zero presentation canvas');
        assert.ok(render.viewportWidth > 0 && render.viewportHeight > 0, gift.name + ' viewer must have visible layout dimensions');
        assert.ok(render.renderedImageBytes > 1000, gift.name + ' rendered frame must produce a non-empty image');
        assert.ok(render.renderedImageWidth > 0 && render.renderedImageHeight > 0, gift.name + ' rendered image dimensions must be non-zero');
        assert.ok(render.visiblePixelSamples > 10, gift.name + ' rendered image must contain visible model pixels');
        assert.ok(render.distinctVisibleColors > 8, gift.name + ' rendered image must contain non-uniform model detail');

        await page.waitForLoadState('networkidle', { timeout: 15000 });
        assert.deepEqual(pageHttpFailures, [],
          gift.name + '/' + viewport.name + ' must not receive HTTP error responses');
        assert.deepEqual(pageRequestFailures, [],
          gift.name + '/' + viewport.name + ' must not have failed network requests');

        const screenshot = path.join(outputDir, gift.code + '-' + viewport.name + '.png');
        await page.locator('#gift-model').screenshot({ path: screenshot, animations: 'disabled', timeout: 15000 });
        results.push({
          name: gift.name,
          code: gift.code,
          model_path: modelPath,
          viewport: viewport.name,
          dimensions: { width: viewport.width, height: viewport.height },
          renderer: browserWebGL,
          render
        });
      } finally {
        await page.close();
      }
    }
  }

  assert.deepEqual(pageErrors, [], 'Chromium must not report unhandled page errors.');
  assert.deepEqual(httpFailures, [], 'Chromium must not receive HTTP error responses: ' + JSON.stringify(httpFailures));
  assert.deepEqual(requestFailures, [], 'Chromium must not have failed network requests: ' + JSON.stringify(requestFailures));
  const report = {
    generated_at: new Date().toISOString(),
    result: 'passed',
    renderer: 'model-viewer 4.4.0 / Chromium WebGL',
    isolation: 'one page and one model source per gift/viewport render',
    gifts: gifts.length,
    viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
    render_checks: results.length,
    page_errors: pageErrors,
    http_failures: httpFailures,
    request_failures: requestFailures,
    checks: results
  };
  fs.writeFileSync(path.join(outputDir, 'render-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    result: report.result,
    gifts: report.gifts,
    viewports: report.viewports.length,
    render_checks: report.render_checks,
    pixel_render_checks: results.filter(item => item.render.visiblePixelSamples > 10).length,
    screenshots: results.length,
    page_errors: pageErrors.length,
    http_failures: httpFailures.length,
    request_failures: requestFailures.length,
    output: 'artifacts/live-gift-model-render/'
  }, null, 2));
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}