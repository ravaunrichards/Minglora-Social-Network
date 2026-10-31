export const MARKETPLACE_PRODUCT_CATEGORIES=Object.freeze(['electronics','phones_computing','fashion','home_furniture','vehicles','property','beauty_health','sports_outdoors','toys_games','books_media','food_grocery','handmade_crafts','collectibles','other']);
export const MARKETPLACE_SERVICE_CATEGORIES=Object.freeze(['home_repair','technology','beauty_wellness','education_tutoring','transport','events','creative_design','professional','cleaning','other']);
export const MARKETPLACE_CURRENCIES=Object.freeze(['JMD','USD','CAD','GBP','EUR','TTD','BBD','GYD']);
export const MARKETPLACE_PRODUCT_CONDITIONS=Object.freeze(['new','like_new','good','fair','for_parts']);
const PRODUCT_FULFILMENT=new Set(['pickup','local_delivery','shipping']),SERVICE_MODES=new Set(['remote','onsite','both']);
const clean=(value,max)=>String(value??'').trim().slice(0,max);
function parseMinorUnits(value){const raw=String(value??'').trim();if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw))return null;const [whole,fraction='']=raw.split('.');const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(amount)&&amount>0?amount:null;}
export function validateMarketplaceListingInput(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,error:'Listing details must be an object.'};
 const kind=String(input.kind||'product');if(!['product','service'].includes(kind))return {valid:false,error:'Choose Products or Services.'};
 const title=clean(input.title,100),description=clean(input.description,5000),category=String(input.category||''),categories=kind==='product'?MARKETPLACE_PRODUCT_CATEGORIES:MARKETPLACE_SERVICE_CATEGORIES;
 if(title.length<5)return {valid:false,error:'Listing title must contain at least 5 characters.'};
 if(description.length<20)return {valid:false,error:'Description must contain at least 20 characters.'};
 if(!categories.includes(category))return {valid:false,error:'Choose a valid category for this listing type.'};
 const currency=String(input.currency||'JMD').toUpperCase();if(!MARKETPLACE_CURRENCIES.includes(currency))return {valid:false,error:'Choose a supported marketplace currency.'};
 const priceType=kind==='product'?'fixed':String(input.priceType||'fixed');if(!['fixed','from','hourly','quote'].includes(priceType))return {valid:false,error:'Choose a supported service pricing method.'};
 const priceMinor=priceType==='quote'?null:parseMinorUnits(input.price);if(priceType!=='quote'&&priceMinor===null)return {valid:false,error:'Enter a price greater than zero with no more than two decimal places.'};
 const location=clean(input.location,120),tags=[...new Set((Array.isArray(input.tags)?input.tags:String(input.tags||'').split(',')).map(value=>clean(value,24).toLowerCase()).filter(Boolean))].slice(0,8);
 let condition=null,quantity=null,fulfillment=[],serviceMode=null;
 if(kind==='product'){condition=String(input.condition||'');if(!MARKETPLACE_PRODUCT_CONDITIONS.includes(condition))return {valid:false,error:'Choose the product condition.'};quantity=Number(input.quantity??1);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)return {valid:false,error:'Product quantity must be between 1 and 10,000.'};fulfillment=[...new Set((Array.isArray(input.fulfillment)?input.fulfillment:[]).map(String))];if(!fulfillment.length||fulfillment.some(value=>!PRODUCT_FULFILMENT.has(value)))return {valid:false,error:'Choose at least one valid pickup, delivery or shipping option.'};}
 else{serviceMode=String(input.serviceMode||'onsite');if(!SERVICE_MODES.has(serviceMode))return {valid:false,error:'Choose whether the service is remote, on-site or both.'};}
 return {valid:true,value:{kind,title,description,category,currency,priceType,priceMinor,location,tags,condition,quantity,fulfillment,serviceMode}};
}
export function canManageMarketplaceListing(listing,userId){return Boolean(listing&&userId&&listing.sellerId===userId);}
export function isMarketplaceListingActive(listing){return Boolean(listing&&listing.status==='active'&&(!Number.isInteger(listing.quantity)||listing.quantity>0));}
