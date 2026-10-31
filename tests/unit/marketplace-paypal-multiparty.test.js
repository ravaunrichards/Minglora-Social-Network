import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketplacePayPalAuthAssertion,
  buildMarketplacePayPalReferralPayload,
  buildMarketplacePayPalOrderPayload,
  extractMarketplacePayPalApprovalUrl,
  isMarketplacePayPalCurrencySupported,
  marketplaceMinorToPayPalValue,
  marketplacePayPalConfig,
  marketplacePayPalReadiness,
  parseMarketplacePayPalCapture
} from '../../backend/modules/marketplace/paypal-multiparty.js';

const sellerOrder1={
  sellerOrderId:'11111111-1111-4111-8111-111111111111',
  merchantId:'PAYPALMERCHANT0001',
  grossMinor:12500,
  platformFeeMinor:1250,
  currency:'USD',
  description:'Minglora seller order'
};
const sellerOrder2={
  sellerOrderId:'22222222-2222-4222-8222-222222222222',
  merchantId:'PAYPALMERCHANT0002',
  grossMinor:7500,
  platformFeeMinor:750,
  currency:'USD'
};

test('Marketplace PayPal credentials are isolated from creator PayPal credentials',()=>{
  const env={
    PAYPAL_CLIENT_ID:'creator-client',
    PAYPAL_CLIENT_SECRET:'creator-secret',
    MARKETPLACE_PAYPAL_CLIENT_ID:'market-client',
    MARKETPLACE_PAYPAL_CLIENT_SECRET:'market-secret',
    MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID:'partner-merchant',
    MARKETPLACE_PAYPAL_ATTRIBUTION_ID:'MINGLORA_BN',
    MARKETPLACE_PAYPAL_WEBHOOK_ID:'market-webhook',
    MARKETPLACE_PAYPAL_ENABLED:'true',
    MARKETPLACE_PAYPAL_PARTNER_APPROVED:'true',
    MARKETPLACE_PAYPAL_MODE:'sandbox'
  };
  const config=marketplacePayPalConfig(env);
  assert.equal(config.clientId,'market-client');
  assert.equal(config.enabledForTransactions,true);
  assert.equal(config.base,'https://api-m.sandbox.paypal.com');
  assert.deepEqual(marketplacePayPalReadiness(env).blockers,[]);
  assert.equal(marketplacePayPalReadiness({...env,MARKETPLACE_PAYPAL_PARTNER_APPROVED:'false'}).enabled,false);
  assert.equal(marketplacePayPalReadiness({...env,MARKETPLACE_PAYPAL_MODE:'live'}).enabled,false);
});

test('PayPal partner auth assertion follows the required two-part JWT format',()=>{
  const token=buildMarketplacePayPalAuthAssertion('platform-client','merchant-123');
  const [header,payload,signature]=token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header,'base64').toString()),{alg:'none'});
  assert.deepEqual(JSON.parse(Buffer.from(payload,'base64').toString()),{iss:'platform-client',payer_id:'merchant-123'});
  assert.equal(signature,'');
  assert.throws(()=>buildMarketplacePayPalAuthAssertion('','merchant-123'));
});

test('seller referral requests business marketplace payment and refund capabilities',()=>{
  const payload=buildMarketplacePayPalReferralPayload({
    trackingId:'seller-123',
    returnUrl:'https://minglora-social-network.onrender.com/?marketplace=paypal-onboarding',
    email:'seller@example.test',
    shareDataConsent:true
  });
  assert.equal(payload.tracking_id,'seller-123');
  assert.deepEqual(payload.products,['EXPRESS_CHECKOUT']);
  assert.deepEqual(payload.operations[0].api_integration_preference.rest_api_integration.third_party_details.features,
    ['PAYMENT','REFUND']);
  assert.equal(payload.legal_consents[0].granted,true);
  assert.throws(()=>buildMarketplacePayPalReferralPayload({
    trackingId:'seller-123',
    returnUrl:'https://minglora-social-network.onrender.com/?marketplace=paypal-onboarding'
  }),/explicitly consent/);
  assert.throws(()=>buildMarketplacePayPalReferralPayload({
    trackingId:'seller-123',
    returnUrl:'https://minglora-social-network.onrender.com/?marketplace=paypal-onboarding',
    shareDataConsent:false
  }),/explicitly consent/);
  assert.throws(()=>buildMarketplacePayPalReferralPayload({
    trackingId:'seller-123',
    returnUrl:'http://insecure.test',
    shareDataConsent:true
  }),/HTTPS/);
});

test('only PayPal REST transaction currencies and supported two-decimal amounts are accepted',()=>{
  assert.equal(isMarketplacePayPalCurrencySupported('USD'),true);
  assert.equal(isMarketplacePayPalCurrencySupported('CAD'),true);
  assert.equal(isMarketplacePayPalCurrencySupported('JMD'),false);
  assert.equal(isMarketplacePayPalCurrencySupported('TTD'),false);
  assert.equal(isMarketplacePayPalCurrencySupported('JPY'),false);
  assert.equal(marketplaceMinorToPayPalValue(1250,'USD'),'12.50');
  assert.throws(()=>marketplaceMinorToPayPalValue(1250,'JMD'),/FX quote/);
  assert.throws(()=>marketplaceMinorToPayPalValue(1.5,'USD'),/positive integer/);
});

test('multi-seller checkout creates one PayPal purchase unit and platform fee per seller',()=>{
  const result=buildMarketplacePayPalOrderPayload({
    orderId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    currency:'USD',
    attributionId:'MINGLORA_BN',
    returnUrl:'https://minglora-social-network.onrender.com/?marketplace=order-return',
    cancelUrl:'https://minglora-social-network.onrender.com/?marketplace=order-cancel',
    sellerOrders:[sellerOrder1,sellerOrder2]
  });
  assert.equal(result.intent,'CAPTURE');
  assert.equal(result.purchase_units.length,2);
  assert.equal(result.purchase_units[0].reference_id,sellerOrder1.sellerOrderId);
  assert.equal(result.purchase_units[0].payee.merchant_id,sellerOrder1.merchantId);
  assert.equal(result.purchase_units[0].amount.value,'125.00');
  assert.equal(result.purchase_units[0].payment_instruction.disbursement_mode,'INSTANT');
  assert.equal(result.purchase_units[0].payment_instruction.platform_fees[0].amount.value,'12.50');
  assert.equal(result.purchase_units[1].amount.value,'75.00');
  assert.throws(()=>buildMarketplacePayPalOrderPayload({
    orderId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',currency:'JMD',attributionId:'MINGLORA_BN',returnUrl:'https://minglora-social-network.onrender.com/?marketplace=order-return',cancelUrl:'https://minglora-social-network.onrender.com/?marketplace=order-cancel',sellerOrders:[sellerOrder1]
  }),/does not currently support/);
  assert.throws(()=>buildMarketplacePayPalOrderPayload({
    orderId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',currency:'USD',attributionId:'MINGLORA_BN',returnUrl:'https://minglora-social-network.onrender.com/?marketplace=order-return',cancelUrl:'https://minglora-social-network.onrender.com/?marketplace=order-cancel',sellerOrders:[{...sellerOrder1,merchantId:''}]
  }),/merchant ID/);
  assert.throws(()=>buildMarketplacePayPalOrderPayload({
    orderId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',currency:'USD',attributionId:'MINGLORA_BN',returnUrl:'https://minglora-social-network.onrender.com/?marketplace=order-return',cancelUrl:'https://minglora-social-network.onrender.com/?marketplace=order-cancel',sellerOrders:[{...sellerOrder1,platformFeeMinor:12501}]
  }),/cannot exceed/);
  assert.throws(()=>buildMarketplacePayPalOrderPayload({
    orderId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',currency:'USD',attributionId:'MINGLORA_BN',
    returnUrl:'https://minglora-social-network.onrender.com/?marketplace=order-return',
    cancelUrl:'https://minglora-social-network.onrender.com/?marketplace=order-cancel',
    sellerOrders:Array.from({length:11},(_,index)=>({...sellerOrder1,sellerOrderId:(index+1).toString().padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}))
  }),/between 1 and 10/);
});

test('PayPal approval link must be an HTTPS approve or payer-action link',()=>{
  assert.equal(extractMarketplacePayPalApprovalUrl({links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER'}]}),
    'https://www.sandbox.paypal.com/checkoutnow?token=ORDER');
  assert.throws(()=>extractMarketplacePayPalApprovalUrl({links:[{rel:'approve',href:'javascript:alert(1)'}]}));
});

test('capture reconciliation verifies every seller reference, amount and completed capture',()=>{
  const parsed=parseMarketplacePayPalCapture({
    status:'COMPLETED',
    purchase_units:[
      {reference_id:sellerOrder1.sellerOrderId,payments:{captures:[{
        id:'CAPTURE-ONE',status:'COMPLETED',amount:{currency_code:'USD',value:'125.00'},
        seller_receivable_breakdown:{paypal_fee:{value:'4.00'},net_amount:{value:'108.50'}}
      }]}},
      {reference_id:sellerOrder2.sellerOrderId,payments:{captures:[{
        id:'CAPTURE-TWO',status:'COMPLETED',amount:{currency_code:'USD',value:'75.00'},
        seller_receivable_breakdown:{paypal_fee:{value:'2.50'},net_amount:{value:'65.25'}}
      }]}}
    ]
  },[
    {...sellerOrder1,currency:'USD'},
    {...sellerOrder2,currency:'USD'}
  ]);
  assert.equal(parsed.length,2);
  assert.equal(parsed[0].processorFeeMinor,400);
  assert.equal(parsed[0].sellerNetMinor,10850);
  assert.equal(parsed[1].providerCaptureId,'CAPTURE-TWO');
  assert.throws(()=>parseMarketplacePayPalCapture({
    status:'COMPLETED',
    purchase_units:[{reference_id:sellerOrder1.sellerOrderId,payments:{captures:[{
      id:'CAPTURE-ONE',status:'COMPLETED',amount:{currency_code:'USD',value:'124.00'}
    }]}}]
  },[sellerOrder1]),/amount did not match/);
  assert.throws(()=>parseMarketplacePayPalCapture({status:'PARTIALLY_COMPLETED',purchase_units:[]},[sellerOrder1]),/did not capture every seller order/);
});
