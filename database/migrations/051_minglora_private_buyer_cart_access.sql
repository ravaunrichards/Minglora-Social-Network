BEGIN;

ALTER TABLE public.marketplace_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cart_items ENABLE ROW LEVEL SECURITY;

-- Buyer cart reads and writes go only through Minglora's authenticated API and
-- the service-role runtime gateway. Do not expose raw cart tables to clients.
REVOKE ALL ON TABLE public.marketplace_carts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.marketplace_cart_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.marketplace_carts TO service_role;
GRANT ALL ON TABLE public.marketplace_cart_items TO service_role;

CREATE INDEX IF NOT EXISTS marketplace_cart_items_cart_added_idx
  ON public.marketplace_cart_items(cart_id,added_at DESC);

COMMENT ON TABLE public.marketplace_carts IS
  'Private buyer-owned Marketplace carts. Read/write only through authenticated Minglora server routes using the service-role database gateway.';
COMMENT ON TABLE public.marketplace_cart_items IS
  'Private buyer cart lines. Direct anon/authenticated Data API access is revoked; ownership is enforced by the Minglora runtime.';

COMMIT;
