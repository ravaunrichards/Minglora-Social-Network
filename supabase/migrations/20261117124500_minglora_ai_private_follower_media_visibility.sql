-- Keep signed AI avatar/cover access consistent with approved private followers.
-- This edits only the two known visibility checks in the existing service-only media RPC.

do $migration$
declare
  v_function_definition text;
  v_old_visibility text := 'v_visibility not in (''public'', ''followers'')';
  v_new_visibility text := 'v_visibility not in (''public'', ''followers'', ''private'')';
  v_old_follow text := 'if v_visibility = ''followers'' and not exists (';
  v_new_follow text := 'if v_visibility in (''followers'', ''private'') and not exists (';
  v_old_count integer;
  v_new_count integer;
  v_changed boolean := false;
begin
  select pg_get_functiondef(
    'public.minglora_ai_identity_media_access(uuid,uuid,text)'::regprocedure
  )
  into v_function_definition;

  if v_function_definition is null then
    raise exception 'The existing AI profile media-access RPC is missing; refusing a partial privacy migration.';
  end if;

  v_old_count :=
    (length(v_function_definition) -
     length(replace(v_function_definition, v_old_visibility, ''))) /
    length(v_old_visibility);
  v_new_count :=
    (length(v_function_definition) -
     length(replace(v_function_definition, v_new_visibility, ''))) /
    length(v_new_visibility);

  if v_old_count = 1 and v_new_count = 0 then
    v_function_definition := replace(v_function_definition, v_old_visibility, v_new_visibility);
    v_changed := true;
  elsif not (v_old_count = 0 and v_new_count = 1) then
    raise exception 'The AI profile media-access visibility check does not match the expected contract; refusing to rewrite it.';
  end if;

  v_old_count :=
    (length(v_function_definition) -
     length(replace(v_function_definition, v_old_follow, ''))) /
    length(v_old_follow);
  v_new_count :=
    (length(v_function_definition) -
     length(replace(v_function_definition, v_new_follow, ''))) /
    length(v_new_follow);

  if v_old_count = 1 and v_new_count = 0 then
    v_function_definition := replace(v_function_definition, v_old_follow, v_new_follow);
    v_changed := true;
  elsif not (v_old_count = 0 and v_new_count = 1) then
    raise exception 'The AI profile media-access follow check does not match the expected contract; refusing to rewrite it.';
  end if;

  if v_changed then
    execute v_function_definition;
  end if;
end;
$migration$;
