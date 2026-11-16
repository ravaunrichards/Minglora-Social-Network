-- Minglora 2026 catalogue cleanup.
-- Deactivate dated 2025 gifts without deleting transaction, earnings, or audit history.
BEGIN;
UPDATE public.live_gift_catalog
SET active = false
WHERE code IN (
  '2025-i2vjmu',
  '2025-love-1s1vcq',
  'gg-2025-1tff3lu',
  '2025-glasses-g595pq',
  '2025-joylens-z42pyw',
  'gamer-2025-4fyd0e',
  'celebrate-2025-1hsyrx',
  'extravaganza-2025-7o503e',
  'prime-power-2025-fsm6ac'
)
AND active = true;
COMMIT;
