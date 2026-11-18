-- Preserve owner-only access for private AI profile avatar and cover media.
-- Approved follows grant access only when profile_visibility is explicitly 'followers'.
-- This migration verifies the existing service-only media RPC and never broadens visibility.

do $migration$
declare
  v_function_definition text;
  v_allowed_visibility text := 'v_visibility not in (''public'', ''followers'')';
  v_followers_gate text := 'if v_visibility = ''followers'' and not exists (';
  v_unsafe_visibility text := 'v_visibility not in (''public'', ''followers'', ''private'')';
  v_unsafe_followers_gate text := 'if v_visibility in (''followers'', ''private'') and not exists (';
begin
  select pg_get_functiondef(
    'public.minglora_ai_identity_media_access(uuid,uuid,text)'::regprocedure
  )
  into v_function_definition;

  if v_function_definition is null then
    raise exception 'The existing AI profile media-access RPC is missing; refusing an unverified media privacy state.';
  end if;

  if strpos(v_function_definition, v_allowed_visibility) = 0
     or strpos(v_function_definition, v_followers_gate) = 0 then
    raise exception 'AI profile media access must keep private profiles owner-only and gate followers-only media on approved follows.';
  end if;

  if strpos(v_function_definition, v_unsafe_visibility) > 0
     or strpos(v_function_definition, v_unsafe_followers_gate) > 0 then
    raise exception 'Unsafe private-follower media access was detected; refusing to preserve the broadened visibility rule.';
  end if;
end;
$migration$;
