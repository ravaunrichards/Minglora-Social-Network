const CURRENCIES = new Set(['JMD','USD','CAD','GBP','EUR','TTD','BBD','GYD']);
const BOOKING_TRANSITIONS = Object.freeze({
  requested: new Set(['accepted','declined','cancelled']),
  accepted: new Set(['cancelled','completed_by_seller']),
  completed_by_seller: new Set(['completed','disputed']),
  declined: new Set(), cancelled: new Set(), completed: new Set(), disputed: new Set()
});
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const validEmail = value => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
const safeMinor = value => Number.isSafeInteger(value) && value >= 0;

export function validateMarketplaceSellerApplication(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, error: 'Seller application details must be an object.' };
  const sellerType = String(input.sellerType || '');
  const storeName = clean(input.storeName, 100);
  const description = clean(input.description, 1000);
  const countryCode = String(input.countryCode || '').trim().toUpperCase();
  const contactEmail = clean(input.contactEmail, 254).toLowerCase();
  const termsVersion = clean(input.termsVersion, 40);
  if (!['individual','business'].includes(sellerType)) return { valid: false, error: 'Choose individual or business seller.' };
  if (storeName.length < 2) return { valid: false, error: 'Store or seller name must contain at least 2 characters.' };
  if (description.length < 20) return { valid: false, error: 'Describe what you sell in at least 20 characters.' };
  if (!/^[A-Z]{2}$/.test(countryCode)) return { valid: false, error: 'Enter a valid two-letter country code.' };
  if (!validEmail(contactEmail)) return { valid: false, error: 'Enter a valid seller contact email.' };
  if (!termsVersion || input.acceptTerms !== true) return { valid: false, error: 'Accept the current seller terms before applying.' };
  return { valid: true, value: { sellerType, storeName, description, countryCode, contactEmail, termsVersion } };
}

export function calculateMarketplaceCheckoutQuote({
  buyerId, items, listings = [], sellerProfiles = [], commissionBps = 0,
  fulfillmentByListing = {}, quoteId = null, createdAt = new Date().toISOString(), expiresAt = null
} = {}) {
  if (!buyerId) return { valid: false, error: 'Sign in before preparing a checkout quote.' };
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return { valid: false, error: 'A checkout must contain between 1 and 20 distinct listings.' };
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 3000) return { valid: false, error: 'Marketplace commission configuration is invalid.' };
  const seen = new Set(), lines = [];
  let currency = null;
  for (const item of items) {
    const listingId = clean(item?.listingId, 80), quantity = Number(item?.quantity);
    if (!listingId || seen.has(listingId)) return { valid: false, error: 'Each listing may appear only once in a checkout.' };
    seen.add(listingId);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) return { valid: false, error: 'Each quantity must be a whole number from 1 to 100.' };
    const listing = listings.find(candidate => candidate.id === listingId);
    if (!listing || listing.status !== 'active' || listing.kind !== 'product') return { valid: false, error: 'One or more products are no longer available.' };
    if (listing.sellerId === buyerId) return { valid: false, error: 'You cannot purchase your own listing.' };
    if (!Number.isSafeInteger(listing.priceMinor) || listing.priceMinor <= 0 || !CURRENCIES.has(String(listing.currency || '').toUpperCase())) return { valid: false, error: 'A listing has an invalid price or currency.' };
    if (!Number.isSafeInteger(listing.quantity) || quantity > listing.quantity) return { valid: false, error: 'Requested quantity exceeds available stock for ' + listing.title + '.' };
    currency = currency || listing.currency;
    if (currency !== listing.currency) return { valid: false, error: 'A checkout can contain only one currency. Split items with different currencies into separate checkouts.' };
    const fulfillment = String(fulfillmentByListing[listingId] || '');
    if (!Array.isArray(listing.fulfillment) || !listing.fulfillment.includes(fulfillment)) return { valid: false, error: 'Choose a fulfilment option offered by each seller.' };
    let fulfillmentMinor = 0;
    if (fulfillment !== 'pickup') {
      const serverRate = listing.fulfillmentPricing?.[fulfillment];
      if (!serverRate || serverRate.currency !== currency || !safeMinor(serverRate.priceMinor)) return { valid: false, error: 'A seller-confirmed delivery or shipping rate is required before this item can be quoted.' };
      fulfillmentMinor = serverRate.priceMinor;
    }
    const lineSubtotalMinor = listing.priceMinor * quantity;
    if (!Number.isSafeInteger(lineSubtotalMinor)) return { valid: false, error: 'The checkout amount exceeds the supported limit.' };
    lines.push({ listingId, sellerId: listing.sellerId, title: clean(listing.title, 180), quantity, unitPriceMinor: listing.priceMinor, lineSubtotalMinor, fulfillment, fulfillmentMinor });
  }
  const itemSubtotalMinor = lines.reduce((sum, line) => sum + line.lineSubtotalMinor, 0);
  const fulfillmentMinor = lines.reduce((sum, line) => sum + line.fulfillmentMinor, 0);
  const commissionMinor = Math.round(itemSubtotalMinor * commissionBps / 10000);
  if (![itemSubtotalMinor, fulfillmentMinor, commissionMinor].every(Number.isSafeInteger)) return { valid: false, error: 'The checkout total exceeds the supported limit.' };
  const sellers = [...new Set(lines.map(line => line.sellerId))];
  const blockedSellers = sellers.filter(id => sellerProfiles.find(profile => profile.userId === id)?.status !== 'approved');
  const blockers = [
    ...(blockedSellers.length ? ['One or more sellers have not completed marketplace approval.'] : []),
    'Tax and customs calculations are not configured for this checkout.',
    'Live marketplace payment and seller settlement are not enabled.'
  ];
  const grandTotalMinor = itemSubtotalMinor + fulfillmentMinor;
  if (!Number.isSafeInteger(grandTotalMinor)) return { valid: false, error: 'The checkout total exceeds the supported limit.' };
  return { valid: true, value: {
    id: quoteId, buyerId, currency, lines, sellerIds: sellers, itemSubtotalMinor, fulfillmentMinor,
    marketplaceCommissionPreviewMinor: commissionMinor, taxMinor: null,
    totalMinorBeforeTax: grandTotalMinor, checkoutReady: blockers.length === 0, blockers, createdAt, expiresAt
  }};
}

export function validateMarketplaceServiceBookingInput(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, error: 'Booking details must be an object.' };
  const listingId = clean(input.listingId, 80), startAt = new Date(input.startAt);
  const durationMinutes = Number(input.durationMinutes), message = clean(input.message, 1500);
  if (!listingId) return { valid: false, error: 'Choose the service you want to book.' };
  if (!Number.isFinite(startAt.getTime()) || startAt.getTime() < now.getTime() + 15 * 60 * 1000) return { valid: false, error: 'Choose a booking time at least 15 minutes in the future.' };
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || durationMinutes % 15 !== 0) return { valid: false, error: 'Duration must be in 15-minute increments from 15 minutes to 8 hours.' };
  if (message.length > 1500) return { valid: false, error: 'Booking notes cannot exceed 1,500 characters.' };
  return { valid: true, value: { listingId, startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + durationMinutes * 60000).toISOString(), durationMinutes, message } };
}

export function transitionMarketplaceBooking(booking, actorId, nextStatus) {
  if (!booking || !actorId) return { valid: false, error: 'Booking or actor is missing.' };
  const isBuyer = booking.buyerId === actorId, isSeller = booking.sellerId === actorId;
  if (!isBuyer && !isSeller) return { valid: false, error: 'You are not a participant in this booking.' };
  if (!BOOKING_TRANSITIONS[booking.status]?.has(nextStatus)) return { valid: false, error: 'This booking cannot move from ' + booking.status + ' to ' + nextStatus + '.' };
  if (['accepted','declined','completed_by_seller'].includes(nextStatus) && !isSeller) return { valid: false, error: 'Only the service provider can perform this action.' };
  if (['cancelled','completed','disputed'].includes(nextStatus) && !isBuyer) return { valid: false, error: 'Only the customer can perform this action.' };
  return { valid: true, value: { ...booking, status: nextStatus, updatedAt: new Date().toISOString() } };
}

export function buildBalancedMarketplaceJournal({ currency, grossMinor, processorFeeMinor, commissionMinor, sellerNetMinor } = {}) {
  if (!CURRENCIES.has(String(currency || '').toUpperCase())) throw new Error('Unsupported ledger currency.');
  for (const value of [grossMinor, processorFeeMinor, commissionMinor, sellerNetMinor]) if (!Number.isSafeInteger(value) || value < 0) throw new Error('Ledger amounts must be non-negative integer minor units.');
  if (grossMinor <= 0 || grossMinor !== processorFeeMinor + commissionMinor + sellerNetMinor) throw new Error('Gross payment must equal processor fee, marketplace commission and seller net.');
  const entries = [
    ...(grossMinor - processorFeeMinor > 0 ? [{ account: 'processor_clearing', direction: 'debit', amountMinor: grossMinor - processorFeeMinor }] : []),
    ...(processorFeeMinor > 0 ? [{ account: 'payment_processing_expense', direction: 'debit', amountMinor: processorFeeMinor }] : []),
    ...(sellerNetMinor > 0 ? [{ account: 'seller_payable', direction: 'credit', amountMinor: sellerNetMinor }] : []),
    ...(commissionMinor > 0 ? [{ account: 'marketplace_commission_revenue', direction: 'credit', amountMinor: commissionMinor }] : [])
  ];
  const debits = entries.filter(entry => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amountMinor, 0);
  const credits = entries.filter(entry => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amountMinor, 0);
  if (debits !== credits) throw new Error('Marketplace journal is not balanced.');
  return { currency, entries, debitsMinor: debits, creditsMinor: credits };
}
