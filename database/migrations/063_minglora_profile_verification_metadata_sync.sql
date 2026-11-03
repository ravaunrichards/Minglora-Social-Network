BEGIN;

ALTER TABLE public.profile_verification_applications
  ADD CONSTRAINT profile_verification_evidence_links_array_check
  CHECK (jsonb_typeof(evidence_links)='array');

UPDATE auth.users
SET raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
  || jsonb_build_object('verification_status','verified','verification_badge','blue'),
    updated_at=now()
WHERE id='28e1df97-3fe1-488e-bb84-bdc353c58653'
  AND lower(email)='larryjones2019ersky@gmail.com'
  AND email_confirmed_at IS NOT NULL;

UPDATE auth.users AS u
SET raw_app_meta_data=coalesce(u.raw_app_meta_data,'{}'::jsonb)
  || jsonb_build_object('verification_status',p.verification_status,'verification_badge',p.verification_badge),
    updated_at=now()
FROM public.profiles AS p
WHERE u.id=p.id
  AND p.verification_status IN ('pending','needs_information','verified','rejected','suspended')
  AND (u.raw_app_meta_data->>'verification_status' IS DISTINCT FROM p.verification_status
    OR u.raw_app_meta_data->>'verification_badge' IS DISTINCT FROM p.verification_badge);

COMMIT;