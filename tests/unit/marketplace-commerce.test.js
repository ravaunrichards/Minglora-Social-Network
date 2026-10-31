import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBalancedMarketplaceJournal, calculateMarketplaceCheckoutQuote, transitionMarketplaceBooking, validateMarketplaceSellerApplication, validateMarketplaceServiceBookingInput } from '../../backend/modules/marketplace/commerce.js';
const sellerApp = { sellerType:'business', storeName:'Kingston Tech Store', description:'Computers, accessories and repair services for local customers.', countryCode:'JM', contactEmail:'sales@example.test', termsVersion:'2026-01', acceptTerms:true };
const listings = [
 { id:'one', sellerId:'seller-1', kind:'product', status:'active', title:'Laptop', priceMinor:4500000, currency:'JMD', quantity:5, fulfillment:['pickup','shipping'], fulfillmentPricing:{shipping:{currency:'JMD',priceMinor:50000}} },
 { id:'service', sellerId:'seller-1', kind:'service', status:'active', title:'Computer repair', priceMinor:null, currency:'JMD', quantity:null, fulfillment:[] }
];
test('seller applications validate identity category, contact and terms acceptance',()=>{
 assert.equal(validateMarketplaceSellerApplication(sellerApp).valid,true);
 assert.equal(validateMarketplaceSellerApplication({...sellerApp,acceptTerms:false}).valid,false);
 assert.equal(validateMarketplaceSellerApplication({...sellerApp,countryCode:'JAM'}).valid,false);
});
test('checkout quote calculates server totals and flags sellers not approved for settlement',()=>{
 const result=calculateMarketplaceCheckoutQuote({buyerId:'buyer-1',items:[{listingId:'one',quantity:2}],listings,sellerProfiles:[{userId:'seller-1',status:'pending'}],commissionBps:500,fulfillmentByListing:{one:'pickup'}});
 assert.equal(result.valid,true);assert.equal(result.value.itemSubtotalMinor,9000000);
 assert.equal(result.value.marketplaceCommissionPreviewMinor,450000);assert.equal(result.value.totalMinorBeforeTax,9000000);
 assert.equal(result.value.checkoutReady,false);assert.ok(result.value.blockers.some(item=>item.includes('Tax')));
});
test('checkout rejects self-purchases, mixed currencies, overselling and unpriced delivery',()=>{
 const input={buyerId:'buyer-1',items:[{listingId:'one',quantity:1}],listings,commissionBps:0,fulfillmentByListing:{one:'pickup'}};
 assert.equal(calculateMarketplaceCheckoutQuote(input).valid,true);
 assert.equal(calculateMarketplaceCheckoutQuote({...input,fulfillmentByListing:{one:'local_delivery'}}).valid,false);
 assert.equal(calculateMarketplaceCheckoutQuote({...input,buyerId:'seller-1'}).valid,false);
 assert.equal(calculateMarketplaceCheckoutQuote({...input,items:[{listingId:'one',quantity:6}]}).valid,false);
 const foreign={...listings[0],id:'foreign',currency:'USD'};
 assert.equal(calculateMarketplaceCheckoutQuote({...input,items:[{listingId:'one',quantity:1},{listingId:'foreign',quantity:1}],listings:[...listings,foreign],fulfillmentByListing:{one:'pickup',foreign:'pickup'}}).valid,false);
});
test('booking schedule validates future time and duration increments',()=>{
 const now=new Date('2030-01-01T00:00:00Z');
 assert.equal(validateMarketplaceServiceBookingInput({listingId:'service',startAt:'2030-01-01T02:00:00Z',durationMinutes:60},now).valid,true);
 assert.equal(validateMarketplaceServiceBookingInput({listingId:'service',startAt:'2030-01-01T00:01:00Z',durationMinutes:60},now).valid,false);
 assert.equal(validateMarketplaceServiceBookingInput({listingId:'service',startAt:'2030-01-01T02:00:00Z',durationMinutes:17},now).valid,false);
});
test('booking transitions require the correct participant and confirmation',()=>{
 const booking={id:'b1',buyerId:'buyer-1',sellerId:'seller-1',status:'requested'};
 assert.equal(transitionMarketplaceBooking(booking,'buyer-1','accepted').valid,false);
 assert.equal(transitionMarketplaceBooking(booking,'seller-1','accepted').valid,true);
 assert.equal(transitionMarketplaceBooking({...booking,status:'completed_by_seller'},'buyer-1','completed').valid,true);
 assert.equal(transitionMarketplaceBooking(booking,'stranger','cancelled').valid,false);
});
test('ledger postings balance exactly to the last minor unit',()=>{
 const journal=buildBalancedMarketplaceJournal({currency:'JMD',grossMinor:10000,processorFeeMinor:300,commissionMinor:1000,sellerNetMinor:8700});
 assert.equal(journal.debitsMinor,10000);assert.equal(journal.creditsMinor,10000);
 assert.throws(()=>buildBalancedMarketplaceJournal({currency:'JMD',grossMinor:10000,processorFeeMinor:300,commissionMinor:1000,sellerNetMinor:8600}));
});
