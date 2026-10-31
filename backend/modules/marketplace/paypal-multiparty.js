const PAYPAL_REST_TRANSACTION_CURRENCIES = new Set([
  'AUD','BRL','CAD','CNY','CZK','DKK','EUR','HKD','ILS','MYR','MXN',
  'NZD','NOK','PHP','PLN','GBP','RUB','SGD','SEK','CHF','THB','USD'
]);

const ZERO_DECIMAL_CURRENCIES = new Set(['HUF','JPY','TWD']);
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function marketplacePayPalConfig(env = process.env) {
  const mode = String(env.MARKETPLACE_PAYPAL_MODE || 'sandbox').trim().toLowerCase();
  const configured = Boolean(
    String(env.MARKETPLACE_PAYPAL_CLIENT_ID || '').trim() &&
    String(env.MARKETPLACE_PAYPAL_CLIENT_SECRET || '').trim() &&
    String(env.MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID || '').trim() &&
    String(env.MARKETPLACE_PAYPAL_ATTRIBUTION_ID || '').trim() &&
    String(env.MARKETPLACE_PAYPAL_WEBHOOK_ID || '').trim()
  );
  let base = String(env.MARKETPLACE_PAYPAL_API_BASE_URL || '').trim();
  while (base.endsWith('/')) base = base.slice(0, -1);
  if (!base) base = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const modeValid = mode === 'sandbox' || mode === 'live';
  const enabled = String(env.MARKETPLACE_PAYPAL_ENABLED || '').trim().toLowerCase() === 'true';
  const partnerApproved = String(env.MARKETPLACE_PAYPAL_PARTNER_APPROVED || '').trim().toLowerCase() === 'true';
  const liveApproved = String(env.MARKETPLACE_PAYPAL_LIVE_APPROVED || '').trim().toLowerCase() === 'true';
  const enabledForTransactions = enabled && configured && modeValid && (mode === 'sandbox' || partnerApproved) && (mode !== 'live' || liveApproved);
  return {
    mode,
    base,
    clientId: String(env.MARKETPLACE_PAYPAL_CLIENT_ID || '').trim(),
    clientSecret: String(env.MARKETPLACE_PAYPAL_CLIENT_SECRET || '').trim(),
    partnerMerchantId: String(env.MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID || '').trim(),
    attributionId: String(env.MARKETPLACE_PAYPAL_ATTRIBUTION_ID || '').trim(),
    webhookId: String(env.MARKETPLACE_PAYPAL_WEBHOOK_ID || '').trim(),
    configured,
    enabled,
    partnerApproved,
    liveApproved,
    enabledForTransactions
  };
}

export function marketplacePayPalReadiness(env = process.env) {
  const config = marketplacePayPalConfig(env);
  const blockers = [];
  if (!config.configured) blockers.push('Marketplace PayPal credentials, partner merchant ID, attribution ID and webhook ID must be configured separately from creator payouts.');
  if (!config.enabled) blockers.push('Marketplace PayPal integration is disabled.');
  if (config.mode === 'live' && !config.partnerApproved) blockers.push('PayPal must approve Minglora as a multiparty marketplace partner before live onboarding and payments.');
  if (config.mode === 'live' && !config.liveApproved) blockers.push('Live Marketplace PayPal mode requires an explicit production approval flag.');
  if (!['sandbox', 'live'].includes(config.mode)) blockers.push('Marketplace PayPal mode must be sandbox or live.');
  return {
    configured: config.configured,
    enabled: config.enabledForTransactions,
    mode: config.mode,
    blockers
  };
}

export function buildMarketplacePayPalAuthAssertion(clientId, payerId) {
  const issuer = String(clientId || '').trim();
  const payer = String(payerId || '').trim();
  if (!issuer || !payer) throw new Error('PayPal Auth Assertion requires the Marketplace client ID and merchant payer ID.');
  const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  return encode({ alg: 'none' }) + '.' + encode({ iss: issuer, payer_id: payer }) + '.';
}

export function buildMarketplacePayPalReferralPayload({
  trackingId,
  returnUrl,
  email,
  locale = 'en-JM'
}) {
  const tracking = String(trackingId || '').trim();
  const callback = String(returnUrl || '').trim();
  const contact = String(email || '').trim().toLowerCase();
  if (!tracking || tracking.length > 127 || !callback.startsWith('https://')) {
    throw new Error('A valid seller tracking ID and HTTPS return URL are required.');
  }
  if (contact && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || contact.length > 254)) {
    throw new Error('The seller contact email is invalid.');
  }
  const payload = {
    tracking_id: tracking,
    partner_config_override: {
      return_url: callback,
      return_url_description: 'Return to Minglora Seller Centre'
    },
    operations: [{
      operation: 'API_INTEGRATION',
      api_integration_preference: {
        rest_api_integration: {
          integration_method: 'PAYPAL',
          integration_type: 'THIRD_PARTY',
          third_party_details: {
            features: ['PAYMENT', 'REFUND']
          }
        }
      }
    }],
    products: ['EXPRESS_CHECKOUT'],
    legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }]
  };
  if (contact) payload.email = contact;
  if (locale) payload.preferred_language_code = locale;
  return payload;
}

export function isMarketplacePayPalCurrencySupported(currency) {
  const code = String(currency || '').trim().toUpperCase();
  return PAYPAL_REST_TRANSACTION_CURRENCIES.has(code) && !ZERO_DECIMAL_CURRENCIES.has(code);
}

export function marketplaceMinorToPayPalValue(amountMinor, currency) {
  const code = String(currency || '').trim().toUpperCase();
  const amount = Number(amountMinor);
  if (!isMarketplacePayPalCurrencySupported(code)) {
    throw new Error('PayPal Marketplace checkout does not currently support ' + code + ' in Minglora. A verified FX quote into a supported payment currency is required.');
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('PayPal amount must be a positive integer in minor currency units.');
  }
  return (amount / 100).toFixed(2);
}

export function buildMarketplacePayPalOrderPayload({ orderId, currency, sellerOrders, attributionId, returnUrl, cancelUrl }) {
  const id = String(orderId || '').trim();
  const code = String(currency || '').trim().toUpperCase();
  const attribution = String(attributionId || '').trim();
  if (!ID_PATTERN.test(id)) throw new Error('Invalid Minglora order ID.');
  if (!isMarketplacePayPalCurrencySupported(code)) {
    throw new Error('PayPal Marketplace checkout does not currently support ' + code + '.');
  }
  if (!attribution) throw new Error('Marketplace PayPal attribution ID is missing.');
  if (!String(returnUrl || '').startsWith('https://') || !String(cancelUrl || '').startsWith('https://')) throw new Error('PayPal buyer return and cancel URLs must use HTTPS.');
  if (!Array.isArray(sellerOrders) || sellerOrders.length < 1 || sellerOrders.length > 10) {
    throw new Error('PayPal multi-seller checkout supports between 1 and 10 seller orders per transaction.');
  }
  const seen = new Set();
  const purchase_units = sellerOrders.map((seller, index) => {
    const sellerOrderId = String(seller.sellerOrderId || '').trim();
    const merchantId = String(seller.merchantId || '').trim();
    const amountMinor = Number(seller.grossMinor);
    const feeMinor = Number(seller.platformFeeMinor || 0);
    if (!ID_PATTERN.test(sellerOrderId) || seen.has(sellerOrderId)) throw new Error('Every PayPal seller order must have a unique valid Minglora seller-order ID.');
    seen.add(sellerOrderId);
    if (!merchantId) throw new Error('A PayPal merchant ID is missing for a seller order.');
    const value = marketplaceMinorToPayPalValue(amountMinor, code);
    const fee = feeMinor > 0 ? marketplaceMinorToPayPalValue(feeMinor, code) : null;
    if (feeMinor > amountMinor) throw new Error('Minglora platform fee cannot exceed the seller order amount.');
    const unit = {
      reference_id: sellerOrderId,
      custom_id: id,
      payee: { merchant_id: merchantId },
      amount: { currency_code: code, value }
    };
    if (fee) {
      unit.payment_instruction = {
        disbursement_mode: 'INSTANT',
        platform_fees: [{ amount: { currency_code: code, value: fee } }]
      };
    } else {
      unit.payment_instruction = { disbursement_mode: 'INSTANT' };
    }
    if (seller.description) unit.description = String(seller.description).slice(0, 127);
    return unit;
  });
  return {
    intent: 'CAPTURE',
    purchase_units,
    application_context: {
      brand_name: 'Minglora',
      user_action: 'PAY_NOW',
      return_url: String(returnUrl),
      cancel_url: String(cancelUrl)
    }
  };
}

export function extractMarketplacePayPalApprovalUrl(response) {
  const links = Array.isArray(response?.links) ? response.links : [];
  const link = links.find(item => item?.rel === 'approve' || item?.rel === 'payer-action');
  if (!link?.href || !/^https:\/\//i.test(link.href)) {
    throw new Error('PayPal did not return a valid buyer approval link.');
  }
  return link.href;
}

export function parseMarketplacePayPalCapture(response, expectedSellerOrders) {
  const expected = new Map((expectedSellerOrders || []).map(item => [String(item.sellerOrderId), item]));
  const purchaseUnits = Array.isArray(response?.purchase_units) ? response.purchase_units : [];
  const rows = [];
  for (const unit of purchaseUnits) {
    const reference = String(unit?.reference_id || '');
    const seller = expected.get(reference);
    if (!seller) throw new Error('PayPal returned an unknown seller order reference.');
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    if (captures.length !== 1) throw new Error('PayPal did not return exactly one capture for a seller order.');
    const capture = captures[0];
    const amount = capture?.amount || {};
    if (String(amount.currency_code || '').toUpperCase() !== String(seller.currency).toUpperCase()) {
      throw new Error('PayPal capture currency did not match the Minglora seller order.');
    }
    const captureValue = String(amount.value || '');
    const expectedValue = marketplaceMinorToPayPalValue(seller.grossMinor, seller.currency);
    if (captureValue !== expectedValue) throw new Error('PayPal capture amount did not match the Minglora seller order.');
    const breakdown = capture?.seller_receivable_breakdown || {};
    const fee = breakdown.paypal_fee?.value == null ? 0 : Math.round(Number(breakdown.paypal_fee.value) * 100);
    const net = breakdown.net_amount?.value == null ? null : Math.round(Number(breakdown.net_amount.value) * 100);
    const platformFee = Number(seller.platformFeeMinor || 0);
    if (!capture.id || capture.status !== 'COMPLETED') throw new Error('A seller payment was not completed by PayPal.');
    if (!Number.isSafeInteger(fee) || fee < 0 || (net !== null && (!Number.isSafeInteger(net) || net < 0))) {
      throw new Error('PayPal returned an invalid seller fee breakdown.');
    }
    rows.push({
      sellerOrderId: reference,
      providerCaptureId: String(capture.id),
      amountMinor: Math.round(Number(captureValue) * 100),
      platformFeeMinor: platformFee,
      processorFeeMinor: fee,
      sellerNetMinor: net === null ? Math.max(0, Number(seller.grossMinor) - platformFee - fee) : net,
      status: 'captured',
      providerStatus: String(capture.status)
    });
  }
  if (rows.length !== expected.size || expected.size !== purchaseUnits.length) {
    throw new Error('PayPal did not capture every seller order in this Marketplace transaction.');
  }
  return rows;
}

export { PAYPAL_REST_TRANSACTION_CURRENCIES };
