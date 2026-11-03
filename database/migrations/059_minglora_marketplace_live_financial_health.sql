BEGIN;

CREATE INDEX IF NOT EXISTS marketplace_payouts_operational_queue_idx
  ON public.marketplace_payouts (status, initiated_at)
  WHERE status IN ('queued','processing','failed','held');

CREATE INDEX IF NOT EXISTS marketplace_payment_attempts_operational_idx
  ON public.marketplace_payment_attempts (status, updated_at DESC)
  WHERE status IN ('created','approved','partially_captured','failed');

CREATE INDEX IF NOT EXISTS marketplace_refunds_operational_idx
  ON public.marketplace_refunds (status, updated_at DESC)
  WHERE status IN ('requested','processing','failed');

CREATE INDEX IF NOT EXISTS marketplace_webhook_events_operational_idx
  ON public.marketplace_webhook_events (processing_status, received_at)
  WHERE processing_status IN ('received','processing','failed');

CREATE OR REPLACE FUNCTION public.marketplace_financial_operational_health()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
SELECT jsonb_build_object(
  'webhooks',(
    SELECT jsonb_build_object(
      'received',count(*) FILTER (WHERE processing_status='received'),
      'processing',count(*) FILTER (WHERE processing_status='processing'),
      'processed',count(*) FILTER (WHERE processing_status='processed'),
      'ignored',count(*) FILTER (WHERE processing_status='ignored'),
      'failed',count(*) FILTER (WHERE processing_status='failed'),
      'staleProcessing',count(*) FILTER (
        WHERE processing_status='processing'
          AND coalesce(processing_started_at,received_at)<now()-interval '5 minutes'
      ),
      'oldReceived',count(*) FILTER (
        WHERE processing_status='received' AND received_at<now()-interval '15 minutes'
      ),
      'withLastError',count(*) FILTER (WHERE nullif(last_error,'') IS NOT NULL)
    )
    FROM public.marketplace_webhook_events
  ),
  'payouts',(
    SELECT jsonb_build_object(
      'queued',count(*) FILTER (WHERE status='queued'),
      'processing',count(*) FILTER (WHERE status='processing'),
      'paid',count(*) FILTER (WHERE status='paid'),
      'held',count(*) FILTER (WHERE status='held'),
      'failed',count(*) FILTER (WHERE status='failed'),
      'staleQueued',count(*) FILTER (
        WHERE status='queued' AND initiated_at<now()-interval '24 hours'
      ),
      'staleProcessing',count(*) FILTER (
        WHERE status='processing'
          AND coalesce(last_attempt_at,initiated_at)<now()-interval '15 minutes'
      ),
      'withoutCapturedTransaction',count(*) FILTER (
        WHERE status IN ('queued','processing','paid')
          AND (
            seller_payment_transaction_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM public.marketplace_seller_payment_transactions t
              WHERE t.id=marketplace_payouts.seller_payment_transaction_id
                AND t.status='captured' AND t.disbursement_mode='DELAYED'
            )
          )
      ),
      'paidWithoutProviderConfirmation',count(*) FILTER (
        WHERE status='paid'
          AND (
            nullif(provider_disbursement_id,'') IS NULL
            OR provider_disbursement_status NOT IN ('SUCCESS','SUCCEEDED','COMPLETED')
          )
      )
    )
    FROM public.marketplace_payouts
  ),
  'paymentAttempts',(
    SELECT jsonb_build_object(
      'created',count(*) FILTER (WHERE status='created'),
      'approved',count(*) FILTER (WHERE status='approved'),
      'captured',count(*) FILTER (WHERE status='captured'),
      'partiallyCaptured',count(*) FILTER (WHERE status='partially_captured'),
      'failed',count(*) FILTER (WHERE status='failed'),
      'voided',count(*) FILTER (WHERE status='voided'),
      'refunded',count(*) FILTER (WHERE status IN ('partially_refunded','refunded'))
    )
    FROM public.marketplace_payment_attempts
  ),
  'refunds',(
    SELECT jsonb_build_object(
      'requested',count(*) FILTER (WHERE status='requested'),
      'processing',count(*) FILTER (WHERE status='processing'),
      'succeeded',count(*) FILTER (WHERE status='succeeded'),
      'failed',count(*) FILTER (WHERE status='failed'),
      'requestedMinor',coalesce(sum(amount_minor) FILTER (WHERE status IN ('requested','processing')),0),
      'failedMinor',coalesce(sum(amount_minor) FILTER (WHERE status='failed'),0)
    )
    FROM public.marketplace_refunds
  ),
  'lastProviderRun',(
    SELECT jsonb_build_object(
      'id',id,'status',status,'currency',currency,
      'varianceMinor',variance_minor,'exceptionCount',exception_count,
      'startedAt',started_at,'completedAt',completed_at
    )
    FROM public.marketplace_financial_reconciliation_runs
    WHERE provider='paypal'
    ORDER BY started_at DESC
    LIMIT 1
  ),
  'checkedAt',now()
);
$function$;

REVOKE ALL ON FUNCTION public.marketplace_financial_operational_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_financial_operational_health() TO service_role;

COMMENT ON FUNCTION public.marketplace_financial_operational_health() IS
  'Read-only operational queues for Marketplace webhook retries, delayed seller payouts, payment attempts, refunds and the latest PayPal reconciliation run. It never settles funds or changes payment status.';

COMMIT;
