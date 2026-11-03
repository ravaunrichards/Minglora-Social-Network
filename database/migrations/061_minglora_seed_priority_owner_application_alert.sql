BEGIN;

-- Bring the existing pending Creator Hub application into the same review
-- queue as applications submitted after the new trigger was installed.
UPDATE public.marketplace_seller_profiles
SET review_priority='urgent',
    review_due_at=now()+interval '4 hours',
    auto_review_status='flagged',
    auto_review_score=65,
    auto_review_flags=jsonb_build_array(
      jsonb_build_object(
        'code','jamaica_business_seller_required',
        'severity','high',
        'message','Jamaica PayPal marketplace onboarding requires a Business seller profile.'
      ),
      jsonb_build_object(
        'code','business_identity_evidence_required',
        'severity','high',
        'message','Business identity information and supporting evidence must be checked by an independent reviewer.'
      )
    ),
    updated_at=now()
WHERE user_id='28e1df97-3fe1-488e-bb84-bdc353c58653'
  AND status='pending';

INSERT INTO public.marketplace_application_review_alerts
  (recipient_id,application_user_id,event_type,priority,due_at,title,body)
SELECT staff.user_id,seller.user_id,'application_submitted','urgent',seller.review_due_at,
       'Priority Marketplace application awaiting review',
       seller.store_name||' is awaiting an independent review. Target review time: four hours.'
FROM public.marketplace_seller_profiles AS seller
JOIN public.minglora_platform_staff AS staff ON staff.active=true
WHERE seller.user_id='28e1df97-3fe1-488e-bb84-bdc353c58653'
  AND seller.status='pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.marketplace_application_review_alerts existing
    WHERE existing.recipient_id=staff.user_id
      AND existing.application_user_id=seller.user_id
      AND existing.event_type='application_submitted'
      AND existing.read_at IS NULL
  );

INSERT INTO public.notifications
  (recipient_id,actor_id,kind,entity_type,entity_id,payload)
SELECT staff.user_id,seller.user_id,'marketplace_application_review','marketplace_seller',seller.user_id,
       jsonb_build_object(
         'title','Priority Marketplace application awaiting review',
         'body',seller.store_name||' is awaiting an independent review.',
         'priority','urgent',
         'dueAt',seller.review_due_at
       )
FROM public.marketplace_seller_profiles AS seller
JOIN public.minglora_platform_staff AS staff ON staff.active=true
WHERE seller.user_id='28e1df97-3fe1-488e-bb84-bdc353c58653'
  AND seller.status='pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications existing
    WHERE existing.recipient_id=staff.user_id
      AND existing.entity_type='marketplace_seller'
      AND existing.entity_id=seller.user_id
      AND existing.kind='marketplace_application_review'
      AND existing.read_at IS NULL
  );

COMMIT;