import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const crosswalk = JSON.parse(fs.readFileSync(path.join(root, 'data/live-gift-reference-crosswalk.json'), 'utf8'));
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data/minglora-gift-catalog.json'), 'utf8'));
const giftsByCode = new Map(catalogue.gifts.map(gift => [gift.code, gift]));

test('sampled gift screenshots map to canonical catalogue names and prices without changing source assets', () => {
  assert.equal(crosswalk.summary.suppliedGiftCaptureScreenshots, 131);
  assert.equal(crosswalk.summary.sampledCaptureScreenshots, 5);
  assert.equal(crosswalk.captures.length, 5);
  const tiles = crosswalk.captures.flatMap(capture => {
    assert.ok(capture.sourceFile.startsWith('assets/Gifts/'));
    assert.match(capture.gitBlobSha, /^[a-f0-9]{40}$/);
    assert.equal(capture.format, 'PNG');
    assert.equal(capture.gridColumns, 6);
    assert.equal(fs.existsSync(path.join(root, capture.sourceFile)), true);
    return capture.tiles;
  });
  assert.equal(tiles.length, 102);
  assert.equal(crosswalk.summary.visuallyReadGiftTiles, tiles.length);
  assert.equal(tiles.filter(tile => tile.mappingStatus === 'matched').length, 87);
  assert.equal(tiles.filter(tile => tile.mappingStatus === 'unmatched_pending_human_review').length, 15);
  assert.deepEqual(crosswalk.summary.capturePriceCoinsObserved, [1]);
});

test('every matched gift resolves to canonical code, category, configured price and active state', () => {
  for (const tile of crosswalk.captures.flatMap(capture => capture.tiles)) {
    assert.equal(tile.capturePriceCoins, 1);
    if (tile.mappingStatus !== 'matched') {
      assert.equal(tile.catalogueCode, null);
      assert.equal(tile.canonicalCoinPrice, null);
      continue;
    }
    const gift = giftsByCode.get(tile.catalogueCode);
    assert.ok(gift, tile.catalogueCode + ' must exist in the canonical catalogue');
    assert.equal(tile.catalogueName, gift.name);
    assert.equal(tile.category, gift.category);
    assert.equal(tile.canonicalCoinPrice, gift.coin_price);
    assert.equal(tile.active, gift.active);
    assert.equal(tile.canonicalCoinPrice, tile.capturePriceCoins);
  }
  assert.equal(crosswalk.summary.matchedCanonicalPriceMismatches, 0);
  assert.equal(crosswalk.summary.matchedInactiveRecords, 1);
});

test('brand-like or unresolved source labels are not silently promoted to production gifts', () => {
  const tiles = crosswalk.captures.flatMap(capture => capture.tiles);
  const tiktok = tiles.find(tile => tile.referenceLabel === 'TikTok');
  assert.ok(tiktok);
  assert.equal(tiktok.mappingStatus, 'unmatched_pending_human_review');
  assert.equal(tiktok.catalogueCode, null);
  assert.match(tiktok.note, /Do not copy third-party logo\/wordmark/);
  for (const tile of tiles.filter(item => item.mappingStatus !== 'matched')) {
    assert.equal(tile.catalogueCode, null);
    assert.equal(tile.active, null);
  }
  assert.ok(tiles.some(tile => tile.referenceLabel === 'Club Cheers' && tile.note?.includes('different-looking artwork')));
});
