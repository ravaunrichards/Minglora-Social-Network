-- Add seven original reaction, celebration, luxury and fantasy gifts.
BEGIN;
INSERT INTO public.live_gift_catalog
  (code,name,category,emoji,animation_key,coin_price,active,sort_order,model_url,animation_preset)
VALUES
 ('finger_heart','Minglora Finger Heart','reactions','🫰','heart-gesture',6,true,800,'/assets/gifts/minglora_finger_heart.gltf','heart-gesture'),
 ('perfume','Minglora Perfume','everyday','🧴','perfume-mist',20,true,810,'/assets/gifts/minglora_perfume.gltf','perfume-mist'),
 ('confetti','Minglora Confetti Burst','celebrations','🎊','confetti-burst',100,true,820,'/assets/gifts/minglora_confetti.gltf','confetti-burst'),
 ('money_gun','Minglora Money Gun','luxury','💵','money-spray',500,true,830,'/assets/gifts/minglora_money_gun.gltf','money-spray'),
 ('galaxy','Minglora Galaxy','fantasy','🌌','galaxy-spin',1000,true,840,'/assets/gifts/minglora_galaxy.gltf','galaxy-spin'),
 ('zeus','Minglora Zeus','fantasy','⚡','zeus-lightning',3400,true,850,'/assets/gifts/minglora_zeus.gltf','zeus-lightning'),
 ('thunder_falcon','Thunder Falcon','animals','🦅','thunder-flight',4000,true,860,'/assets/gifts/minglora_thunder_falcon.gltf','thunder-flight')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,category=EXCLUDED.category,emoji=EXCLUDED.emoji,
  animation_key=EXCLUDED.animation_key,coin_price=EXCLUDED.coin_price,
  active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,
  model_url=EXCLUDED.model_url,animation_preset=EXCLUDED.animation_preset;
COMMIT;
