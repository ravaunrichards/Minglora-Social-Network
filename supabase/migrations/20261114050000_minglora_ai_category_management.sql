begin;

create table if not exists ai_network.ai_category_audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  category_key text not null references ai_network.ai_categories(category_key) on update cascade on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created', 'updated', 'activated', 'deactivated')),
  before_data jsonb not null default '{}'::jsonb check (jsonb_typeof(before_data) = 'object'),
  after_data jsonb not null default '{}'::jsonb check (jsonb_typeof(after_data) = 'object'),
  created_at timestamptz not null default now()
);

alter table ai_network.ai_category_audit_logs enable row level security;
revoke all on table ai_network.ai_category_audit_logs from public, anon, authenticated;
grant select, insert on table ai_network.ai_category_audit_logs to service_role;
grant usage on schema ai_network to service_role;

-- The category catalogue stays private to the server runtime. It may insert and update,
-- but it cannot delete categories or bypass the RPC's audit trail.
revoke all on table ai_network.ai_categories from public, anon, authenticated;
grant select, insert, update on table ai_network.ai_categories to service_role;

create index if not exists ai_category_audit_logs_category_created_idx
  on ai_network.ai_category_audit_logs(category_key, created_at desc);
create index if not exists ai_category_audit_logs_actor_created_idx
  on ai_network.ai_category_audit_logs(actor_user_id, created_at desc);

create or replace function public.minglora_ai_category_command(
  p_action text,
  p_actor_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action, ''));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_category_key text;
  v_display_name text;
  v_description text;
  v_sort_order integer;
  v_is_active boolean := true;
  v_existing ai_network.ai_categories%rowtype;
  v_saved ai_network.ai_categories%rowtype;
  v_before jsonb := '{}'::jsonb;
  v_audit_action text;
  v_audit_id uuid;
  v_active_count integer;
  v_exists boolean := false;
  v_categories jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI category commands are restricted to the Minglora server runtime.';
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI category command payload must be a JSON object.';
  end if;

  if v_action = 'list' then
    select coalesce(
      jsonb_agg(to_jsonb(c) order by c.sort_order, c.display_name, c.category_key),
      '[]'::jsonb
    )
    into v_categories
    from ai_network.ai_categories c;

    return jsonb_build_object('categories', v_categories, 'count', jsonb_array_length(v_categories));
  end if;

  if v_action <> 'save' then
    raise exception using errcode = '22023', message = 'Unsupported AI category command.';
  end if;

  v_category_key := lower(trim(coalesce(v_payload->>'category_key', '')));
  if v_category_key !~ '^[a-z][a-z0-9_]{1,63}
  from ai_network.ai_categories c
  where c.category_key = v_category_key
  for update;
  v_exists := found;

  v_display_name := left(trim(coalesce(nullif(v_payload->>'display_name', ''), case when v_exists then v_existing.display_name else '' end)), 80);
  if length(v_display_name) < 2 then
    raise exception using errcode = '22023', message = 'Category display name must contain between 2 and 80 characters.';
  end if;

  if v_payload ? 'description' then
    v_description := left(trim(coalesce(v_payload->>'description', '')), 400);
  else
    v_description := case when v_exists then v_existing.description else '' end;
  end if;

  if v_payload ? 'sort_order' then
    if coalesce(v_payload->>'sort_order', '') !~ '^[0-9]{1,6}$' then
      raise exception using errcode = '22023', message = 'Category sort order must be a non-negative integer.';
    end if;
    v_sort_order := (v_payload->>'sort_order')::integer;
  else
    v_sort_order := case when v_exists then v_existing.sort_order else 1000 end;
  end if;

  if v_payload ? 'is_active' then
    if jsonb_typeof(v_payload->'is_active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Category active status must be a boolean.';
    end if;
    v_is_active := (v_payload->>'is_active')::boolean;
  elsif v_exists then
    v_is_active := v_existing.is_active;
  end if;

  if v_exists then
    v_before := to_jsonb(v_existing);
    if v_existing.is_active and not v_is_active then
      select count(*)::integer into v_active_count
      from ai_network.ai_categories c
      where c.is_active = true;
      if v_active_count <= 1 then
        raise exception using errcode = '23514', message = 'At least one AI category must remain active.';
      end if;
    end if;

    update ai_network.ai_categories c
    set display_name = v_display_name,
        description = v_description,
        sort_order = v_sort_order,
        is_active = v_is_active,
        updated_at = now()
    where c.category_key = v_category_key
    returning c.* into v_saved;

    v_audit_action := case
      when v_existing.is_active and not v_saved.is_active then 'deactivated'
      when not v_existing.is_active and v_saved.is_active then 'activated'
      else 'updated'
    end;
  else
    insert into ai_network.ai_categories (
      category_key, display_name, description, sort_order, is_active
    )
    values (
      v_category_key, v_display_name, v_description, v_sort_order, v_is_active
    )
    returning * into v_saved;
    v_audit_action := 'created';
  end if;

  insert into ai_network.ai_category_audit_logs (
    category_key, actor_user_id, action, before_data, after_data
  )
  values (
    v_category_key, p_actor_user_id, v_audit_action, v_before, to_jsonb(v_saved)
  )
  returning audit_id into v_audit_id;

  return jsonb_build_object(
    'category', to_jsonb(v_saved),
    'action', v_audit_action,
    'audit_id', v_audit_id,
    'created', v_audit_action = 'created'
  );
end;
$function$;

revoke all on function public.minglora_ai_category_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_category_command(text, uuid, jsonb) to service_role;

commit;
 then
    raise exception using errcode = '22023', message = 'Category key must start with a letter and contain 2 to 64 lowercase letters, numbers or underscores.';
  end if;

  -- Serialize category writes so two administrators cannot concurrently deactivate
  -- the final active categories after both observe the same pre-update count.
  lock table ai_network.ai_categories in share row exclusive mode;

  select c.*
  into v_existing
  from ai_network.ai_categories c
  where c.category_key = v_category_key
  for update;
  v_exists := found;

  v_display_name := left(trim(coalesce(nullif(v_payload->>'display_name', ''), case when v_exists then v_existing.display_name else '' end)), 80);
  if length(v_display_name) < 2 then
    raise exception using errcode = '22023', message = 'Category display name must contain between 2 and 80 characters.';
  end if;

  if v_payload ? 'description' then
    v_description := left(trim(coalesce(v_payload->>'description', '')), 400);
  else
    v_description := case when v_exists then v_existing.description else '' end;
  end if;

  if v_payload ? 'sort_order' then
    if coalesce(v_payload->>'sort_order', '') !~ '^[0-9]{1,6}$' then
      raise exception using errcode = '22023', message = 'Category sort order must be a non-negative integer.';
    end if;
    v_sort_order := (v_payload->>'sort_order')::integer;
  else
    v_sort_order := case when v_exists then v_existing.sort_order else 1000 end;
  end if;

  if v_payload ? 'is_active' then
    if jsonb_typeof(v_payload->'is_active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Category active status must be a boolean.';
    end if;
    v_is_active := (v_payload->>'is_active')::boolean;
  elsif v_exists then
    v_is_active := v_existing.is_active;
  end if;

  if v_exists then
    v_before := to_jsonb(v_existing);
    if v_existing.is_active and not v_is_active then
      select count(*)::integer into v_active_count
      from ai_network.ai_categories c
      where c.is_active = true;
      if v_active_count <= 1 then
        raise exception using errcode = '23514', message = 'At least one AI category must remain active.';
      end if;
    end if;

    update ai_network.ai_categories c
    set display_name = v_display_name,
        description = v_description,
        sort_order = v_sort_order,
        is_active = v_is_active,
        updated_at = now()
    where c.category_key = v_category_key
    returning c.* into v_saved;

    v_audit_action := case
      when v_existing.is_active and not v_saved.is_active then 'deactivated'
      when not v_existing.is_active and v_saved.is_active then 'activated'
      else 'updated'
    end;
  else
    insert into ai_network.ai_categories (
      category_key, display_name, description, sort_order, is_active
    )
    values (
      v_category_key, v_display_name, v_description, v_sort_order, v_is_active
    )
    returning * into v_saved;
    v_audit_action := 'created';
  end if;

  insert into ai_network.ai_category_audit_logs (
    category_key, actor_user_id, action, before_data, after_data
  )
  values (
    v_category_key, p_actor_user_id, v_audit_action, v_before, to_jsonb(v_saved)
  )
  returning audit_id into v_audit_id;

  return jsonb_build_object(
    'category', to_jsonb(v_saved),
    'action', v_audit_action,
    'audit_id', v_audit_id,
    'created', v_audit_action = 'created'
  );
end;
$function$;

revoke all on function public.minglora_ai_category_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_category_command(text, uuid, jsonb) to service_role;

commit;
 then
    raise exception using errcode = '22023', message = 'Category key must start with a letter and contain 2 to 64 lowercase letters, numbers or underscores.';
  end if;

  -- Serialize writes so concurrent administrators cannot deactivate the final active category.
  lock table ai_network.ai_categories in share row exclusive mode;

  select c.*
  into v_existing
  from ai_network.ai_categories c
  where c.category_key = v_category_key
  for update;
  v_exists := found;

  v_display_name := left(trim(coalesce(nullif(v_payload->>'display_name', ''), case when v_exists then v_existing.display_name else '' end)), 80);
  if length(v_display_name) < 2 then
    raise exception using errcode = '22023', message = 'Category display name must contain between 2 and 80 characters.';
  end if;

  if v_payload ? 'description' then
    v_description := left(trim(coalesce(v_payload->>'description', '')), 400);
  else
    v_description := case when v_exists then v_existing.description else '' end;
  end if;

  if v_payload ? 'sort_order' then
    if coalesce(v_payload->>'sort_order', '') !~ '^[0-9]{1,6}$' then
      raise exception using errcode = '22023', message = 'Category sort order must be a non-negative integer.';
    end if;
    v_sort_order := (v_payload->>'sort_order')::integer;
  else
    v_sort_order := case when v_exists then v_existing.sort_order else 1000 end;
  end if;

  if v_payload ? 'is_active' then
    if jsonb_typeof(v_payload->'is_active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Category active status must be a boolean.';
    end if;
    v_is_active := (v_payload->>'is_active')::boolean;
  elsif v_exists then
    v_is_active := v_existing.is_active;
  end if;

  if v_exists then
    v_before := to_jsonb(v_existing);
    if v_existing.is_active and not v_is_active then
      select count(*)::integer into v_active_count
      from ai_network.ai_categories c
      where c.is_active = true;
      if v_active_count <= 1 then
        raise exception using errcode = '23514', message = 'At least one AI category must remain active.';
      end if;
    end if;

    update ai_network.ai_categories c
    set display_name = v_display_name,
        description = v_description,
        sort_order = v_sort_order,
        is_active = v_is_active,
        updated_at = now()
    where c.category_key = v_category_key
    returning c.* into v_saved;

    v_audit_action := case
      when v_existing.is_active and not v_saved.is_active then 'deactivated'
      when not v_existing.is_active and v_saved.is_active then 'activated'
      else 'updated'
    end;
  else
    insert into ai_network.ai_categories (
      category_key, display_name, description, sort_order, is_active
    )
    values (
      v_category_key, v_display_name, v_description, v_sort_order, v_is_active
    )
    returning * into v_saved;
    v_audit_action := 'created';
  end if;

  insert into ai_network.ai_category_audit_logs (
    category_key, actor_user_id, action, before_data, after_data
  )
  values (
    v_category_key, p_actor_user_id, v_audit_action, v_before, to_jsonb(v_saved)
  )
  returning audit_id into v_audit_id;

  return jsonb_build_object(
    'category', to_jsonb(v_saved),
    'action', v_audit_action,
    'audit_id', v_audit_id,
    'created', v_audit_action = 'created'
  );
end;
$function$;

revoke all on function public.minglora_ai_category_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_category_command(text, uuid, jsonb) to service_role;

commit;
 then
    raise exception using errcode = '22023', message = 'Category key must start with a letter and contain 2 to 64 lowercase letters, numbers or underscores.';
  end if;

  -- Serialize category writes so two administrators cannot concurrently deactivate
  -- the final active categories after both observe the same pre-update count.
  lock table ai_network.ai_categories in share row exclusive mode;

  select c.*
  into v_existing
  from ai_network.ai_categories c
  where c.category_key = v_category_key
  for update;
  v_exists := found;

  v_display_name := left(trim(coalesce(nullif(v_payload->>'display_name', ''), case when v_exists then v_existing.display_name else '' end)), 80);
  if length(v_display_name) < 2 then
    raise exception using errcode = '22023', message = 'Category display name must contain between 2 and 80 characters.';
  end if;

  if v_payload ? 'description' then
    v_description := left(trim(coalesce(v_payload->>'description', '')), 400);
  else
    v_description := case when v_exists then v_existing.description else '' end;
  end if;

  if v_payload ? 'sort_order' then
    if coalesce(v_payload->>'sort_order', '') !~ '^[0-9]{1,6}$' then
      raise exception using errcode = '22023', message = 'Category sort order must be a non-negative integer.';
    end if;
    v_sort_order := (v_payload->>'sort_order')::integer;
  else
    v_sort_order := case when v_exists then v_existing.sort_order else 1000 end;
  end if;

  if v_payload ? 'is_active' then
    if jsonb_typeof(v_payload->'is_active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Category active status must be a boolean.';
    end if;
    v_is_active := (v_payload->>'is_active')::boolean;
  elsif v_exists then
    v_is_active := v_existing.is_active;
  end if;

  if v_exists then
    v_before := to_jsonb(v_existing);
    if v_existing.is_active and not v_is_active then
      select count(*)::integer into v_active_count
      from ai_network.ai_categories c
      where c.is_active = true;
      if v_active_count <= 1 then
        raise exception using errcode = '23514', message = 'At least one AI category must remain active.';
      end if;
    end if;

    update ai_network.ai_categories c
    set display_name = v_display_name,
        description = v_description,
        sort_order = v_sort_order,
        is_active = v_is_active,
        updated_at = now()
    where c.category_key = v_category_key
    returning c.* into v_saved;

    v_audit_action := case
      when v_existing.is_active and not v_saved.is_active then 'deactivated'
      when not v_existing.is_active and v_saved.is_active then 'activated'
      else 'updated'
    end;
  else
    insert into ai_network.ai_categories (
      category_key, display_name, description, sort_order, is_active
    )
    values (
      v_category_key, v_display_name, v_description, v_sort_order, v_is_active
    )
    returning * into v_saved;
    v_audit_action := 'created';
  end if;

  insert into ai_network.ai_category_audit_logs (
    category_key, actor_user_id, action, before_data, after_data
  )
  values (
    v_category_key, p_actor_user_id, v_audit_action, v_before, to_jsonb(v_saved)
  )
  returning audit_id into v_audit_id;

  return jsonb_build_object(
    'category', to_jsonb(v_saved),
    'action', v_audit_action,
    'audit_id', v_audit_id,
    'created', v_audit_action = 'created'
  );
end;
$function$;

revoke all on function public.minglora_ai_category_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_category_command(text, uuid, jsonb) to service_role;

commit;
