-- AI identity profiles are private unless their owner explicitly selects public/follower visibility.
-- Keep the database default and the service-only create RPC aligned so bulk/API creation
-- cannot accidentally publish a profile when profile_visibility is omitted.

alter table ai_network.ai_profiles
  alter column profile_visibility set default 'private';

do $migration$
declare
  v_function_definition text;
  v_old_default text :=
    'case when v_profile->>''profile_visibility'' in (''public'', ''followers'', ''private'', ''hidden'') then v_profile->>''profile_visibility'' else ''public'' end';
  v_new_default text :=
    'case when v_profile->>''profile_visibility'' in (''public'', ''followers'', ''private'', ''hidden'') then v_profile->>''profile_visibility'' else ''private'' end';
  v_old_count integer;
begin
  select pg_get_functiondef(
    'public.minglora_ai_identity_command(text,uuid,jsonb)'::regprocedure
  )
  into v_function_definition;

  if v_function_definition is null then
    raise exception 'The existing Minglora AI identity command is missing; refusing to apply a partial privacy migration.';
  end if;

  v_old_count :=
    (length(v_function_definition) -
     length(replace(v_function_definition, v_old_default, ''))) /
    length(v_old_default);

  if v_old_count = 1 then
    execute replace(v_function_definition, v_old_default, v_new_default);
  elsif v_old_count = 0 and strpos(v_function_definition, v_new_default) > 0 then
    -- Safe to re-run when the function already has the private fallback.
    null;
  else
    raise exception 'The Minglora AI identity command does not match the expected visibility-default contract; refusing to rewrite it.';
  end if;
end;
$migration$;
