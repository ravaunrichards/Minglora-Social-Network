-- Limit generated username matching to explicit mlai_ searches so batch-code searches stay precise.
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
  v_search='' or ((n.username is not null and n.username ilike '%'||v_search||'%') or (n.username is null and left(v_search,5)='mlai_' and ('mlai_'||substr(md5(i.identity_id::text),1,25)) ilike '%'||v_search||'%')) or
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
   v_search='' or ((n.username is not null and n.username ilike '%'||v_search||'%') or (n.username is null and left(v_search,5)='mlai_' and ('mlai_'||substr(md5(i.identity_id::text),1,25)) ilike '%'||v_search||'%')) or
   coalesce(n.display_name,c.display_name||' '||upper(coalesce(nullif(split_part(i.idempotency_key,'-',3),''),'legacy'))||
    ' #'||right(coalesce(i.idempotency_key,i.identity_id::text),6)) ilike '%'||v_search||'%' or
   coalesce(n.first_name,'Minglora AI') ilike '%'||v_search||'%' or
   coalesce(n.last_name,right(coalesce(i.idempotency_key,i.identity_id::text),6)) ilike '%'||v_search||'%'
  )
  order by i.created_at desc,i.identity_id limit v_limit offset v_offset
 ) q;
 return jsonb_build_object('identities',v_rows,'total',v_total,'limit',v_limit,'offset',v_offset);
end;$function$;
comment on function public.minglora_ai_identity_profile_registry(uuid,integer,integer,text) is 'Owner-scoped AI identity registry with clearly disclosed private virtual profile fallbacks and precise synthetic username search.';
revoke all on function public.minglora_ai_identity_profile_registry(uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.minglora_ai_identity_profile_registry(uuid,integer,integer,text) to service_role;
