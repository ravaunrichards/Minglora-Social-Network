BEGIN;

CREATE OR REPLACE FUNCTION public.marketplace_financial_reconciliation_snapshot()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
WITH capture_by_currency AS (
  SELECT
    currency,
    coalesce(sum(amount_minor) FILTER (WHERE status='captured'),0)::bigint AS captured_gross_minor,
    coalesce(sum(platform_fee_minor) FILTER (WHERE status='captured'),0)::bigint AS platform_fees_minor,
    coalesce(sum(processor_fee_minor) FILTER (WHERE status='captured'),0)::bigint AS processor_fees_minor,
    coalesce(sum(seller_net_minor) FILTER (WHERE status='captured'),0)::bigint AS seller_net_captured_minor,
    count(*) FILTER (WHERE status='captured')::bigint AS captured_transactions,
    count(*) FILTER (WHERE status='failed')::bigint AS failed_seller_units
  FROM public.marketplace_seller_payment_transactions
  GROUP BY currency
),
payout_by_currency AS (
  SELECT
    currency,
    count(*) FILTER (WHERE status='queued')::bigint AS queued_payouts,
    count(*) FILTER (WHERE status='processing')::bigint AS processing_payouts,
    count(*) FILTER (WHERE status='paid')::bigint AS paid_payouts,
    count(*) FILTER (WHERE status='held')::bigint AS held_payouts,
    coalesce(sum(amount_minor) FILTER (WHERE status IN ('queued','processing','held')),0)::bigint AS queued_payout_minor,
    coalesce(sum(amount_minor) FILTER (WHERE status='paid'),0)::bigint AS paid_payout_minor
  FROM public.marketplace_payouts
  GROUP BY currency
),
currencies AS (
  SELECT currency FROM capture_by_currency
  UNION
  SELECT currency FROM payout_by_currency
),
by_currency AS (
  SELECT
    c.currency,
    jsonb_build_object(
      'capturedGrossMinor',coalesce(t.captured_gross_minor,0),
      'platformFeesMinor',coalesce(t.platform_fees_minor,0),
      'processorFeesMinor',coalesce(t.processor_fees_minor,0),
      'sellerNetCapturedMinor',coalesce(t.seller_net_captured_minor,0),
      'capturedTransactions',coalesce(t.captured_transactions,0),
      'failedSellerUnits',coalesce(t.failed_seller_units,0),
      'queuedPayouts',coalesce(p.queued_payouts,0),
      'processingPayouts',coalesce(p.processing_payouts,0),
      'paidPayouts',coalesce(p.paid_payouts,0),
      'heldPayouts',coalesce(p.held_payouts,0),
      'queuedPayoutMinor',coalesce(p.queued_payout_minor,0),
      'paidPayoutMinor',coalesce(p.paid_payout_minor,0)
    ) AS summary
  FROM currencies c
  LEFT JOIN capture_by_currency t USING(currency)
  LEFT JOIN payout_by_currency p USING(currency)
),
journal_summary AS (
  SELECT
    count(*)::bigint AS total_journals,
    (SELECT count(*)::bigint FROM public.marketplace_ledger_entries) AS total_ledger_entries,
    count(*) FILTER (WHERE invalid.is_invalid)::bigint AS unbalanced_journals
  FROM public.marketplace_journals j
  LEFT JOIN LATERAL (
    SELECT (
      count(e.id)<2
      OR coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)
         <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0)
      OR count(*) FILTER (WHERE a.currency<>j.currency)>0
    ) AS is_invalid
    FROM public.marketplace_ledger_entries e
    LEFT JOIN public.marketplace_ledger_accounts a ON a.id=e.account_id
    WHERE e.journal_id=j.id
  ) invalid ON true
)
SELECT
  jsonb_build_object(
    'byCurrency',coalesce((SELECT jsonb_object_agg(currency::text,summary) FROM by_currency),'{}'::jsonb),
    'totalJournals',coalesce((SELECT total_journals FROM journal_summary),0),
    'totalLedgerEntries',coalesce((SELECT total_ledger_entries FROM journal_summary),0),
    'unbalancedJournals',coalesce((SELECT unbalanced_journals FROM journal_summary),0),
    'captureJournalsMissing',(
      SELECT count(*) FROM public.marketplace_seller_payment_transactions t
      WHERE t.status='captured'
        AND NOT EXISTS (
          SELECT 1 FROM public.marketplace_journals j
          WHERE j.source_type='payment_capture'
            AND j.source_reference=t.provider||':capture:'||t.provider_capture_id
        )
    ),
    'payoutJournalsMissing',(
      SELECT count(*) FROM public.marketplace_payouts p
      WHERE p.status='paid'
        AND NOT EXISTS (
          SELECT 1 FROM public.marketplace_journals j
          WHERE j.source_type='payout'
            AND j.source_reference='paypal:marketplace-payout:'||p.id::text
        )
    ),
    'unconfirmedPaidPayouts',(
      SELECT count(*) FROM public.marketplace_payouts p
      WHERE p.status='paid' AND (
        nullif(p.provider_disbursement_id,'') IS NULL
        OR p.provider_disbursement_status NOT IN ('SUCCESS','SUCCEEDED','COMPLETED')
      )
    ),
    'externalProviderStatementVerified',false,
    'checkedAt',now()
  );
$function$;

REVOKE ALL ON FUNCTION public.marketplace_financial_reconciliation_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_financial_reconciliation_snapshot() TO service_role;
COMMENT ON FUNCTION public.marketplace_financial_reconciliation_snapshot() IS
  'Returns grouped internal financial reconciliation by currency. It explicitly does not claim an external PayPal/bank statement reconciliation.';

COMMIT;
