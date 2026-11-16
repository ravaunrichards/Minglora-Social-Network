-- Add the 18 missing premium gift entries to the Minglora LIVE catalogue.
-- Each gift has its own SVG illustration and generated 3D GLTF model.
insert into public.live_gift_catalog
  (code,name,category,emoji,animation_key,coin_price,active,sort_order,model_url,animation_preset,image_url,sound_preset,animation_duration_ms,asset_version)
values
('you-are-wanted-9999','You Are Wanted!','symbols','🎯','spark-float','9999','true','17400','/assets/gifts/catalog/you-are-wanted-9999.gltf','spark-float','/assets/gifts/catalog/you-are-wanted-9999.svg','premium-wanted','4200','2'),
('hot-rods-12000','Hot Rods','vehicles','🏎️','grand-entry','12000','true','17410','/assets/gifts/catalog/hot-rods-12000.gltf','grand-entry','/assets/gifts/catalog/hot-rods-12000.svg','premium-hot-rods','4600','2'),
('red-lightning-12000-mg','Red Lightning','fantasy','⚡','power-impact','12000','true','17420','/assets/gifts/catalog/red-lightning-12000-mg.gltf','power-impact','/assets/gifts/catalog/red-lightning-12000-mg.svg','premium-red-lightning','3900','2'),
('monster-truck-14000-mg','Monster Truck','vehicles','🚚','power-impact','14000','true','17430','/assets/gifts/catalog/monster-truck-14000-mg.gltf','power-impact','/assets/gifts/catalog/monster-truck-14000-mg.svg','premium-monster-truck','4700','2'),
('crystal-heart-14999-mg','Crystal Heart','hearts','💎','heart-pulse','14999','true','17440','/assets/gifts/catalog/crystal-heart-14999-mg.gltf','heart-pulse','/assets/gifts/catalog/crystal-heart-14999-mg.svg','premium-crystal-heart','4200','2'),
('iron-resolve-14999','Iron Resolve','fantasy','🛡️','grand-entry','14999','true','17450','/assets/gifts/catalog/iron-resolve-14999.gltf','grand-entry','/assets/gifts/catalog/iron-resolve-14999.svg','premium-iron-resolve','4400','2'),
('a-fun-house-15000','A Fun House','celebrations','🎪','celebration-burst','15000','true','17460','/assets/gifts/catalog/a-fun-house-15000.gltf','celebration-burst','/assets/gifts/catalog/a-fun-house-15000.svg','premium-fun-house','4300','2'),
('corgis-happy-chuseok-15000','Corgi''s Happy Chuseok','animals','🐶','creature-entrance','15000','true','17470','/assets/gifts/catalog/corgis-happy-chuseok-15000.gltf','creature-entrance','/assets/gifts/catalog/corgis-happy-chuseok-15000.svg','premium-corgi-chuseok','4200','2'),
('the-dreamy-night-15000','The Dreamy Night','fantasy','🌙','cosmic-orbit','15000','true','17480','/assets/gifts/catalog/the-dreamy-night-15000.gltf','cosmic-orbit','/assets/gifts/catalog/the-dreamy-night-15000.svg','premium-dreamy-night','4800','2'),
('vintage-car-15000','Vintage Car','vehicles','🚘','grand-entry','15000','true','17490','/assets/gifts/catalog/vintage-car-15000.gltf','grand-entry','/assets/gifts/catalog/vintage-car-15000.svg','premium-vintage-car','4500','2'),
('gobble-grab-15000','Gobble Grab','animals','🦃','creature-entrance','15000','true','17500','/assets/gifts/catalog/gobble-grab-15000.gltf','creature-entrance','/assets/gifts/catalog/gobble-grab-15000.svg','premium-gobble-grab','4200','2'),
('jet-car-17000','Jet Car','vehicles','🚀','grand-entry','17000','true','17510','/assets/gifts/catalog/jet-car-17000.gltf','grand-entry','/assets/gifts/catalog/jet-car-17000.svg','premium-jet-car','4500','2'),
('super-car-19000','Super Car','vehicles','🏎️','grand-entry','19000','true','17520','/assets/gifts/catalog/super-car-19000.gltf','grand-entry','/assets/gifts/catalog/super-car-19000.svg','premium-super-car','4700','2'),
('masquerade-19999-mg','Masquerade','fashion_beauty','🎭','glam-spin','19999','true','17530','/assets/gifts/catalog/masquerade-19999-mg.gltf','glam-spin','/assets/gifts/catalog/masquerade-19999-mg.svg','premium-masquerade','4600','2'),
('pop-out-21000','Pop Out','celebrations','🎉','celebration-burst','21000','true','17540','/assets/gifts/catalog/pop-out-21000.gltf','celebration-burst','/assets/gifts/catalog/pop-out-21000.svg','premium-pop-out','4400','2'),
('villainy-slain-25999','Villainy Slain','fantasy','⚔️','power-impact','25999','true','17550','/assets/gifts/catalog/villainy-slain-25999.gltf','power-impact','/assets/gifts/catalog/villainy-slain-25999.svg','premium-villainy-slain','4900','2'),
('live-pro-face-off-30000','LIVE Pro Face-Off','sports','🥊','power-impact','30000','true','17560','/assets/gifts/catalog/live-pro-face-off-30000.gltf','power-impact','/assets/gifts/catalog/live-pro-face-off-30000.svg','premium-live-face-off','5000','2'),
('the-fair-king-42999','The Fair King','luxury','👑','royal-shimmer','42999','true','17570','/assets/gifts/catalog/the-fair-king-42999.gltf','royal-shimmer','/assets/gifts/catalog/the-fair-king-42999.svg','premium-fair-king','5200','2')
on conflict (code) do update set
  name=excluded.name,
  category=excluded.category,
  emoji=excluded.emoji,
  animation_key=excluded.animation_key,
  coin_price=excluded.coin_price,
  active=true,
  sort_order=excluded.sort_order,
  model_url=excluded.model_url,
  animation_preset=excluded.animation_preset,
  image_url=excluded.image_url,
  sound_preset=excluded.sound_preset,
  animation_duration_ms=excluded.animation_duration_ms,
  asset_version=excluded.asset_version
;
