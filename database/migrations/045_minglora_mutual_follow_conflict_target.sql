BEGIN;

-- The friendships table uses a unique expression index for unordered pairs:
-- (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id)).
-- PostgreSQL requires that expression index to be named in the ON CONFLICT target.
CREATE OR REPLACE FUNCTION public.minglora_sync_mutual_follow_friendship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  first_id uuid;
  second_id uuid;
BEGIN
  first_id := least(
    coalesce(NEW.follower_id, OLD.follower_id),
    coalesce(NEW.followed_id, OLD.followed_id)
  );
  second_id := greatest(
    coalesce(NEW.follower_id, OLD.follower_id),
    coalesce(NEW.followed_id, OLD.followed_id)
  );

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1
      FROM public.user_follows AS f
      WHERE f.follower_id = NEW.followed_id
        AND f.followed_id = NEW.follower_id
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks AS b
      WHERE (b.blocker_id = NEW.follower_id AND b.blocked_id = NEW.followed_id)
         OR (b.blocker_id = NEW.followed_id AND b.blocked_id = NEW.follower_id)
    ) THEN
      INSERT INTO public.friendships (
        requester_id,
        recipient_id,
        status,
        source
      )
      VALUES (first_id, second_id, 'accepted', 'mutual_follow')
      ON CONFLICT (
        (LEAST(requester_id, recipient_id)),
        (GREATEST(requester_id, recipient_id))
      )
      DO UPDATE SET
        status = 'accepted',
        source = 'mutual_follow',
        updated_at = now();
    END IF;

    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_follows AS f
    WHERE (f.follower_id = first_id AND f.followed_id = second_id)
       OR (f.follower_id = second_id AND f.followed_id = first_id)
    GROUP BY f.follower_id, f.followed_id
    HAVING count(*) = 2
  ) THEN
    DELETE FROM public.friendships AS fs
    WHERE least(fs.requester_id, fs.recipient_id) = first_id
      AND greatest(fs.requester_id, fs.recipient_id) = second_id
      AND fs.source = 'mutual_follow';
  END IF;

  RETURN OLD;
END;
$function$;

COMMIT;