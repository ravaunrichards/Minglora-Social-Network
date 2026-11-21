-- Owner-visible legacy AI identity fallback profiles and grouped batch history.
-- No identities are inserted, enabled, or made public by this migration.

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_batch_command(p_action text, p_actor_user_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_items jsonb;
  v_item record;
  v_row ai_network.ai_identity_batch_rows%rowtype;
  v_batch ai_network.ai_identity_batches%rowtype;
  v_batch_id uuid;
  v_batch_key text;
  v_fingerprint text;
  v_source text;
  v_result jsonb;
  v_identity_id uuid;
  v_error_code text;
  v_error_message text;
  v_created integer := 0;
  v_reused integer := 0;
  v_failed integer := 0;
  v_limit integer;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI identity batch operations are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora owner is required for AI identity batches.';
  end if;
  if jsonb_typeof(v_payload)<>'object'
     or v_payload::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode='22023',message='AI identity batches cannot contain credentials or secret fields.';
  end if;

  if v_action='create_batch' then
    v_batch_key := trim(coalesce(v_payload->>'batch_idempotency_key',''));
    v_source := left(trim(coalesce(v_payload->>'source','admin_center')),80);
    v_items := v_payload->'items';
    if length(v_batch_key)<8 or length(v_batch_key)>160 then
      raise exception using errcode='22023',message='A batch idempotency key between 8 and 160 characters is required.';
    end if;
    if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>100 then
      raise exception using errcode='22023',message='An AI identity batch must contain between 1 and 100 records.';
    end if;
    if octet_length(v_items::text)>180000 then
      raise exception using errcode='22023',message='The AI identity batch is too large to retain safely.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) x(value)
      where jsonb_typeof(x.value)<>'object'
    ) then
      raise exception using errcode='22023',message='Every AI identity batch row must be a JSON object.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) x(value)
      where length(trim(coalesce(x.value->>'idempotency_key','')))<8
         or length(trim(coalesce(x.value->>'idempotency_key','')))>160
    ) then
      raise exception using errcode='22023',message='Every AI identity row requires its own idempotency key between 8 and 160 characters.';
    end if;
    if (
      select count(distinct trim(x.value->>'idempotency_key'))
      from jsonb_array_elements(v_items) x(value)
    ) <> jsonb_array_length(v_items) then
      raise exception using errcode='22023',message='Duplicate row idempotency keys are not allowed within one batch.';
    end if;
    v_fingerprint := pg_catalog.md5(v_items::text);

    insert into ai_network.ai_identity_batches(
      owner_user_id,idempotency_key,request_fingerprint,source,status,requested_count,
      created_count,reused_count,failed_count
    ) values (
      p_actor_user_id,v_batch_key,v_fingerprint,coalesce(nullif(v_source,''),'admin_center'),
      'failed',jsonb_array_length(v_items),0,0,jsonb_array_length(v_items)
    )
    on conflict (owner_user_id,idempotency_key) do nothing
    returning * into v_batch;

    if v_batch.batch_id is null then
      select * into v_batch
      from ai_network.ai_identity_batches b
      where b.owner_user_id=p_actor_user_id and b.idempotency_key=v_batch_key
      for update;
      if v_batch.request_fingerprint<>v_fingerprint then
        raise exception using errcode='23505',message='This batch idempotency key was already used for different identity rows.';
      end if;
      select jsonb_build_object(
        'batch_id',b.batch_id,'idempotency_key',b.idempotency_key,'status',b.status,
        'requested_count',b.requested_count,'created_count',b.created_count,
        'reused_count',b.reused_count,'succeeded_count',b.created_count+b.reused_count,
        'failed_count',b.failed_count,
        'failed_rows',coalesce((
          select jsonb_agg(jsonb_build_object(
            'row_index',r.row_index,'idempotency_key',r.row_idempotency_key,
            'status',r.status,'error_code',r.error_code,'error',r.error_message,
            'attempt_count',r.attempt_count
          ) order by r.row_index)
          from ai_network.ai_identity_batch_rows r
          where r.batch_id=b.batch_id and r.owner_user_id=p_actor_user_id and r.status='failed'
        ),'[]'::jsonb)
      ) into v_result
      from ai_network.ai_identity_batches b where b.batch_id=v_batch.batch_id;
      return v_result || jsonb_build_object('replayed',true);
    end if;

    v_batch_id := v_batch.batch_id;
    for v_item in
      select x.value,x.ordinality::integer as row_index
      from jsonb_array_elements(v_items) with ordinality x(value,ordinality)
      order by x.ordinality
    loop
      insert into ai_network.ai_identity_batch_rows(
        batch_id,owner_user_id,row_index,row_idempotency_key,status,request_payload
      ) values (
        v_batch_id,p_actor_user_id,v_item.row_index,
        trim(v_item.value->>'idempotency_key'),'pending',v_item.value
      );

      begin
        v_result := public.minglora_ai_identity_command('create',p_actor_user_id,v_item.value);
        v_identity_id := nullif(v_result #>> '{identity,identity_id}','')::uuid;
        if v_identity_id is null then
          raise exception using errcode='P0001',message='The identity writer returned no canonical identity ID.';
        end if;
        if coalesce((v_result->>'reused')::boolean,false) then
          update ai_network.ai_identity_batch_rows r
          set status='reused',identity_id=v_identity_id,request_payload=null,
              attempt_count=1,error_code='',error_message='',updated_at=now()
          where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id and r.row_index=v_item.row_index;
          v_reused := v_reused+1;
        else
          update ai_network.ai_identity_batch_rows r
          set status='created',identity_id=v_identity_id,request_payload=null,
              attempt_count=1,error_code='',error_message='',updated_at=now()
          where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id and r.row_index=v_item.row_index;
          v_created := v_created+1;
        end if;
      exception when others then
        get stacked diagnostics v_error_code=returned_sqlstate,v_error_message=message_text;
        update ai_network.ai_identity_batch_rows r
        set status='failed',request_payload=v_item.value,attempt_count=1,
            error_code=left(coalesce(v_error_code,''),20),
            error_message=left(coalesce(v_error_message,'AI identity creation failed.'),240),
            updated_at=now()
        where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id and r.row_index=v_item.row_index;
        v_failed := v_failed+1;
      end;
    end loop;

    update ai_network.ai_identity_batches b
    set created_count=v_created,reused_count=v_reused,failed_count=v_failed,
        status=case when v_failed=0 then 'completed' when v_created+v_reused=0 then 'failed' else 'partial' end,
        updated_at=now()
    where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id
    returning * into v_batch;

    insert into ai_network.ai_identity_batch_events(
      batch_id,owner_user_id,actor_user_id,event_type,metadata
    ) values (
      v_batch_id,p_actor_user_id,p_actor_user_id,'batch_created',
      jsonb_build_object('requested_count',v_batch.requested_count,'created_count',v_created,'reused_count',v_reused,'failed_count',v_failed)
    );

  elsif v_action='retry_failed' then
    if coalesce(v_payload->>'batch_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI identity batch ID is required.';
    end if;
    v_batch_id := (v_payload->>'batch_id')::uuid;
    select * into v_batch from ai_network.ai_identity_batches b
    where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id
    for update;
    if v_batch.batch_id is null then
      raise exception using errcode='P0002',message='The AI identity batch was not found for this owner.';
    end if;
    for v_row in
      select r.* from ai_network.ai_identity_batch_rows r
      where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id
        and r.status='failed' and r.request_payload is not null and r.attempt_count<25
      order by r.row_index
      for update
    loop
      begin
        v_result := public.minglora_ai_identity_command('create',p_actor_user_id,v_row.request_payload);
        v_identity_id := nullif(v_result #>> '{identity,identity_id}','')::uuid;
        if v_identity_id is null then
          raise exception using errcode='P0001',message='The identity writer returned no canonical identity ID.';
        end if;
        update ai_network.ai_identity_batch_rows r
        set status=case when coalesce((v_result->>'reused')::boolean,false) then 'reused' else 'created' end,
            identity_id=v_identity_id,request_payload=null,attempt_count=r.attempt_count+1,
            error_code='',error_message='',updated_at=now()
        where r.batch_row_id=v_row.batch_row_id;
      exception when others then
        get stacked diagnostics v_error_code=returned_sqlstate,v_error_message=message_text;
        update ai_network.ai_identity_batch_rows r
        set status='failed',attempt_count=r.attempt_count+1,
            error_code=left(coalesce(v_error_code,''),20),
            error_message=left(coalesce(v_error_message,'AI identity retry failed.'),240),
            updated_at=now()
        where r.batch_row_id=v_row.batch_row_id;
      end;
    end loop;

    select
      count(*) filter(where r.status='created')::integer,
      count(*) filter(where r.status='reused')::integer,
      count(*) filter(where r.status='failed')::integer
    into v_created,v_reused,v_failed
    from ai_network.ai_identity_batch_rows r
    where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id;

    update ai_network.ai_identity_batches b
    set created_count=v_created,reused_count=v_reused,failed_count=v_failed,
        status=case when v_failed=0 then 'completed' when v_created+v_reused=0 then 'failed' else 'partial' end,
        updated_at=now()
    where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id
    returning * into v_batch;

    insert into ai_network.ai_identity_batch_events(
      batch_id,owner_user_id,actor_user_id,event_type,metadata
    ) values (
      v_batch_id,p_actor_user_id,p_actor_user_id,'batch_retry_completed',
      jsonb_build_object('created_count',v_created,'reused_count',v_reused,'failed_count',v_failed)
    );

  elsif v_action='list_batches' then
    v_limit:=greatest(1,least(coalesce(nullif(v_payload->>'limit','')::integer,10),50));
    with batch_items as (
      select max(b.created_at) as created_at,b.source as sort_key,
       jsonb_build_object('batch_id','BATCH '||upper(right(b.source,2))||' — '||
        to_char(sum(b.requested_count)::bigint,'FM999,999,999,999')||' identities ('||count(*)::integer||' chunks)',
        'idempotency_key',b.source,'source',b.source,
        'status',case when sum(b.failed_count)=0 then 'completed' else 'partial' end,
        'requested_count',sum(b.requested_count)::bigint,'created_count',sum(b.created_count)::bigint,
        'reused_count',sum(b.reused_count)::bigint,'succeeded_count',sum(b.created_count+b.reused_count)::bigint,
        'failed_count',sum(b.failed_count)::bigint,'created_at',max(b.created_at),'updated_at',max(b.updated_at),
        'failed_rows','[]'::jsonb) as batch_json
      from ai_network.ai_identity_batches b
      where b.owner_user_id=p_actor_user_id and b.source ~ '^legacy_reconciliation_b[0-9]{2}$'
      group by b.source
      union all
      select b.created_at,b.source,
       jsonb_build_object('batch_id',b.batch_id,'idempotency_key',b.idempotency_key,'source',b.source,
        'status',b.status,'requested_count',b.requested_count,'created_count',b.created_count,
        'reused_count',b.reused_count,'succeeded_count',b.created_count+b.reused_count,
        'failed_count',b.failed_count,'created_at',b.created_at,'updated_at',b.updated_at,
        'failed_rows',coalesce((select jsonb_agg(jsonb_build_object(
          'row_index',r.row_index,'idempotency_key',r.row_idempotency_key,'status',r.status,
          'error_code',r.error_code,'error',r.error_message,'attempt_count',r.attempt_count) order by r.row_index)
          from ai_network.ai_identity_batch_rows r
          where r.batch_id=b.batch_id and r.owner_user_id=p_actor_user_id and r.status='failed'),'[]'::jsonb))
      from ai_network.ai_identity_batches b
      where b.owner_user_id=p_actor_user_id and b.source not like 'legacy_reconciliation_b%'
      union all
      select null::timestamptz,'legacy_reconciliation_b07',
       jsonb_build_object('batch_id','BATCH 07 — not imported','idempotency_key','legacy_reconciliation_b07',
        'source','legacy_reconciliation_b07','status','not_imported','requested_count',0,'created_count',0,
        'reused_count',0,'succeeded_count',0,'failed_count',0,'created_at',null,'updated_at',null,'failed_rows','[]'::jsonb)
      where exists(select 1 from ai_network.ai_identity_batches x where x.owner_user_id=p_actor_user_id)
       and not exists(select 1 from ai_network.ai_identity_batches x where x.owner_user_id=p_actor_user_id and x.source='legacy_reconciliation_b07')
    ),
    recent as (
      select created_at,sort_key,batch_json from batch_items
      order by coalesce(created_at,'-infinity'::timestamptz) desc,sort_key limit v_limit
    )
    select coalesce(jsonb_agg(batch_json order by coalesce(created_at,'-infinity'::timestamptz) desc,sort_key),'[]'::jsonb)
      into v_result from recent;
    return jsonb_build_object('batches',coalesce(v_result,'[]'::jsonb),'count',jsonb_array_length(coalesce(v_result,'[]'::jsonb)));
  else
    raise exception using errcode='22023',message='Unsupported AI identity batch command.';
  end if;

  select jsonb_build_object(
    'batch_id',b.batch_id,'idempotency_key',b.idempotency_key,'source',b.source,
    'status',b.status,'requested_count',b.requested_count,
    'created_count',b.created_count,'reused_count',b.reused_count,
    'succeeded_count',b.created_count+b.reused_count,'failed_count',b.failed_count,
    'created_at',b.created_at,'updated_at',b.updated_at,
    'failed_rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'row_index',r.row_index,'idempotency_key',r.row_idempotency_key,
        'status',r.status,'error_code',r.error_code,'error',r.error_message,
        'attempt_count',r.attempt_count
      ) order by r.row_index)
      from ai_network.ai_identity_batch_rows r
      where r.batch_id=b.batch_id and r.owner_user_id=p_actor_user_id and r.status='failed'
    ),'[]'::jsonb)
  ) into v_result
  from ai_network.ai_identity_batches b
  where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id;

  return v_result || jsonb_build_object('replayed',false);
end;
$function$;
comment on function public.minglora_ai_identity_batch_command(text,uuid,jsonb) is 'Owner-scoped durable batch import and retry; legacy 100k groups are returned as grouped 100-row chunk summaries.';
revoke all on function public.minglora_ai_identity_batch_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_batch_command(text,uuid,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_profile_registry(p_actor_user_id uuid, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
 v_offset integer:=greatest(coalesce(p_offset,0),0);
 v_search text:=left(trim(coalesce(p_search,'')),120);
 v_total bigint; v_rows jsonb;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='AI identity registry access is restricted to the Minglora server runtime.'; end if;
 if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
  raise exception using errcode='42501',message='A valid signed-in Minglora owner is required.';
 end if;
 select count(*) into v_total
 from ai_network.ai_identities i join ai_network.ai_categories c on c.category_key=i.category_key
 left join ai_network.ai_names n on n.identity_id=i.identity_id
 where i.owner_user_id=p_actor_user_id and (
  v_search='' or coalesce(n.username,'mlai_'||substr(md5(i.identity_id::text),1,25)) ilike '%'||v_search||'%' or
  coalesce(n.display_name,c.display_name||' '||upper(coalesce(nullif(split_part(i.idempotency_key,'-',3),''),'legacy'))||
   ' #'||right(coalesce(i.idempotency_key,i.identity_id::text),6)) ilike '%'||v_search||'%' or
  coalesce(n.first_name,'Minglora AI') ilike '%'||v_search||'%' or
  coalesce(n.last_name,right(coalesce(i.idempotency_key,i.identity_id::text),6)) ilike '%'||v_search||'%'
 );
 select coalesce(jsonb_agg(q.record order by q.created_at desc,q.identity_id),'[]'::jsonb) into v_rows
 from (
  select i.created_at,i.identity_id,jsonb_build_object(
   'identity',to_jsonb(i),
   'name',coalesce(to_jsonb(n),jsonb_build_object(
    'identity_id',i.identity_id,'first_name','Minglora AI',
    'middle_name',upper(coalesce(nullif(split_part(i.idempotency_key,'-',3),''),'legacy')),
    'last_name',right(coalesce(i.idempotency_key,i.identity_id::text),6),
    'full_name','Minglora AI '||upper(coalesce(nullif(split_part(i.idempotency_key,'-',3),''),'legacy'))||' '||right(coalesce(i.idempotency_key,i.identity_id::text),6),
    'display_name',c.display_name||' '||upper(coalesce(nullif(split_part(i.idempotency_key,'-',3),''),'legacy'))||' #'||right(coalesce(i.idempotency_key,i.identity_id::text),6),
    'username','mlai_'||substr(md5(i.identity_id::text),1,25),
    'profile_identifier','MINGLORA-AI-'||replace(i.identity_id::text,'-',''),
    'created_at',i.created_at,'updated_at',i.updated_at
   )),
   'profile',coalesce(to_jsonb(p),jsonb_build_object(
    'identity_id',i.identity_id,
    'bio','AI identity for the '||c.display_name||' category. Clearly labelled as AI; not a human account.',
    'introduction','I am an AI identity in Minglora. This profile is generated from an existing identity record. It remains private, disabled and pending review.',
    'gender','prefer_not_to_say','gender_presentation','AI identity','nationality','',
    'country_of_origin',null,'current_country',null,'state_province','','parish_county','','district','','city','','town','',
    'time_zone','UTC','personality',jsonb_build_object('role',c.display_name,'disclosure','AI','autonomous_execution',false,'profile_generated',true),
    'interests','[]'::jsonb,'hobbies','[]'::jsonb,'education','[]'::jsonb,'qualifications','[]'::jsonb,
    'profession',c.display_name,'skills','[]'::jsonb,'voice_preferences','{}'::jsonb,
    'avatar_storage_ref',null,'cover_storage_ref',null,'profile_visibility','private',
    'extra_profile_data',jsonb_build_object('identity_kind','AI','disclosure','clearly_labelled_AI',
      'source','legacy_identity_reconciliation','profile_status','virtual_pending_review',
      'autonomous_execution_enabled',false,'public_visibility_enabled',false),
    'created_at',i.created_at,'updated_at',i.updated_at
   )),
   'primary_email',(select jsonb_build_object('email_address',e.email_address,'email_type',e.email_type,
     'verification_status',e.verification_status,'provisioning_status',e.provisioning_status,'email_status',e.email_status)
     from ai_network.ai_emails e where e.identity_id=i.identity_id and e.is_primary=true limit 1),
   'languages',coalesce((select jsonb_agg(to_jsonb(l) order by l.is_primary desc,l.language_tag)
     from ai_network.ai_identity_languages l where l.identity_id=i.identity_id),'[]'::jsonb),
   'locations',coalesce((select jsonb_agg(to_jsonb(loc) order by loc.location_type,loc.created_at)
     from ai_network.ai_identity_locations loc where loc.identity_id=i.identity_id),'[]'::jsonb)
  ) as record
  from ai_network.ai_identities i join ai_network.ai_categories c on c.category_key=i.category_key
  left join ai_network.ai_names n on n.identity_id=i.identity_id
  left join ai_network.ai_profiles p on p.identity_id=i.identity_id
  where i.owner_user_id=p_actor_user_id and (
   v_search='' or coalesce(n.username,'mlai_'||substr(md5(i.identity_id::text),1,25)) ilike '%'||v_search||'%' or
   coalesce(n.display_name,c.display_name||' '||upper(coalesce(nullif(split_part(i.idempotency_key,'-',3),''),'legacy'))||
    ' #'||right(coalesce(i.idempotency_key,i.identity_id::text),6)) ilike '%'||v_search||'%' or
   coalesce(n.first_name,'Minglora AI') ilike '%'||v_search||'%' or
   coalesce(n.last_name,right(coalesce(i.idempotency_key,i.identity_id::text),6)) ilike '%'||v_search||'%'
  )
  order by i.created_at desc,i.identity_id limit v_limit offset v_offset
 ) q;
 return jsonb_build_object('identities',v_rows,'total',v_total,'limit',v_limit,'offset',v_offset);
end;$function$;
comment on function public.minglora_ai_identity_profile_registry(uuid,integer,integer,text) is 'Owner-scoped AI identity registry with clearly disclosed private virtual profile fallbacks for legacy records.';
revoke all on function public.minglora_ai_identity_profile_registry(uuid,integer,integer,text) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_profile_registry(uuid,integer,integer,text) to service_role;

CREATE OR REPLACE FUNCTION public.minglora_ai_identity_profile_update(p_actor_user_id uuid, p_identity_id uuid, p_name jsonb, p_profile jsonb, p_languages jsonb DEFAULT '[]'::jsonb, p_locations jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_identity ai_network.ai_identities%rowtype;
  v_name_row ai_network.ai_names%rowtype;
  v_profile_row ai_network.ai_profiles%rowtype;
  v_item jsonb;
  v_first_name text;
  v_middle_name text;
  v_last_name text;
  v_full_name text;
  v_display_name text;
  v_username text;
  v_gender text;
  v_visibility text;
  v_country_origin text;
  v_current_country text;
  v_time_zone text;
  v_language_tag text;
  v_language_name text;
  v_dialect text;
  v_proficiency text;
  v_is_primary boolean;
  v_primary_seen boolean := false;
  v_location_type text;
  v_country_code text;
  v_version bigint;
  v_snapshot jsonb;
  v_batch_code text;
  v_sequence text;
  v_category_display text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI identity profile updates are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;
  if p_identity_id is null then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end if;
  if jsonb_typeof(p_name) is distinct from 'object' or jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'AI name and profile updates must be JSON objects.';
  end if;
  if jsonb_typeof(p_languages) is distinct from 'array' or jsonb_array_length(p_languages) > 50 then
    raise exception using errcode = '22023', message = 'AI language updates must be an array of at most 50 entries.';
  end if;
  if jsonb_typeof(p_locations) is distinct from 'array' or jsonb_array_length(p_locations) > 10 then
    raise exception using errcode = '22023', message = 'AI location updates must be an array of at most 10 entries.';
  end if;

  select i.* into v_identity
  from ai_network.ai_identities i
  where i.identity_id = p_identity_id
    and i.owner_user_id = p_actor_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
  end if;

  select n.* into v_name_row
  from ai_network.ai_names n
  where n.identity_id = p_identity_id
  for update;
  if not found then
    v_batch_code:=upper(coalesce(nullif(split_part(v_identity.idempotency_key,'-',3),''),'legacy'));
    v_sequence:=right(coalesce(v_identity.idempotency_key,v_identity.identity_id::text),6);
    select c.display_name into v_category_display from ai_network.ai_categories c where c.category_key=v_identity.category_key;
    insert into ai_network.ai_names(identity_id,first_name,middle_name,last_name,full_name,display_name,username,profile_identifier)
    values(v_identity.identity_id,'Minglora AI',v_batch_code,v_sequence,'Minglora AI '||v_batch_code||' '||v_sequence,
      coalesce(v_category_display,'AI Identity')||' '||v_batch_code||' #'||v_sequence,
      'mlai_'||substr(md5(v_identity.identity_id::text),1,25),'MINGLORA-AI-'||replace(v_identity.identity_id::text,'-',''))
    on conflict(identity_id) do nothing;
    select n.* into v_name_row from ai_network.ai_names n where n.identity_id=p_identity_id for update;
  end if;

  select p.* into v_profile_row
  from ai_network.ai_profiles p
  where p.identity_id = p_identity_id
  for update;
  if not found then
    select c.display_name into v_category_display from ai_network.ai_categories c where c.category_key=v_identity.category_key;
    insert into ai_network.ai_profiles(identity_id,bio,introduction,gender,gender_presentation,profession,personality,profile_visibility,extra_profile_data)
    values(v_identity.identity_id,
      'AI identity for the '||coalesce(v_category_display,'AI')||' category. Clearly labelled as AI; not a human account.',
      'I am an AI identity in Minglora. This profile was generated from an existing identity record and is pending review.',
      'prefer_not_to_say','AI identity',coalesce(v_category_display,'AI Identity'),
      jsonb_build_object('role',coalesce(v_category_display,'AI Identity'),'disclosure','AI','autonomous_execution',false),
      'private',jsonb_build_object('source','lazy_profile_materialization','profile_status','pending_review',
        'autonomous_execution_enabled',false,'public_visibility_enabled',false))
    on conflict(identity_id) do nothing;
    select p.* into v_profile_row from ai_network.ai_profiles p where p.identity_id=p_identity_id for update;
  end if;

  v_first_name := left(trim(coalesce(p_name->>'first_name', '')), 80);
  v_middle_name := left(trim(coalesce(p_name->>'middle_name', '')), 80);
  v_last_name := left(trim(coalesce(p_name->>'last_name', '')), 80);
  if v_first_name = '' or v_last_name = '' then
    raise exception using errcode = '22023', message = 'First name and last name are both required as separate fields.';
  end if;
  v_full_name := left(concat_ws(' ', v_first_name, nullif(v_middle_name, ''), v_last_name), 240);
  v_display_name := left(coalesce(nullif(trim(p_name->>'display_name'), ''), v_full_name), 120);
  if length(v_display_name) < 2 then
    raise exception using errcode = '22023', message = 'AI display name must contain at least two characters.';
  end if;
  v_username := lower(trim(coalesce(p_name->>'username', '')));
  if v_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = '22023', message = 'Username must contain 3 to 30 lowercase letters, numbers or underscores.';
  end if;

  v_gender := lower(coalesce(nullif(trim(p_profile->>'gender'), ''), v_profile_row.gender));
  if v_gender not in ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say') then
    raise exception using errcode = '22023', message = 'Choose a supported AI gender option.';
  end if;
  v_visibility := lower(coalesce(nullif(trim(p_profile->>'profile_visibility'), ''), v_profile_row.profile_visibility));
  if v_visibility not in ('public', 'followers', 'private', 'hidden') then
    raise exception using errcode = '22023', message = 'Choose a supported AI profile visibility setting.';
  end if;
  v_country_origin := nullif(upper(trim(coalesce(p_profile->>'country_of_origin', ''))), '');
  v_current_country := nullif(upper(trim(coalesce(p_profile->>'current_country', ''))), '');
  if v_country_origin is not null and v_country_origin !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Country of origin must use an ISO two-letter country code.';
  end if;
  if v_current_country is not null and v_current_country !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Current country must use an ISO two-letter country code.';
  end if;
  v_time_zone := left(coalesce(nullif(trim(p_profile->>'time_zone'), ''), v_profile_row.time_zone, 'UTC'), 80);
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_time_zone) then
    raise exception using errcode = '22023', message = 'Choose a valid IANA time zone.';
  end if;

  if p_profile ? 'personality' and jsonb_typeof(p_profile->'personality') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Personality settings must be a JSON object.';
  end if;
  if p_profile ? 'voice_preferences' and jsonb_typeof(p_profile->'voice_preferences') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Voice preferences must be a JSON object.';
  end if;
  if p_profile ? 'education' and jsonb_typeof(p_profile->'education') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Education must be a JSON array.';
  end if;
  if p_profile ? 'interests' and jsonb_typeof(p_profile->'interests') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Interests must be an array.';
  end if;
  if p_profile ? 'hobbies' and jsonb_typeof(p_profile->'hobbies') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Hobbies must be an array.';
  end if;
  if p_profile ? 'qualifications' and jsonb_typeof(p_profile->'qualifications') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Qualifications must be an array.';
  end if;
  if p_profile ? 'skills' and jsonb_typeof(p_profile->'skills') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Skills must be an array.';
  end if;

  update ai_network.ai_names
  set first_name = v_first_name,
      middle_name = v_middle_name,
      last_name = v_last_name,
      full_name = v_full_name,
      display_name = v_display_name,
      username = v_username,
      updated_at = now()
  where identity_id = p_identity_id;

  update ai_network.ai_profiles
  set bio = left(coalesce(p_profile->>'bio', ''), 4000),
      introduction = left(coalesce(p_profile->>'introduction', ''), 2000),
      gender = v_gender,
      gender_presentation = left(coalesce(p_profile->>'gender_presentation', ''), 80),
      nationality = left(coalesce(p_profile->>'nationality', ''), 120),
      country_of_origin = v_country_origin,
      current_country = v_current_country,
      state_province = left(coalesce(p_profile->>'state_province', ''), 120),
      parish_county = left(coalesce(p_profile->>'parish_county', ''), 120),
      district = left(coalesce(p_profile->>'district', ''), 120),
      city = left(coalesce(p_profile->>'city', ''), 120),
      town = left(coalesce(p_profile->>'town', ''), 120),
      time_zone = v_time_zone,
      personality = case when p_profile ? 'personality' then p_profile->'personality' else personality end,
      interests = case when p_profile ? 'interests' then array(select jsonb_array_elements_text(p_profile->'interests')) else interests end,
      hobbies = case when p_profile ? 'hobbies' then array(select jsonb_array_elements_text(p_profile->'hobbies')) else hobbies end,
      education = case when p_profile ? 'education' then p_profile->'education' else education end,
      qualifications = case when p_profile ? 'qualifications' then array(select jsonb_array_elements_text(p_profile->'qualifications')) else qualifications end,
      profession = left(coalesce(p_profile->>'profession', ''), 180),
      skills = case when p_profile ? 'skills' then array(select jsonb_array_elements_text(p_profile->'skills')) else skills end,
      voice_preferences = case when p_profile ? 'voice_preferences' then p_profile->'voice_preferences' else voice_preferences end,
      profile_visibility = v_visibility,
      updated_at = now()
  where identity_id = p_identity_id;

  update ai_network.ai_identities
  set updated_at = now()
  where identity_id = p_identity_id and owner_user_id = p_actor_user_id;

  delete from ai_network.ai_identity_languages where identity_id = p_identity_id;
  for v_item in select value from jsonb_array_elements(p_languages) loop
    if jsonb_typeof(v_item) = 'string' then
      v_language_tag := trim(v_item #>> '{}');
      v_language_name := v_language_tag;
      v_dialect := '';
      v_proficiency := 'conversational';
      v_is_primary := false;
    elsif jsonb_typeof(v_item) = 'object' then
      v_language_tag := trim(coalesce(v_item->>'language_tag', ''));
      v_language_name := left(coalesce(v_item->>'language_name', v_language_tag), 120);
      v_dialect := left(coalesce(v_item->>'dialect', ''), 120);
      v_proficiency := coalesce(v_item->>'proficiency', 'conversational');
      v_is_primary := coalesce((v_item->>'is_primary')::boolean, false);
    else
      raise exception using errcode = '22023', message = 'Each AI language must be a language tag or language object.';
    end if;
    if v_language_tag !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then
      raise exception using errcode = '22023', message = 'Each AI language must use a valid BCP 47 language tag.';
    end if;
    if v_proficiency not in ('native', 'fluent', 'professional', 'conversational', 'basic', 'learning') then
      raise exception using errcode = '22023', message = 'Choose a supported language proficiency.';
    end if;
    if v_is_primary and v_primary_seen then
      raise exception using errcode = '22023', message = 'Only one AI language may be marked primary.';
    end if;
    v_primary_seen := v_primary_seen or v_is_primary;
    insert into ai_network.ai_identity_languages (
      identity_id, language_tag, language_name, dialect, proficiency, is_primary
    ) values (
      p_identity_id, v_language_tag, v_language_name, v_dialect, v_proficiency, v_is_primary
    );
  end loop;

  delete from ai_network.ai_identity_locations where identity_id = p_identity_id;
  for v_item in select value from jsonb_array_elements(p_locations) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'Each AI location must be a JSON object.';
    end if;
    v_location_type := coalesce(v_item->>'location_type', 'current');
    if v_location_type not in ('origin', 'current', 'nationality', 'operating_region', 'other') then
      raise exception using errcode = '22023', message = 'Choose a supported AI location type.';
    end if;
    v_country_code := nullif(upper(trim(coalesce(v_item->>'country_code', ''))), '');
    if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
      raise exception using errcode = '22023', message = 'AI location country must use an ISO two-letter code.';
    end if;
    insert into ai_network.ai_identity_locations (
      identity_id, location_type, country_code, country_name,
      state_province, parish_county, district, city, town, time_zone, is_public
    ) values (
      p_identity_id,
      v_location_type,
      v_country_code,
      left(coalesce(v_item->>'country_name', ''), 120),
      left(coalesce(v_item->>'state_province', ''), 120),
      left(coalesce(v_item->>'parish_county', ''), 120),
      left(coalesce(v_item->>'district', ''), 120),
      left(coalesce(v_item->>'city', ''), 120),
      left(coalesce(v_item->>'town', ''), 120),
      left(coalesce(nullif(v_item->>'time_zone', ''), v_time_zone), 80),
      coalesce((v_item->>'is_public')::boolean, false)
    );
  end loop;

  select coalesce(max(v.version_number), 0) + 1 into v_version
  from ai_network.ai_identity_versions v
  where v.identity_id = p_identity_id;

  select jsonb_build_object(
    'identity', to_jsonb(i),
    'name', to_jsonb(n),
    'profile', to_jsonb(p),
    'languages', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.is_primary desc, l.language_tag)
      from ai_network.ai_identity_languages l where l.identity_id = i.identity_id
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(to_jsonb(loc) order by loc.location_type, loc.created_at)
      from ai_network.ai_identity_locations loc where loc.identity_id = i.identity_id
    ), '[]'::jsonb)
  )
  into v_snapshot
  from ai_network.ai_identities i
  join ai_network.ai_names n on n.identity_id = i.identity_id
  join ai_network.ai_profiles p on p.identity_id = i.identity_id
  where i.identity_id = p_identity_id and i.owner_user_id = p_actor_user_id;

  insert into ai_network.ai_identity_versions (
    identity_id, version_number, snapshot, change_note, changed_by_user_id
  ) values (
    p_identity_id, v_version, v_snapshot, 'AI identity profile and language/location details updated.', p_actor_user_id
  );

  insert into ai_network.ai_identity_audit_logs (
    identity_id, actor_type, actor_user_id, action, metadata
  ) values (
    p_identity_id, 'human_user', p_actor_user_id, 'identity_profile_updated',
    jsonb_build_object('fields', jsonb_build_array('name','profile','languages','locations'), 'version_number', v_version)
  );

  return v_snapshot || jsonb_build_object(
    'primary_email', (
      select jsonb_build_object(
        'email_address', e.email_address,
        'verification_status', e.verification_status,
        'provisioning_status', e.provisioning_status
      )
      from ai_network.ai_emails e
      where e.identity_id = p_identity_id and e.is_primary = true
      limit 1
    )
  );
end;
$function$;
comment on function public.minglora_ai_identity_profile_update(uuid,uuid,jsonb,jsonb,jsonb,jsonb) is 'Owner-scoped AI profile edit with lazy private fallback materialization and audited version history.';
revoke all on function public.minglora_ai_identity_profile_update(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_profile_update(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

