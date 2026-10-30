-- Original Minglora 3D gift catalogue and animation metadata.
BEGIN;
ALTER TABLE public.live_gift_catalog
  ADD COLUMN IF NOT EXISTS model_url text,
  ADD COLUMN IF NOT EXISTS animation_preset text NOT NULL DEFAULT 'gift-float';

UPDATE public.live_gift_catalog
SET model_url=CASE code
  WHEN 'rose' THEN '/assets/gifts/minglora_royal_rose.gltf'
  WHEN 'heart' THEN '/assets/gifts/minglora_crystal_heart.gltf'
  WHEN 'coffee' THEN '/assets/gifts/minglora_blue_mountain_coffee.gltf'
  WHEN 'party' THEN '/assets/gifts/minglora_fireworks.gltf'
  WHEN 'trophy' THEN '/assets/gifts/minglora_golden_trophy.gltf'
  WHEN 'lion' THEN '/assets/gifts/minglora_royal_lion.gltf'
  WHEN 'universe' THEN '/assets/gifts/minglora_cosmic_orbit.gltf'
  ELSE model_url END,
  animation_preset=CASE code
  WHEN 'rose' THEN 'petal-rise'
  WHEN 'heart' THEN 'heart-burst'
  WHEN 'coffee' THEN 'steam-rise'
  WHEN 'party' THEN 'firework-burst'
  WHEN 'trophy' THEN 'golden-spin'
  WHEN 'lion' THEN 'royal-entrance'
  WHEN 'universe' THEN 'cosmic-orbit'
  ELSE animation_preset END;

INSERT INTO public.live_gift_catalog
  (code,name,category,emoji,animation_key,coin_price,active,sort_order,model_url,animation_preset)
VALUES
  ('caribbean_crown','Caribbean Crown','luxury','👑','crown-rise',500,true,80,'/assets/gifts/minglora_caribbean_crown.gltf','crown-rise'),
  ('carnival_mask','Minglora Carnival Mask','celebrations','🎭','carnival-spin',350,true,90,'/assets/gifts/minglora_carnival_mask.gltf','carnival-spin'),
  ('hummingbird','Island Hummingbird','animals','🐦','hummingbird-flight',700,true,100,'/assets/gifts/minglora_hummingbird.gltf','hummingbird-flight'),
  ('reggae_drum','Reggae Rhythm Drum','music','🥁','rhythm-pulse',450,true,110,'/assets/gifts/minglora_reggae_drum.gltf','rhythm-pulse'),
  ('island_pride','Minglora Island Pride','jamaican_culture','🇯🇲','island-wave',300,true,120,'/assets/gifts/minglora_island_pride.gltf','island-wave'),
  ('dolphin','Ocean Dolphin','animals','🐬','ocean-leap',650,true,130,'/assets/gifts/minglora_dolphin.gltf','ocean-leap')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,category=EXCLUDED.category,emoji=EXCLUDED.emoji,
  animation_key=EXCLUDED.animation_key,coin_price=EXCLUDED.coin_price,
  active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,
  model_url=EXCLUDED.model_url,animation_preset=EXCLUDED.animation_preset;
COMMIT;
