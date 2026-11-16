BEGIN;

-- Keep the original provider/order uniqueness constraint and remove the
-- duplicate index introduced by the PayPal multiparty registry migration.
DROP INDEX IF EXISTS public.marketplace_payment_attempt_provider_order_uq;

-- Cover the foreign keys identified by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS live_chat_messages_user_id_idx
  ON public.live_chat_messages(user_id);

CREATE INDEX IF NOT EXISTS live_gift_transactions_gift_code_idx
  ON public.live_gift_transactions(gift_code);

CREATE INDEX IF NOT EXISTS live_gift_transactions_sender_id_idx
  ON public.live_gift_transactions(sender_id);

COMMENT ON INDEX public.live_chat_messages_user_id_idx IS
  'Covers the live chat message user foreign key for account-oriented lookups and deletes.';

COMMENT ON INDEX public.live_gift_transactions_gift_code_idx IS
  'Covers the live gift transaction gift-code foreign key.';

COMMENT ON INDEX public.live_gift_transactions_sender_id_idx IS
  'Covers the live gift transaction sender foreign key.';

COMMIT;
