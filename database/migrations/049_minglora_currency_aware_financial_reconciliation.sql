BEGIN;

CREATE OR REPLACE FUNCTION public.marketplace_financial_reconciliation_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH currencies AS (
    SELECT currency FROM public.marketplace_seller_payment_transactions
    UNION
    SELECT currency FROM public.marketplace_payouts
    UNION
    SELECT currency FROM public.marketplace_journals
  ),
  captures AS (
    SELECT
      currency,
      coalesce(sum(amount_minor) FILTER (WHERE status='captured'),0)::numeric AS captured_gross_minor,
      coalesce(sum(platform_fee_minor) FILTER (WHERE status='captured'),0)::numeric AS platform_fees_minor,
      coalesce(sum(processor_fee_minor) FILTER (WHERE status='captured'),0)::numeric AS processor_fees_minor,
      coalesce(sum(seller_net_minor) FILTER (WHERE status='captured'),0)::numeric AS seller_net_captured_minor,
      count(*) FILTER (WHERE status='captured')::integer AS captured_transactions,
      count(*) FILTER (WHERE status='failed')::integer AS failed_seller_units
    FROM public.marketplace_seller_payment_transactions
    GROUP BY currency
  ),
  payouts AS (
    SELECT
      currency,
      count(*) FILTER (WHERE status='queued')::integer AS queued_payouts,
      count(*) FILTER (WHERE status='processing')::integer AS processing_payouts,
      count(*) FILTER (WHERE status='paid')::integer AS paid_payouts,
      count(*) FILTER (WHERE status='held')::integer AS held_payouts,
      coalesce(sum(amount_minor) FILTER (WHERE status IN ('queued','processing','held')),0)::numeric AS queued_payout_minor,
      coalesce(sum(amount_minor) FILTER (WHERE status='paid'),0)::numeric AS paid_payout_minor
    FROM public.marketplace_payouts
    GROUP BY currency
  )
  SELECT jsonb_build_object(
    'byCurrency',coalesce((
      SELECT jsonb_object_agg(
        c.currency::text,
        jsonb_build_object(
          'capturedGrossMinor',coalesce(ca.captured_gross_minor,0),
          'platformFeesMinor',coalesce(ca.platform_fees_minor,0),
          'processorFeesMinor',coalesce(ca.processor_fees_minor,0),
          'sellerNetCapturedMinor',coalesce(ca.seller_net_captured_minor,0),
          'capturedTransactions',coalesce(ca.captured_transactions,0),
          'failedSellerUnits',coalesce(ca.failed_seller_units,0),
          'queuedPayouts',coalesce(p.queued_payouts,0),
          'processingPayouts',coalesce(p.processing_payouts,0),
          'paidPayouts',coalesce(p.paid_payouts,0),
          'heldPayouts',coalesce(p.held_payouts,0),
          'queuedPayoutMinor',coalesce(p.queued_payout_minor,0),
          'paidPayoutMinor',coalesce(p.paid_payout_minor,0)
        )
      )
      FROM currencies AS c
      LEFT JOIN captures AS ca ON ca.currency=c.currency
      LEFT JOIN payouts AS p ON p.currency=c.currency
    ),'{}'::jsonb),
    'unbalancedJournals',(
      SELECT count(*) FROM (
        SELECT j.id
        FROM public.marketplace_journals AS j
        LEFT JOIN public.marketplace_ledger_entries AS e ON e.journal_id=j.id
        LEFT JOIN public.marketplace_ledger_accounts AS a ON a.id=e.account_id
        GROUP BY j.id,j.currency
        HAVING count(e.id)<2
          OR coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)
             <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0)
          OR count(*) FILTER (WHERE a.currency<>j.currency)>0
      ) AS invalid
    ),
    'captureJournalsMissing',(
      SELECT count(*) FROM public.marketplace_seller_payment_transactions AS t
      WHERE t.status='captured'
        AND NOT EXISTS (
          SELECT 1 FROM public.marketplace_journals AS j
          WHERE j.source_type='payment_capture'
            AND j.source_reference=t.provider||':capture:'||t.provider_capture_id
        )
    ),
    'payoutJournalsMissing',(
      SELECT count(*) FROM public.marketplace_payouts AS p
      WHERE p.status='paid'
        AND NOT EXISTS (
          SELECT 1 FROM public.marketplace_journals AS j
          WHERE j.source_type='payout'
            AND j.source_reference='paypal:marketplace-payout:'||p.id::text
        )
    ),
    'unconfirmedPaidPayouts',(
      SELECT count(*) FROM public.marketplace_payouts AS p
      WHERE p.status='paid' AND (
        nullif(p.provider_disbursement_id,'') IS NULL
        OR p.provider_disbursement_status NOT IN ('SUCCESS','SUCCEEDED','COMPLETED')
      )
    ),
    'totalJournals',(SELECT count(*) FROM public.marketplace_journals),
    'totalLedgerEntries',(SELECT count(*) FROM public.marketplace_ledger_entries),
    'totalSellerPaymentTransactions',(SELECT count(*) FROM public.marketplace_seller_payment_transactions),
    'totalPayouts',(SELECT count(*) FROM public.marketplace_payouts),
    'checkedAt',now()
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_financial_reconciliation_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_financial_reconciliation_snapshot() TO service_role;
COMMENT ON FUNCTION public.marketplace_financial_reconciliation_snapshot() IS
  'Returns internal ledger and payout integrity grouped by currency. Currency totals are never combined across different currencies; no external PayPal statement balance is implied.';

COMMIT;
