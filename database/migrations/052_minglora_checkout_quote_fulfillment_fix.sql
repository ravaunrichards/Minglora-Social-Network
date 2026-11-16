BEGIN;

CREATE OR REPLACE FUNCTION public.create_marketplace_checkout_quote(
  p_buyer_id uuid,
  p_items jsonb,
  p_fulfillment_by_listing jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
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
  IF p_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Buyer is required';
  END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>20 THEN
    RAISE EXCEPTION 'A checkout quote must contain between 1 and 20 items';
  END IF;
  IF p_fulfillment_by_listing IS NULL OR jsonb_typeof(p_fulfillment_by_listing)<>'object' THEN
    RAISE EXCEPTION 'Choose a fulfilment option for every product';
  END IF;

  SELECT * INTO v_config
  FROM public.marketplace_payment_configuration
  WHERE singleton=true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace payment configuration is unavailable';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_listing_id:=nullif(v_item->>'listingId','')::uuid;
    v_quantity:=coalesce((v_item->>'quantity')::integer,0);
    IF v_listing_id IS NULL OR v_quantity<1 OR v_quantity>100 THEN
      RAISE EXCEPTION 'Each product needs a valid listing and quantity from 1 to 100';
    END IF;
    IF v_listing_id=ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Each listing may appear only once in a checkout';
    END IF;
    v_seen_ids:=array_append(v_seen_ids,v_listing_id);

    SELECT * INTO v_listing
    FROM public.marketplace_listings
    WHERE id=v_listing_id;
    IF NOT FOUND OR v_listing.status<>'active' OR v_listing.kind<>'product' THEN
      RAISE EXCEPTION 'One or more products are no longer available';
    END IF;
    IF v_listing.seller_id=p_buyer_id THEN
      RAISE EXCEPTION 'You cannot purchase your own listing';
    END IF;
    IF v_listing.price_minor IS NULL OR v_listing.price_minor<=0 OR v_listing.currency IS NULL THEN
      RAISE EXCEPTION 'A product has an invalid price or currency';
    END IF;

    v_fulfillment:=coalesce(p_fulfillment_by_listing->>v_listing_id::text,'');
    IF NOT (v_listing.fulfillment_options @> ARRAY[v_fulfillment]::text[]) THEN
      RAISE EXCEPTION 'Choose a fulfilment option offered by each seller';
    END IF;

    IF v_listing.quantity-v_listing.reserved_quantity<v_quantity THEN
      RAISE EXCEPTION 'Requested quantity exceeds available stock for %',v_listing.title;
    END IF;
    IF v_currency IS NULL THEN
      v_currency:=v_listing.currency;
    ELSIF v_currency<>v_listing.currency THEN
      RAISE EXCEPTION 'Split products with different currencies into separate checkouts';
    END IF;

    v_rate_minor:=0;
    IF v_fulfillment<>'pickup' THEN
      SELECT r.price_minor INTO v_rate_minor
      FROM public.marketplace_fulfillment_rates r
      WHERE r.listing_id=v_listing.id
        AND r.seller_id=v_listing.seller_id
        AND r.method=v_fulfillment
        AND r.currency=v_currency
        AND r.active=true
        AND r.country_code IS NULL
        AND r.region_label=''
        AND r.postal_prefix=''
      ORDER BY r.updated_at DESC
      LIMIT 1;
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
      'listingId',v_listing.id,
      'sellerId',v_listing.seller_id,
      'title',left(v_listing.title,180),
      'quantity',v_quantity,
      'unitPriceMinor',v_listing.price_minor,
      'lineSubtotalMinor',v_line_minor,
      'fulfillment',v_fulfillment,
      'fulfillmentMinor',v_rate_minor
    ));
    IF NOT (v_listing.seller_id=ANY(v_seller_ids)) THEN
      v_seller_ids:=array_append(v_seller_ids,v_listing.seller_id);
    END IF;
  END LOOP;

  FOREACH v_seller_id IN ARRAY v_seller_ids
  LOOP
    SELECT * INTO v_seller
    FROM public.marketplace_seller_profiles
    WHERE user_id=v_seller_id;
    IF NOT FOUND OR v_seller.status<>'approved' OR v_seller.identity_status<>'verified' THEN
      v_blockers:=array_append(v_blockers,'One or more sellers have not completed marketplace identity or business verification.');
    ELSIF v_seller.payout_status<>'verified' THEN
      v_blockers:=array_append(v_blockers,'One or more sellers have not completed payout onboarding.');
    END IF;
  END LOOP;

  v_commission:=round(v_subtotal*v_config.commission_bps/10000.0)::bigint;
  v_total:=v_subtotal+v_fulfillment_total;

  -- Do not imply multi-seller settlement is ready until each seller can be
  -- paid via an approved PayPal delayed-disbursement integration.
  IF cardinality(v_seller_ids)>1 THEN
    v_blockers:=array_append(v_blockers,'Split this cart by seller. Multi-seller delayed settlement is not enabled for Minglora yet.');
  END IF;

  -- Tax is deliberately blocked until an actual tax/duty calculation result is
  -- supplied and persisted; a boolean config flag cannot make NULL tax ready.
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
    'id',v_quote_id,
    'buyerId',p_buyer_id,
    'currency',v_currency,
    'lines',v_lines,
    'sellerIds',to_jsonb(v_seller_ids),
    'itemSubtotalMinor',v_subtotal,
    'fulfillmentMinor',v_fulfillment_total,
    'marketplaceCommissionPreviewMinor',v_commission,
    'taxMinor',NULL,
    'totalMinorBeforeTax',v_total,
    'checkoutReady',false,
    'blockers',to_jsonb(v_blockers),
    'createdAt',v_created_at,
    'expiresAt',v_expires_at,
    'status','informational'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.create_marketplace_checkout_quote(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_checkout_quote(uuid,jsonb,jsonb) TO service_role;

COMMIT;
