-- Extend the Minglora LIVE catalogue with additional original 3D gifts.
BEGIN;
INSERT INTO public.live_gift_catalog
  (code,name,category,emoji,animation_key,coin_price,active,sort_order,model_url,animation_preset)
VALUES
 ('hibiscus_bouquet','Hibiscus Bouquet','flowers','💐','petal-fountain',250,true,500,'/assets/gifts/minglora_hibiscus_bouquet.gltf','petal-fountain'),
 ('sports_car','Minglora Sports Car','vehicles','🏎️','turbo-entry',3500,true,510,'/assets/gifts/minglora_sports_car.gltf','turbo-entry'),
 ('jade_dragon','Jade Dragon','fantasy','🐉','dragon-flight',9000,true,520,'/assets/gifts/minglora_jade_dragon.gltf','dragon-flight'),
 ('phoenix','Phoenix Rebirth','fantasy','🔥','phoenix-rise',7500,true,530,'/assets/gifts/minglora_phoenix.gltf','phoenix-rise'),
 ('diamond_ring','Diamond Ring','luxury','💍','diamond-spark',1500,true,540,'/assets/gifts/minglora_diamond_ring.gltf','diamond-spark'),
 ('prism_butterfly','Prism Butterfly','animals','🦋','butterfly-flutter',320,true,550,'/assets/gifts/minglora_prism_butterfly.gltf','butterfly-flutter'),
 ('royal_peacock','Royal Peacock','animals','🦚','peacock-display',1400,true,560,'/assets/gifts/minglora_royal_peacock.gltf','peacock-display'),
 ('ocean_shark','Ocean Shark','animals','🦈','shark-surge',1800,true,570,'/assets/gifts/minglora_ocean_shark.gltf','shark-surge'),
 ('golden_microphone','Golden Microphone','music','🎤','mic-rise',900,true,580,'/assets/gifts/minglora_golden_microphone.gltf','mic-rise'),
 ('electric_guitar','Electric Guitar','music','🎸','guitar-solo',1200,true,590,'/assets/gifts/minglora_electric_guitar.gltf','guitar-solo'),
 ('soccer_ball','Golden Soccer Ball','sports','⚽','soccer-kick',350,true,600,'/assets/gifts/minglora_soccer_ball.gltf','soccer-kick'),
 ('diamond_basketball','Diamond Basketball','sports','🏀','basketball-bounce',350,true,610,'/assets/gifts/minglora_diamond_basketball.gltf','basketball-bounce'),
 ('crystal_snowflake','Crystal Snowflake','seasonal','❄️','snowfall',200,true,620,'/assets/gifts/minglora_crystal_snowflake.gltf','snowfall'),
 ('christmas_lantern','Christmas Lantern','seasonal','🏮','lantern-glow',650,true,630,'/assets/gifts/minglora_christmas_lantern.gltf','lantern-glow'),
 ('reggae_parrot','Reggae Parrot','jamaican_culture','🦜','parrot-flight',800,true,640,'/assets/gifts/minglora_reggae_parrot.gltf','parrot-flight'),
 ('rocket','Minglora Rocket','fantasy','🚀','rocket-launch',4200,true,650,'/assets/gifts/minglora_rocket.gltf','rocket-launch'),
 ('cricket_bat','Cricket Bat','sports','🏏','cricket-swing',300,true,660,'/assets/gifts/minglora_cricket_bat.gltf','cricket-swing'),
 ('parish_pride_crest','Parish Pride Crest','jamaican_culture','🏝️','parish-wave',950,true,670,'/assets/gifts/minglora_parish_pride_crest.gltf','parish-wave'),
 ('tropical_sunset','Tropical Sunset','seasonal','🌅','sunset-halo',1200,true,680,'/assets/gifts/minglora_tropical_sunset.gltf','sunset-halo')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,category=EXCLUDED.category,emoji=EXCLUDED.emoji,
  animation_key=EXCLUDED.animation_key,coin_price=EXCLUDED.coin_price,
  active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,
  model_url=EXCLUDED.model_url,animation_preset=EXCLUDED.animation_preset;
COMMIT;
