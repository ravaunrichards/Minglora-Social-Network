BEGIN;

ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES public.marketplace_checkout_quotes(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_order_source_quote_once
  ON public.marketplace_orders(source_quote_id) WHERE source_quote_id IS NOT NULL;

-- Relational Marketplace listing writes, including photo association changes,
-- are atomic. The caller still must perform the user/session and seller checks.
CREATE OR REPLACE FUNCTION public.sync_marketplace_listing(
  p_seller_id uuid,
  p_listing jsonb,
  p_media_ids uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $listing_sync$
DECLARE
  v_id uuid;
  v_existing public.marketplace_listings%ROWTYPE;
  v_row public.marketplace_listings%ROWTYPE;
  v_seller public.marketplace_seller_profiles%ROWTYPE;
  v_kind text;
  v_price_type text;
  v_status text;
  v_price_minor bigint;
  v_quantity integer;
  v_currency char(3);
  v_fulfillment text[];
  v_media_ids uuid[]:=coalesce(p_media_ids,ARRAY[]::uuid[]);
  v_media_count integer;
BEGIN
  IF p_seller_id IS NULL OR jsonb_typeof(p_listing)<>'object' THEN
    RAISE EXCEPTION 'Invalid seller or listing payload';
  END IF;
  v_id:=nullif(p_listing->>'id','')::uuid;
  IF v_id IS NULL OR nullif(p_listing->>'sellerId','')::uuid<>p_seller_id THEN
    RAISE EXCEPTION 'Listing ID or seller ownership is invalid';
  END IF;
  SELECT * INTO v_seller FROM public.marketplace_seller_profiles
    WHERE user_id=p_seller_id FOR SHARE;
  IF NOT FOUND OR v_seller.status<>'approved' OR v_seller.identity_status<>'verified' THEN
    RAISE EXCEPTION 'A verified and approved seller account is required to publish listings';
  END IF;
  SELECT * INTO v_existing FROM public.marketplace_listings WHERE id=v_id FOR UPDATE;
  IF FOUND AND v_existing.seller_id<>p_seller_id THEN RAISE EXCEPTION 'Listing ownership conflict'; END IF;

  v_kind:=coalesce(p_listing->>'kind','product');
  v_price_type:=coalesce(p_listing->>'priceType','fixed');
  v_status:=coalesce(p_listing->>'status','active');
  v_price_minor:=nullif(p_listing->>'priceMinor','')::bigint;
  v_quantity:=CASE WHEN v_kind='product' THEN coalesce((p_listing->>'quantity')::integer,0) ELSE 1 END;
  v_currency:=upper(coalesce(p_listing->>'currency','JMD'))::char(3);

  IF v_kind NOT IN ('product','service') OR v_price_type NOT IN ('fixed','from','hourly','quote')
     OR v_status NOT IN ('active','paused','sold','removed','archived','draft')
     OR v_currency::text NOT IN ('JMD','USD','CAD','GBP','EUR','TTD','BBD','GYD') THEN
    RAISE EXCEPTION 'Marketplace listing configuration is invalid';
  END IF;
  IF v_kind='product' AND (v_price_minor IS NULL OR v_price_minor<=0 OR v_quantity<0 OR v_quantity>1000000) THEN
    RAISE EXCEPTION 'Product price or stock is invalid';
  END IF;
  IF v_kind='service' AND ((v_price_type='quote' AND v_price_minor IS NOT NULL) OR
     (v_price_type<>'quote' AND (v_price_minor IS NULL OR v_price_minor<=0))) THEN
    RAISE EXCEPTION 'Service pricing details are invalid';
  END IF;
  IF jsonb_typeof(coalesce(p_listing->'fulfillment','[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'Fulfilment options are invalid';
  END IF;
  SELECT coalesce(array_agg(value),'{}'::text[]) INTO v_fulfillment
  FROM jsonb_array_elements_text(coalesce(p_listing->'fulfillment','[]'::jsonb));
  IF EXISTS(SELECT 1 FROM unnest(v_fulfillment) f WHERE f NOT IN ('pickup','local_delivery','shipping')) THEN
    RAISE EXCEPTION 'A fulfilment option is not supported';
  END IF;
  IF v_kind='product' AND cardinality(v_fulfillment)=0 THEN
    RAISE EXCEPTION 'Choose at least one fulfilment option';
  END IF;
  IF length(trim(coalesce(p_listing->>'title','')))<5 THEN RAISE EXCEPTION 'Listing title is too short'; END IF;

  SELECT count(*) INTO v_media_count FROM unnest(v_media_ids);
  IF v_media_count>8 OR v_media_count<>(SELECT count(DISTINCT x) FROM unnest(v_media_ids) x) THEN
    RAISE EXCEPTION 'A listing may contain up to eight unique photos';
  END IF;
  IF v_media_count>0 AND EXISTS(
    SELECT 1 FROM unnest(v_media_ids) requested(id)
    LEFT JOIN public.media_assets asset ON asset.id=requested.id
    WHERE asset.id IS NULL OR asset.owner_id<>p_seller_id OR asset.slot<>'marketplace'
      OR asset.media_type<>'image' OR asset.processing_status<>'ready'
      OR asset.storage_bucket IS NULL OR asset.storage_key IS NULL
      OR NOT (
        asset.asset_status='uploaded' OR
        (asset.asset_status='attached' AND asset.attached_to='marketplace:'||v_id::text)
      )
  ) THEN
    RAISE EXCEPTION 'One or more listing photos are not completed Marketplace images owned by this seller';
  END IF;

  INSERT INTO public.marketplace_listings(
    id,seller_id,title,description,price_minor,currency,category,condition,location_label,
    status,kind,price_type,quantity,fulfillment_options,service_mode,tags,updated_at
  ) VALUES (
    v_id,p_seller_id,left(trim(p_listing->>'title'),180),left(coalesce(p_listing->>'description',''),5000),
    v_price_minor,v_currency,coalesce(nullif(p_listing->>'category',''),'other'),
    coalesce(nullif(p_listing->>'condition',''),'unspecified'),left(coalesce(p_listing->>'location',''),160),
    CASE WHEN v_status='paused' THEN 'archived' ELSE v_status END,v_kind,v_price_type,v_quantity,
    v_fulfillment,nullif(p_listing->>'serviceMode',''),
    ARRAY(SELECT left(value,24) FROM jsonb_array_elements_text(coalesce(p_listing->'tags','[]'::jsonb)) LIMIT 8),
    now()
  )
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,description=excluded.description,price_minor=excluded.price_minor,
    currency=excluded.currency,category=excluded.category,condition=excluded.condition,
    location_label=excluded.location_label,status=excluded.status,kind=excluded.kind,
    price_type=excluded.price_type,quantity=excluded.quantity,fulfillment_options=excluded.fulfillment_options,
    service_mode=excluded.service_mode,tags=excluded.tags,updated_at=now()
  RETURNING * INTO v_row;

  UPDATE public.media_assets SET asset_status='uploaded',attached_to=NULL
  WHERE attached_to='marketplace:'||v_id::text
    AND NOT(id=ANY(v_media_ids));
  DELETE FROM public.listing_media WHERE listing_id=v_id;
  IF v_media_count>0 THEN
    INSERT INTO public.listing_media(listing_id,asset_id,sort_order)
    SELECT v_id,x.id,(x.ordinality-1)::integer
    FROM unnest(v_media_ids) WITH ORDINALITY x(id,ordinality);
    UPDATE public.media_assets SET asset_status='attached',attached_to='marketplace:'||v_id::text
    WHERE id=ANY(v_media_ids) AND owner_id=p_seller_id;
  END IF;
  RETURN jsonb_build_object(
    'id',v_row.id,'sellerId',v_row.seller_id,'title',v_row.title,'description',v_row.description,
    'priceMinor',v_row.price_minor,'currency',v_row.currency,'category',v_row.category,
    'condition',v_row.condition,'location',v_row.location_label,
    'status',CASE WHEN v_row.status='archived' THEN 'paused' ELSE v_row.status END,
    'kind',v_row.kind,'priceType',v_row.price_type,'quantity',v_row.quantity,
    'fulfillment',to_jsonb(v_row.fulfillment_options),'serviceMode',v_row.service_mode,
    'tags',to_jsonb(v_row.tags),'mediaIds',to_jsonb(v_media_ids),
    'createdAt',v_row.created_at,'updatedAt',v_row.updated_at
  );
END $listing_sync$;
REVOKE ALL ON FUNCTION public.sync_marketplace_listing(uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_marketplace_listing(uuid,jsonb,uuid[]) TO service_role;

-- Quotes without a calculated tax amount are never orderable. Enabling a
-- boolean switch alone cannot bypass the missing tax engine integration.
CREATE OR REPLACE FUNCTION public.create_marketplace_checkout_quote(
  p_buyer_id uuid,
  p_items jsonb,
  p_fulfillment_by_listing jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $quote$
DECLARE
  v_config public.marketplace_payment_configuration%ROWTYPE;
  v_listing public.marketplace_listings%ROWTYPE;
  v_seller public.marketplace_seller_profiles%ROWTYPE;
  v_item jsonb;
  v_lines jsonb:='[]'::jsonb;
  v_seller_ids uuid[]:=ARRAY[]::uuid[];
  v_blockers text[]:=ARRAY[]::text[];
  v_seen_ids uuid[]:=ARRAY[]::uuid[];
  v_listing_id uuid;
  v_quantity integer;
  v_fulfillment text;
  v_currency char(3);
  v_rate_minor bigint;
  v_line_minor bigint;
  v_subtotal bigint:=0;
  v_fulfillment_total bigint:=0;
  v_commission bigint:=0;
  v_total bigint:=0;
  v_quote_id uuid:=gen_random_uuid();
  v_created_at timestamptz:=now();
  v_expires_at timestamptz:=now()+interval '10 minutes';
  v_seller_id uuid;
BEGIN
  IF p_buyer_id IS NULL THEN RAISE EXCEPTION 'Buyer is required'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>20 THEN
    RAISE EXCEPTION 'A checkout quote must contain between 1 and 20 items';
  END IF;
  IF p_fulfillment_by_listing IS NULL OR jsonb_typeof(p_fulfillment_by_listing)<>'object' THEN
    RAISE EXCEPTION 'Choose a fulfilment option for every product';
  END IF;
  SELECT * INTO v_config FROM public.marketplace_payment_configuration WHERE singleton=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace payment configuration is unavailable'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_listing_id:=nullif(v_item->>'listingId','')::uuid;
    v_quantity:=coalesce((v_item->>'quantity')::integer,0);
    IF v_listing_id IS NULL OR v_quantity<1 OR v_quantity>100 THEN
      RAISE EXCEPTION 'Each product needs a valid listing and quantity from 1 to 100';
    END IF;
    IF v_listing_id=ANY(v_seen_ids) THEN RAISE EXCEPTION 'Each listing may appear only once in a checkout'; END IF;
    v_seen_ids:=array_append(v_seen_ids,v_listing_id);
    SELECT * INTO v_listing FROM public.marketplace_listings WHERE id=v_listing_id;
    IF NOT FOUND OR v_listing.status<>'active' OR v_listing.kind<>'product' THEN
      RAISE EXCEPTION 'One or more products are no longer available';
    END IF;
    IF v_listing.seller_id=p_buyer_id THEN RAISE EXCEPTION 'You cannot purchase your own listing'; END IF;
    IF v_listing.price_minor IS NULL OR v_listing.price_minor<=0 OR v_listing.currency IS NULL THEN
      RAISE EXCEPTION 'A product has an invalid price or currency';
    END IF;
    IF v_listing.quantity-v_listing.reserved_quantity<v_quantity THEN
      RAISE EXCEPTION 'Requested quantity exceeds available stock for %',v_listing.title;
    END IF;
    IF v_currency IS NULL THEN v_currency:=v_listing.currency;
    ELSIF v_currency<>v_listing.currency THEN
      RAISE EXCEPTION 'Split products with different currencies into separate checkouts';
    END IF;
    v_fulfillment:=coalesce(p_fulfillment_by_listing->>v_listing_id::text,'');
    IF NOT (v_listing.fulfillment_options @> ARRAY[v_fulfillment]::text[]) THEN
      RAISE EXCEPTION 'Choose a fulfilment option offered by each seller';
    END IF;
    v_rate_minor:=0;
    IF v_fulfillment<>'pickup' THEN
      SELECT r.price_minor INTO v_rate_minor
      FROM public.marketplace_fulfillment_rates r
      WHERE r.listing_id=v_listing.id AND r.seller_id=v_listing.seller_id
        AND r.method=v_fulfillment AND r.currency=v_currency AND r.active=true
        AND r.country_code IS NULL AND r.region_label=''
        AND r.postal_prefix=''
      ORDER BY r.updated_at DESC LIMIT 1;
      IF v_rate_minor IS NULL THEN
        RAISE EXCEPTION 'A seller-confirmed delivery or shipping rate is required before this item can be quoted';
      END IF;
    END IF;
    v_line_minor:=v_listing.price_minor::bigint*v_quantity::bigint;
    IF v_line_minor>1000000000000 OR v_subtotal+v_line_minor>1000000000000 THEN
      RAISE EXCEPTION 'The checkout amount exceeds the supported limit';
    END IF;
    v_subtotal:=v_subtotal+v_line_minor;
    v_fulfillment_total:=v_fulfillment_total+v_rate_minor;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'listingId',v_listing.id,'sellerId',v_listing.seller_id,'title',left(v_listing.title,180),
      'quantity',v_quantity,'unitPriceMinor',v_listing.price_minor,'lineSubtotalMinor',v_line_minor,
      'fulfillment',v_fulfillment,'fulfillmentMinor',v_rate_minor
    ));
    IF NOT (v_listing.seller_id=ANY(v_seller_ids)) THEN v_seller_ids:=array_append(v_seller_ids,v_listing.seller_id); END IF;
  END LOOP;

  FOREACH v_seller_id IN ARRAY v_seller_ids
  LOOP
    SELECT * INTO v_seller FROM public.marketplace_seller_profiles WHERE user_id=v_seller_id;
    IF NOT FOUND OR v_seller.status<>'approved' OR v_seller.identity_status<>'verified' THEN
      v_blockers:=array_append(v_blockers,'One or more sellers have not completed marketplace identity or business verification.');
    ELSIF v_seller.payout_status<>'verified' THEN
      v_blockers:=array_append(v_blockers,'One or more sellers have not completed payout onboarding.');
    END IF;
  END LOOP;
  v_commission:=round(v_subtotal*v_config.commission_bps/10000.0)::bigint;
  v_total:=v_subtotal+v_fulfillment_total;
  -- Tax is deliberately blocked until an actual tax/duty calculation result is
  -- supplied and persisted; the boolean config flag cannot make NULL tax ready.
  v_blockers:=array_append(v_blockers,'Tax and customs calculations are not configured for this checkout.');
  IF v_config.marketplace_approval_status<>'approved' OR NOT v_config.checkout_enabled THEN
    v_blockers:=array_append(v_blockers,'Live marketplace payment processing is not enabled for this platform.');
  END IF;
  IF NOT v_config.payouts_enabled THEN
    v_blockers:=array_append(v_blockers,'Marketplace seller payouts are not enabled.');
  END IF;
  IF v_config.provider IS NULL THEN
    v_blockers:=array_append(v_blockers,'A marketplace payment provider has not been approved.');
  END IF;

  INSERT INTO public.marketplace_checkout_quotes(
    id,buyer_id,currency,lines,seller_ids,item_subtotal_minor,fulfillment_minor,
    commission_preview_minor,tax_minor,total_minor_before_tax,blockers,checkout_ready,
    status,expires_at,created_at,updated_at
  ) VALUES (
    v_quote_id,p_buyer_id,v_currency,v_lines,v_seller_ids,v_subtotal,v_fulfillment_total,
    v_commission,NULL,v_total,to_jsonb(v_blockers),false,
    'informational',v_expires_at,v_created_at,v_created_at
  );

  RETURN jsonb_build_object(
    'id',v_quote_id,'buyerId',p_buyer_id,'currency',v_currency,'lines',v_lines,
    'sellerIds',to_jsonb(v_seller_ids),'itemSubtotalMinor',v_subtotal,
    'fulfillmentMinor',v_fulfillment_total,'marketplaceCommissionPreviewMinor',v_commission,
    'taxMinor',NULL,'totalMinorBeforeTax',v_total,
    'checkoutReady',false,'blockers',to_jsonb(v_blockers),
    'createdAt',v_created_at,'expiresAt',v_expires_at,'status','informational'
  );
END $quote$;
REVOKE ALL ON FUNCTION public.create_marketplace_checkout_quote(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_checkout_quote(uuid,jsonb,jsonb) TO service_role;

-- Convert an informational quote into a seller-split order only after every
-- provider, seller-payout and tax gate is explicitly enabled.
CREATE OR REPLACE FUNCTION public.create_marketplace_order_from_quote(
  p_buyer_id uuid,
  p_quote_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $order$
DECLARE
  v_config public.marketplace_payment_configuration%ROWTYPE;
  v_quote public.marketplace_checkout_quotes%ROWTYPE;
  v_order public.marketplace_orders%ROWTYPE;
  v_line jsonb;
  v_listing public.marketplace_listings%ROWTYPE;
  v_seller_id uuid;
  v_seller_order_id uuid;
  v_quantity integer;
  v_line_subtotal bigint;
  v_line_fulfillment bigint;
  v_seller_subtotal bigint;
  v_seller_fulfillment bigint;
  v_seller_gross bigint;
  v_commission bigint;
  v_seller_net bigint;
  v_currency char(3);
  v_expires timestamptz;
  v_existing public.marketplace_orders%ROWTYPE;
BEGIN
  IF p_buyer_id IS NULL OR p_quote_id IS NULL OR length(coalesce(p_idempotency_key,''))<8
     OR length(p_idempotency_key)>128 THEN RAISE EXCEPTION 'Invalid order request'; END IF;

  SELECT * INTO v_existing FROM public.marketplace_orders
    WHERE buyer_id=p_buyer_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.source_quote_id<>p_quote_id THEN RAISE EXCEPTION 'Idempotency key was already used for a different quote'; END IF;
    RETURN jsonb_build_object('id',v_existing.id,'buyerId',v_existing.buyer_id,
      'status',v_existing.status,'paymentStatus',v_existing.payment_status,
      'currency',v_existing.currency,'totalMinor',v_existing.total_minor,'createdAt',v_existing.created_at);
  END IF;

  SELECT * INTO v_config FROM public.marketplace_payment_configuration WHERE singleton=true;
  IF NOT FOUND OR v_config.marketplace_approval_status<>'approved' OR NOT v_config.checkout_enabled
     OR NOT v_config.payouts_enabled THEN
    RAISE EXCEPTION 'Marketplace provider approval, checkout and seller payouts must all be enabled before orders can be placed';
  END IF;
  SELECT * INTO v_quote FROM public.marketplace_checkout_quotes
    WHERE id=p_quote_id AND buyer_id=p_buyer_id FOR UPDATE;
  IF NOT FOUND OR v_quote.status<>'informational' OR v_quote.expires_at<=now() THEN
    RAISE EXCEPTION 'Checkout quote is missing, expired or already used';
  END IF;
  IF NOT v_quote.checkout_ready OR v_quote.tax_minor IS NULL THEN
    RAISE EXCEPTION 'Checkout quote is not ready. A verified tax and customs calculation is required before an order can be placed';
  END IF;
  IF v_quote.blockers<>'[]'::jsonb THEN RAISE EXCEPTION 'Checkout quote contains unresolved blockers'; END IF;

  v_currency:=v_quote.currency;
  v_expires:=now()+interval '15 minutes';
  INSERT INTO public.marketplace_orders(
    buyer_id,source_quote_id,currency,status,payment_status,item_subtotal_minor,
    fulfillment_minor,tax_minor,total_minor,idempotency_key
  ) VALUES (
    p_buyer_id,p_quote_id,v_currency,'awaiting_payment','pending',
    v_quote.item_subtotal_minor,v_quote.fulfillment_minor,v_quote.tax_minor,
    v_quote.total_minor_before_tax+v_quote.tax_minor,p_idempotency_key
  ) RETURNING * INTO v_order;

  -- Lock and reserve inventory in deterministic listing-ID order. The listing
  -- price, owner, availability and delivery rate are rechecked at order time.
  FOR v_line IN
    SELECT value FROM jsonb_array_elements(v_quote.lines) ORDER BY (value->>'listingId')
  LOOP
    SELECT * INTO v_listing FROM public.marketplace_listings
      WHERE id=(v_line->>'listingId')::uuid FOR UPDATE;
    IF NOT FOUND OR v_listing.status<>'active' OR v_listing.kind<>'product'
       OR v_listing.seller_id<>(v_line->>'sellerId')::uuid
       OR v_listing.price_minor<>(v_line->>'unitPriceMinor')::bigint
       OR v_listing.currency<>v_currency THEN
      RAISE EXCEPTION 'A product changed after the quote was prepared. Request a new quote';
    END IF;
    v_quantity:=(v_line->>'quantity')::integer;
    IF v_listing.quantity-v_listing.reserved_quantity<v_quantity THEN
      RAISE EXCEPTION 'A product no longer has enough available stock';
    END IF;
    IF v_line->>'fulfillment'<>'pickup' THEN
      IF NOT EXISTS(
        SELECT 1 FROM public.marketplace_fulfillment_rates r
        WHERE r.listing_id=v_listing.id AND r.seller_id=v_listing.seller_id
          AND r.method=v_line->>'fulfillment' AND r.currency=v_currency
          AND r.price_minor=(v_line->>'fulfillmentMinor')::bigint AND r.active=true
      ) THEN RAISE EXCEPTION 'Fulfilment pricing changed after the quote. Request a new quote'; END IF;
    END IF;
    UPDATE public.marketplace_listings SET reserved_quantity=reserved_quantity+v_quantity,updated_at=now()
      WHERE id=v_listing.id;
    INSERT INTO public.marketplace_inventory_reservations(order_id,listing_id,quantity,status,expires_at)
      VALUES(v_order.id,v_listing.id,v_quantity,'reserved',v_expires);
  END LOOP;

  FOR v_seller_id IN
    SELECT DISTINCT (value->>'sellerId')::uuid
    FROM jsonb_array_elements(v_quote.lines)
    ORDER BY 1
  LOOP
    SELECT coalesce(sum((value->>'lineSubtotalMinor')::bigint),0),
           coalesce(sum((value->>'fulfillmentMinor')::bigint),0)
      INTO v_seller_subtotal,v_seller_fulfillment
      FROM jsonb_array_elements(v_quote.lines)
      WHERE (value->>'sellerId')::uuid=v_seller_id;
    v_seller_gross:=v_seller_subtotal+v_seller_fulfillment;
    v_commission:=round(v_seller_subtotal*v_config.commission_bps/10000.0)::bigint;
    v_seller_net:=v_seller_gross-v_commission;
    IF v_seller_net<=0 THEN RAISE EXCEPTION 'Seller net proceeds are invalid'; END IF;
    INSERT INTO public.marketplace_seller_orders(
      order_id,seller_id,status,gross_minor,commission_minor,processor_fee_minor,seller_net_minor,payout_status
    ) VALUES(v_order.id,v_seller_id,'awaiting_seller',v_seller_gross,v_commission,0,v_seller_net,'not_eligible')
    RETURNING id INTO v_seller_order_id;

    FOR v_line IN SELECT value FROM jsonb_array_elements(v_quote.lines)
      WHERE (value->>'sellerId')::uuid=v_seller_id
    LOOP
      INSERT INTO public.marketplace_order_items(
        seller_order_id,listing_id,seller_id,title_snapshot,quantity,
        unit_price_minor,line_total_minor,listing_snapshot
      ) VALUES (
        v_seller_order_id,(v_line->>'listingId')::uuid,v_seller_id,
        left(v_line->>'title',180),(v_line->>'quantity')::integer,
        (v_line->>'unitPriceMinor')::bigint,(v_line->>'lineSubtotalMinor')::bigint,v_line
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.marketplace_order_events(order_id,actor_id,event_type,to_status,note,metadata)
  VALUES(v_order.id,p_buyer_id,'order_created','awaiting_payment',
    'Order created from a validated checkout quote. Payment is not yet confirmed.',
    jsonb_build_object('quoteId',p_quote_id,'inventoryReservationExpiresAt',v_expires));
  UPDATE public.marketplace_checkout_quotes SET status='converted',updated_at=now() WHERE id=p_quote_id;
  RETURN jsonb_build_object(
    'id',v_order.id,'buyerId',v_order.buyer_id,'status',v_order.status,
    'paymentStatus',v_order.payment_status,'currency',v_order.currency,
    'itemSubtotalMinor',v_order.item_subtotal_minor,'fulfillmentMinor',v_order.fulfillment_minor,
    'taxMinor',v_order.tax_minor,'totalMinor',v_order.total_minor,
    'inventoryReservationExpiresAt',v_expires,'createdAt',v_order.created_at
  );
END $order$;
REVOKE ALL ON FUNCTION public.create_marketplace_order_from_quote(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_from_quote(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_marketplace_order_inventory(
  p_order_id uuid,
  p_reason text DEFAULT 'reservation_released'
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $release$
DECLARE
  v_reservation public.marketplace_inventory_reservations%ROWTYPE;
  v_count integer:=0;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Order ID is required'; END IF;
  PERFORM 1 FROM public.marketplace_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  FOR v_reservation IN
    SELECT * FROM public.marketplace_inventory_reservations
    WHERE order_id=p_order_id AND status='reserved'
    ORDER BY listing_id FOR UPDATE
  LOOP
    UPDATE public.marketplace_listings
      SET reserved_quantity=greatest(0,reserved_quantity-v_reservation.quantity),updated_at=now()
      WHERE id=v_reservation.listing_id;
    UPDATE public.marketplace_inventory_reservations
      SET status='released',updated_at=now() WHERE id=v_reservation.id;
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.marketplace_orders SET status='cancelled',payment_status='failed',updated_at=now()
    WHERE id=p_order_id AND status='awaiting_payment' AND payment_status IN ('not_started','pending','failed');
  INSERT INTO public.marketplace_order_events(order_id,event_type,from_status,to_status,note)
  SELECT p_order_id,p_reason,'awaiting_payment','cancelled','Reserved inventory released; no completed payment was recorded.'
  WHERE v_count>0;
  RETURN v_count;
END $release$;
REVOKE ALL ON FUNCTION public.release_marketplace_order_inventory(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_marketplace_order_inventory(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_marketplace_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $expire$
DECLARE
  v_order_id uuid;
  v_count integer:=0;
BEGIN
  FOR v_order_id IN
    SELECT DISTINCT order_id FROM public.marketplace_inventory_reservations
    WHERE status='reserved' AND expires_at<=now()
    ORDER BY order_id
    FOR UPDATE SKIP LOCKED
  LOOP
    v_count:=v_count+public.release_marketplace_order_inventory(v_order_id,'inventory_reservation_expired');
  END LOOP;
  RETURN v_count;
END $expire$;
REVOKE ALL ON FUNCTION public.expire_marketplace_inventory_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_marketplace_inventory_reservations() TO service_role;

COMMENT ON FUNCTION public.create_marketplace_order_from_quote(uuid,uuid,text) IS
  'Creates a seller-split pending order and reserves inventory atomically only after provider, tax, seller and quote gates are met. Does not confirm payment.';
COMMENT ON FUNCTION public.release_marketplace_order_inventory(uuid,text) IS
  'Idempotently releases unpaid inventory reservations and cancels an awaiting-payment order.';
COMMENT ON FUNCTION public.expire_marketplace_inventory_reservations() IS
  'Worker-only cleanup for expired unpaid inventory reservations.';

COMMIT;
