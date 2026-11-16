-- Rebrand gift identities as Minglora originals while preserving all coin prices and effect profiles.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.live_gift_transactions
    WHERE gift_code IN ('tiktok-1faea2b', 'yes-tiktok-live-zic6ik', 'headphone-tiktok-1qrns6t', 'i-love-tiktok-live-11nkq0o', 'tiktok-crown-1k3gpo4', 'tiktok-volcano-1tsuykh', 'tiktok-red-carpet-64b7gj', 'tiktok-flight-15gd47b', 'tiktok-shuttle-umyze', 'tiktok-houses-glory-r2qd6t', 'tiktok-universe-ldyn97', 'tiktok-stars-1ptzf2i', 'tiktok-universe-rf6b2q')
  ) THEN
    RAISE EXCEPTION 'Cannot rename gift codes while gift transaction history references the existing codes.';
  END IF;
END $$;

WITH gift_renames(old_code, new_code, new_name, new_emoji) AS (
  VALUES
    ('tiktok-1faea2b', 'minglora-spark', 'Minglora Spark', '✨'),
    ('yes-tiktok-live-zic6ik', 'live-cheer', 'Live Cheer', '📣'),
    ('headphone-tiktok-1qrns6t', 'neon-headphones', 'Neon Headphones', '🎧'),
    ('i-love-tiktok-live-11nkq0o', 'minglora-live-hearts', 'Minglora Live Hearts', '💖'),
    ('tiktok-crown-1k3gpo4', 'crown-of-radiance', 'Crown of Radiance', '👑'),
    ('tiktok-volcano-1tsuykh', 'volcanic-eruption', 'Volcanic Eruption', '🌋'),
    ('tiktok-red-carpet-64b7gj', 'royal-red-carpet', 'Royal Red Carpet', '🎬'),
    ('tiktok-flight-15gd47b', 'skybound-flight', 'Skybound Flight', '✈️'),
    ('tiktok-shuttle-umyze', 'celestial-shuttle', 'Celestial Shuttle', '🚀'),
    ('tiktok-houses-glory-r2qd6t', 'houses-of-glory', 'Houses of Glory', '🏘️'),
    ('tiktok-universe-ldyn97', 'minglora-universe-plus', 'Minglora Universe+', '🌌'),
    ('tiktok-stars-1ptzf2i', 'starlight-constellation', 'Starlight Constellation', '✨'),
    ('tiktok-universe-rf6b2q', 'celestial-universe', 'Celestial Universe', '🌌')
)
UPDATE public.live_gift_catalog AS catalog
SET
  code = gift_renames.new_code,
  name = gift_renames.new_name,
  emoji = gift_renames.new_emoji,
  image_url = '/assets/gifts/catalog/' || gift_renames.new_code || '.svg',
  model_url = '/assets/gifts/catalog/' || gift_renames.new_code || '.gltf'
FROM gift_renames
WHERE catalog.code = gift_renames.old_code;

DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM public.live_gift_catalog
  WHERE lower(name) LIKE '%tiktok%'
     OR lower(code) LIKE '%tiktok%'
     OR lower(coalesce(image_url,'')) LIKE '%tiktok%'
     OR lower(coalesce(model_url,'')) LIKE '%tiktok%';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Gift rebrand incomplete: % branded catalogue rows remain.', remaining;
  END IF;
END $$;
