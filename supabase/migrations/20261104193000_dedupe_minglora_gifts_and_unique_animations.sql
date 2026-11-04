-- Disambiguate 19 same-name price variants and give every active gift a unique animation identity.
BEGIN;
UPDATE public.live_gift_catalog
SET name = CASE code
    WHEN 'shamrock-1eqpxyx' THEN 'Shamrock — Premium Edition'
    WHEN 'star-1m1y9v5' THEN 'Star — Premium Edition'
    WHEN 'bouquet-16huony' THEN 'Bouquet — Premium Edition'
    WHEN 'music-bubbles-1ken9tf' THEN 'Music Bubbles — Premium Edition'
    WHEN 'boxing-gloves-1zstow' THEN 'Boxing Gloves — Premium Edition'
    WHEN 'birthday-cake-300c-w1ov1p' THEN 'Birthday Cake — Premium Edition'
    WHEN 'sports-car-1ur1pbk' THEN 'Sports Car — Premium Edition'
    WHEN 'legacy-in-bloom-21000-mgl' THEN 'Legacy in Bloom — Premium Edition'
    WHEN 'thumbs-up-2-mgl' THEN 'Thumbs Up — Premium Edition'
    WHEN 'baseball-5-mgl' THEN 'Baseball — Premium Edition'
    WHEN 'dream-team-500-mgl' THEN 'Dream Team — Premium Edition'
    WHEN 'crocodile-15000-mgl' THEN 'Crocodile — Premium Edition'
    WHEN 'level-ship-21000-mgl' THEN 'Level Ship — Premium Edition'
    WHEN 'julius-the-champion-43999-mgl' THEN 'Julius the Champion — Premium Edition'
    WHEN 'valerian-s-oath-43999-mgl' THEN 'Valerian''s Oath — Premium Edition'
    WHEN 'red-lightning-12000-mg' THEN 'Red Lightning — Premium Edition'
    WHEN 'monster-truck-14000-mg' THEN 'Monster Truck — Premium Edition'
    WHEN 'crystal-heart-14999-mg' THEN 'Crystal Heart — Premium Edition'
    WHEN 'masquerade-19999-mg' THEN 'Masquerade — Premium Edition'
    ELSE name
  END,
  animation_key = 'minglora-' || code
WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS live_gift_catalog_active_name_unique_idx
  ON public.live_gift_catalog (lower(btrim(name)))
  WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS live_gift_catalog_active_animation_key_unique_idx
  ON public.live_gift_catalog (animation_key)
  WHERE active = true;

DO $$
DECLARE duplicate_names integer; duplicate_animation_keys integer;
BEGIN
  SELECT count(*) INTO duplicate_names FROM (
    SELECT lower(btrim(name)) FROM public.live_gift_catalog
    WHERE active = true GROUP BY lower(btrim(name)) HAVING count(*) > 1
  ) duplicates;
  SELECT count(*) INTO duplicate_animation_keys FROM (
    SELECT animation_key FROM public.live_gift_catalog
    WHERE active = true GROUP BY animation_key HAVING count(*) > 1
  ) duplicates;
  IF duplicate_names <> 0 OR duplicate_animation_keys <> 0 THEN
    RAISE EXCEPTION 'Gift uniqueness validation failed: % duplicate names, % duplicate animation keys.', duplicate_names, duplicate_animation_keys;
  END IF;
END $$;
COMMIT;
