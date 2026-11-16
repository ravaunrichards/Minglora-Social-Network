-- Add more original premium Minglora LIVE gifts.
BEGIN;
INSERT INTO public.live_gift_catalog
  (code,name,category,emoji,animation_key,coin_price,active,sort_order,model_url,animation_preset)
VALUES
 ('money_rain','Money Rain Parade','luxury','💸','money-rain',800,true,700,'/assets/gifts/minglora_money_rain.gltf','money-rain'),
 ('aurora_whale','Aurora Whale','animals','🐳','aurora-surge',8500,true,710,'/assets/gifts/minglora_aurora_whale.gltf','aurora-surge'),
 ('silver_falcon','Silver Falcon','animals','🦅','falcon-flight',2600,true,720,'/assets/gifts/minglora_silver_falcon.gltf','falcon-flight'),
 ('pegasus','Celestial Pegasus','fantasy','🪽','pegasus-flight',7800,true,730,'/assets/gifts/minglora_pegasus.gltf','pegasus-flight'),
 ('coral_castle','Coral Palace','fantasy','🏰','castle-rise',6000,true,740,'/assets/gifts/minglora_coral_castle.gltf','castle-rise'),
 ('private_jet','Minglora Private Jet','vehicles','✈️','skyline-flight',6500,true,750,'/assets/gifts/minglora_private_jet.gltf','skyline-flight')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,category=EXCLUDED.category,emoji=EXCLUDED.emoji,
  animation_key=EXCLUDED.animation_key,coin_price=EXCLUDED.coin_price,
  active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,
  model_url=EXCLUDED.model_url,animation_preset=EXCLUDED.animation_preset;
COMMIT;
