-- Switch only the application-selected default avatar to the uploaded ENIGMA artwork.
-- Custom member-uploaded profile pictures are intentionally left untouched.
BEGIN;

ALTER TABLE public.profiles
  ALTER COLUMN avatar_url SET DEFAULT
    'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/assets/Crop%20References/Profile%20Picture/ENIGMA.png';

UPDATE public.profiles
SET avatar_url = 'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/assets/Crop%20References/Profile%20Picture/ENIGMA.png'
WHERE avatar_url IN (
  'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg',
  'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg?v=20261107-avatar-fill-2'
);

COMMIT;
