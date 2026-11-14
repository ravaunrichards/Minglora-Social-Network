-- Safe, auditable administrator management for AI identity categories.
-- Existing category keys remain immutable so identity foreign keys never break.
create table if not exists ai_network.ai_category_audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  category_key text not null references ai_network.ai_categories(category_key) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('created', 'updated', 'activated', 'deactivated')),
  before_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(before_snapshot) = 'object'),
  after_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(after_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists ai_category_audit_logs_category_created_idx
  on ai_network.ai_category_audit_logs (category_key, created_at desc);
create index if not exists ai_category_audit_logs_actor_created_idx
  on ai_network.ai_category_audit_logs (actor_user_id, created_at desc);

alter table ai_network.ai_category_audit_logs enable row level security;
revoke all on table ai_network.ai_category_audit_logs from public, anon, authenticated;
grant usage on schema ai_network to service_role;
grant select, insert on ai_network.ai_category_audit_logs to service_role;

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
  v_action text := lower(trim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_category_key text;
  v_display_name text;
  v_description text;
  v_sort_order integer;
  v_is_active boolean;
  v_row ai_network.ai_categories%rowtype;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_audit_action text;
  v_categories jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI category administration is restricted to the Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'AI category command payload must be a JSON object.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora administrator is required.';
  end if;

  if v_action = 'list_all' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.category_key), '[]'::jsonb)
      into v_categories
    from ai_network.ai_categories c;
    return jsonb_build_object('categories', v_categories);
  end if;

  v_category_key := lower(trim(coalesce(v_payload->>'category_key', '')));
  if v_category_key !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception using errcode = '22023', message = 'AI category key must use 2–64 lowercase letters, numbers or underscores and begin with a letter.';
  end if;

  if v_action = 'create' then
    v_display_name := left(trim(coalesce(v_payload->>'display_name', '')), 80);
    v_description := left(trim(coalesce(v_payload->>'description', '')), 1000);
    if length(v_display_name) < 2 then
      raise exception using errcode = '22023', message = 'AI category display name must contain at least two characters.';
    end if;
    if length(coalesce(v_payload->>'description', '')) > 1000 then
      raise exception using errcode = '22023', message = 'AI category description must be 1,000 characters or fewer.';
    end if;
    if coalesce(v_payload->>'sort_order', '0') !~ '^-?[0-9]{1,6}$' then
      raise exception using errcode = '22023', message = 'AI category sort order must be a whole number.';
    end if;
    v_sort_order := coalesce((v_payload->>'sort_order')::integer, 0);
    if v_sort_order < -100000 or v_sort_order > 100000 then
      raise exception using errcode = '22023', message = 'AI category sort order is outside the supported range.';
    end if;
    if v_payload ? 'is_active' and jsonb_typeof(v_payload->'is_active') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'AI category active state must be true or false.';
    end if;
    v_is_active := coalesce((v_payload->>'is_active')::boolean, true);

    insert into ai_network.ai_categories(category_key, display_name, description, sort_order, is_active)
    values (v_category_key, v_display_name, v_description, v_sort_order, v_is_active)
    returning * into v_row;
    v_after := to_jsonb(v_row);

    insert into ai_network.ai_category_audit_logs(category_key, actor_user_id, action, after_snapshot)
    values (v_category_key, p_actor_user_id, 'created', v_after);

    return jsonb_build_object('category', v_after);
  end if;

  if v_action not in ('update', 'activate', 'deactivate') then
    raise exception using errcode = '22023', message = 'Unsupported AI category command.';
  end if;

  select c.* into v_row
  from ai_network.ai_categories c
  where c.category_key = v_category_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI category was not found.';
  end if;
  v_before := to_jsonb(v_row);

  if v_action = 'activate' then
    v_is_active := true;
  elsif v_action = 'deactivate' then
    v_is_active := false;
  elsif v_payload ? 'is_active' then
    if jsonb_typeof(v_payload->'is_active') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'AI category active state must be true or false.';
    end if;
    v_is_active := (v_payload->>'is_active')::boolean;
  else
    v_is_active := v_row.is_active;
  end if;

  if v_action = 'update' and v_payload ? 'display_name' then
    v_display_name := left(trim(coalesce(v_payload->>'display_name', '')), 80);
    if length(v_display_name) < 2 then
      raise exception using errcode = '22023', message = 'AI category display name must contain at least two characters.';
    end if;
  else
    v_display_name := v_row.display_name;
  end if;
  if v_action = 'update' and v_payload ? 'description' then
    if length(coalesce(v_payload->>'description', '')) > 1000 then
      raise exception using errcode = '22023', message = 'AI category description must be 1,000 characters or fewer.';
    end if;
    v_description := trim(coalesce(v_payload->>'description', ''));
  else
    v_description := v_row.description;
  end if;
  if v_action = 'update' and v_payload ? 'sort_order' then
    if coalesce(v_payload->>'sort_order', '') !~ '^-?[0-9]{1,6}$' then
      raise exception using errcode = '22023', message = 'AI category sort order must be a whole number.';
    end if;
    v_sort_order := (v_payload->>'sort_order')::integer;
    if v_sort_order < -100000 or v_sort_order > 100000 then
      raise exception using errcode = '22023', message = 'AI category sort order is outside the supported range.';
    end if;
  else
    v_sort_order := v_row.sort_order;
  end if;

  update ai_network.ai_categories
  set display_name = v_display_name,
      description = v_description,
      sort_order = v_sort_order,
      is_active = v_is_active,
      updated_at = now()
  where category_key = v_category_key
  returning * into v_row;
  v_after := to_jsonb(v_row);

  v_audit_action := case
    when v_before->>'is_active' = 'false' and v_after->>'is_active' = 'true' then 'activated'
    when v_before->>'is_active' = 'true' and v_after->>'is_active' = 'false' then 'deactivated'
    else 'updated'
  end;
  insert into ai_network.ai_category_audit_logs(category_key, actor_user_id, action, before_snapshot, after_snapshot)
  values (v_category_key, p_actor_user_id, v_audit_action, v_before, v_after);

  return jsonb_build_object('category', v_after);
end;
$function$;

comment on function public.minglora_ai_category_command(text, uuid, jsonb)
  is 'Server-only AI category management. Category keys are immutable; mutations are audited and deactivation preserves historical identity references.';

revoke all on function public.minglora_ai_category_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_category_command(text, uuid, jsonb) to service_role;
