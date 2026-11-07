-- Refresh the default avatar asset URL after enlarging the circle to fill the frame.
-- Only rows assigned the previous default are changed; custom uploads are untouched.
BEGIN;

ALTER TABLE public.profiles
  ALTER COLUMN avatar_url SET DEFAULT 'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg?v=20261107-avatar-fill-2';

UPDATE public.profiles
SET avatar_url = 'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg?v=20261107-avatar-fill-2'
WHERE avatar_url = 'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg';

COMMIT;
