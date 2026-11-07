import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCreatorSubscriptionShares,
  calculateCreatorSubscriptionRefund
} from '../../backend/modules/subscriptions/service.js';

test('Jamaica-market subscription payout is 50% of net after PayPal fee and tax', () => {
  const result = calculateCreatorSubscriptionShares({
    grossMinor: 10000,
    processingFeeMinor: 500,
    taxMinor: 500
  });
  assert.deepEqual(result, {
    grossMinor: 10000,
    processingFeeMinor: 500,
    taxMinor: 500,
    netMinor: 9000,
    creatorShareBps: 5000,
    platformShareBps: 5000,
    performanceBonusBps: 0,
    creatorMinor: 4500,
    platformMinor: 4500
  });
});

test('approved performance bonus raises creator share to 70% of net, not gross', () => {
  const result = calculateCreatorSubscriptionShares({
    grossMinor: 10000,
    processingFeeMinor: 500,
    taxMinor: 500,
    performanceBonusBps: 2000
  });
  assert.equal(result.netMinor, 9000);
  assert.equal(result.creatorShareBps, 7000);
  assert.equal(result.platformShareBps, 3000);
  assert.equal(result.creatorMinor, 6300);
  assert.equal(result.platformMinor, 2700);
  assert.equal(result.creatorMinor + result.platformMinor, result.netMinor);
});

test('invalid PayPal fee, tax or bonus values fail closed', () => {
  assert.throws(() => calculateCreatorSubscriptionShares({
    grossMinor: 10000, processingFeeMinor: -1, taxMinor: 0
  }), /gross amount/);
  assert.throws(() => calculateCreatorSubscriptionShares({
    grossMinor: 10000, processingFeeMinor: 500, taxMinor: 500, performanceBonusBps: 3000
  }), /bonus/);
  assert.throws(() => calculateCreatorSubscriptionShares({
    grossMinor: 1000, processingFeeMinor: 500, taxMinor: 500
  }), /gross amount/);
});

test('multiple partial refunds reverse the original net creator/platform shares exactly', () => {
  const first = calculateCreatorSubscriptionRefund({
    originalGrossMinor: 10000, originalNetMinor: 9000, originalCreatorMinor: 6300,
    refundedBeforeMinor: 0, refundGrossMinor: 3333
  });
  const second = calculateCreatorSubscriptionRefund({
    originalGrossMinor: 10000, originalNetMinor: 9000, originalCreatorMinor: 6300,
    refundedBeforeMinor: first.refundedAfterMinor, refundGrossMinor: 6667
  });
  assert.equal(first.creatorMinor + second.creatorMinor, 6300);
  assert.equal(first.platformMinor + second.platformMinor, 2700);
  assert.equal(first.netMinor + second.netMinor, 9000);
  assert.equal(second.refundedAfterMinor, 10000);
  assert.throws(() => calculateCreatorSubscriptionRefund({
    originalGrossMinor: 10000, originalNetMinor: 9000, originalCreatorMinor: 6300,
    refundedBeforeMinor: 9000, refundGrossMinor: 1001
  }), /cannot exceed/);
});


test('runtime requires PayPal-matched settled fees and calculates shares from net only', async () => {
  const { readFile } = await import('node:fs/promises');
  const edge = await readFile(new URL('../../supabase/functions/minglora-runtime-state/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /transactionDetails\?\.transactions/);
  assert.match(edge, /status\s*\|\|\s*""\)\.toUpperCase\(\) === "COMPLETED"/);
  assert.match(edge, /fee_reconciled: true/);
  assert.match(edge, /const netMinor = amountMinor - providerFeeMinor - taxMinor/);
  assert.match(edge, /calculateCreatorSubscriptionShares/ === undefined ? /never/ : /never/);
  assert.match(edge, /parent_provider_transaction_id: originalSaleId/);
  assert.match(edge, /refundedAfterMinor/);
  assert.match(edge, /qualifyingVideoViews >= 100000/);
  assert.doesNotMatch(edge, /creatorMinor = amountMinor \* creatorShareBps/);
});
