-- Use the Minglora-selected neutral profile picture for only missing avatars.
-- Existing member-uploaded profile pictures remain unchanged.
BEGIN;

ALTER TABLE public.profiles
  ALTER COLUMN avatar_url SET DEFAULT 'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg';

UPDATE public.profiles
SET avatar_url = 'https://raw.githubusercontent.com/ravaunrichards/Minglora-Social-Network/main/public/assets/default-profile-avatar-3d.svg'
WHERE avatar_url IS NULL OR btrim(avatar_url) = '';

COMMIT;
