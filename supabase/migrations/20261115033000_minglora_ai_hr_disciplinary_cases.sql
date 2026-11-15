-- Minglora AI HR: confidential, human-managed disciplinary case tracking.
-- Records investigations and history; it never automates employment sanctions.
create table if not exists ai_network.ai_employee_disciplinary_cases (
 case_id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references ai_network.ai_organizations(organization_id) on delete cascade,
 employment_id uuid not null,
 case_category text not null check(case_category in('conduct','policy','performance','attendance','safety','security','other')),
 severity text not null default 'medium' check(severity in('low','medium','high','critical')),
 case_status text not null default 'open' check(case_status in('open','under_review','awaiting_response','resolved','dismissed')),
 incident_date date not null,
 case_title text not null check(length(trim(case_title)) between 3 and 180),
 summary text not null check(length(trim(summary)) between 3 and 2000),
 details text not null default '' check(length(details)<=8000),
 idempotency_key text not null check(length(idempotency_key) between 8 and 160),
 opened_by_user_id uuid not null references public.profiles(id) on delete restrict,
 last_updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
 resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,employment_id) references ai_network.ai_employment_records(organization_id,employment_id) on delete restrict,
 unique(organization_id,case_id), unique(organization_id,idempotency_key)
);
create index if not exists ai_employee_disciplinary_cases_org_status_idx on ai_network.ai_employee_disciplinary_cases(organization_id,case_status,updated_at desc);
create index if not exists ai_employee_disciplinary_cases_org_employee_idx on ai_network.ai_employee_disciplinary_cases(organization_id,employment_id,created_at desc);
create index if not exists ai_employee_disciplinary_cases_opened_by_idx on ai_network.ai_employee_disciplinary_cases(opened_by_user_id);
create table if not exists ai_network.ai_employee_disciplinary_case_history (
 event_id uuid primary key default gen_random_uuid(), organization_id uuid not null, case_id uuid not null,
 action text not null check(action in('case_opened','note_added','case_status_changed')),
 previous_status text, new_status text not null check(new_status in('open','under_review','awaiting_response','resolved','dismissed')),
 note text not null default '' check(length(note)<=4000), actor_user_id uuid not null references public.profiles(id) on delete restrict,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'), occurred_at timestamptz not null default now(),
 foreign key(organization_id,case_id) references ai_network.ai_employee_disciplinary_cases(organization_id,case_id) on delete restrict
);
create index if not exists ai_employee_disciplinary_case_history_case_idx on ai_network.ai_employee_disciplinary_case_history(organization_id,case_id,occurred_at desc);
create index if not exists ai_employee_disciplinary_case_history_actor_idx on ai_network.ai_employee_disciplinary_case_history(actor_user_id);
alter table ai_network.ai_employee_disciplinary_cases enable row level security;
alter table ai_network.ai_employee_disciplinary_case_history enable row level security;
revoke all on table ai_network.ai_employee_disciplinary_cases,ai_network.ai_employee_disciplinary_case_history from public,anon,authenticated;
grant select,insert,update on ai_network.ai_employee_disciplinary_cases to service_role;
grant select,insert on ai_network.ai_employee_disciplinary_case_history to service_role;

create or replace function public.minglora_ai_hr_disciplinary_command(p_action text,p_actor_user_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 a text:=lower(coalesce(p_action,'')); p jsonb:=coalesce(p_payload,'{}'::jsonb);
 o uuid; cid uuid; empid uuid; cat text; sev text; st text; oldst text; dt date;
 ttl text; summ text; det text; note_text text; idem text;
 c ai_network.ai_employee_disciplinary_cases%rowtype; ev ai_network.ai_employee_disciplinary_case_history%rowtype; result_json jsonb;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='Minglora server runtime required.'; end if;
 if p_actor_user_id is null or not exists(select 1 from public.profiles where id=p_actor_user_id) then raise exception using errcode='42501',message='A valid signed-in administrator is required.'; end if;
 if jsonb_typeof(p)<>'object' or coalesce(p->>'organization_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='A valid organization ID and object payload are required.'; end if;
 o:=(p->>'organization_id')::uuid;
 if not exists(select 1 from ai_network.ai_organizations x where x.organization_id=o and x.owner_user_id=p_actor_user_id and x.status not in('suspended','archived')) then raise exception using errcode='42501',message='Organization is not available to this administrator.'; end if;
 if a='list_disciplinary_cases' then
  select coalesce(jsonb_agg(q.item order by q.updated_at desc),'[]'::jsonb) into result_json from(
   select jsonb_build_object('case',to_jsonb(x),'identity',jsonb_build_object('identity_id',i.identity_id,'display_name',n.display_name,'username',n.username),'position_name',pos.display_name,
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.occurred_at),'[]'::jsonb) from(
      select e.event_id,e.action,e.previous_status,e.new_status,e.note,e.actor_user_id,e.occurred_at from ai_network.ai_employee_disciplinary_case_history e
      where e.organization_id=x.organization_id and e.case_id=x.case_id order by e.occurred_at desc limit 30) h)) item,x.updated_at
   from ai_network.ai_employee_disciplinary_cases x
   join ai_network.ai_employment_records er on er.organization_id=x.organization_id and er.employment_id=x.employment_id
   join ai_network.ai_identities i on i.identity_id=er.identity_id left join ai_network.ai_names n on n.identity_id=i.identity_id
   left join ai_network.ai_positions pos on pos.organization_id=er.organization_id and pos.position_id=er.position_id
   where x.organization_id=o order by x.updated_at desc limit 250) q;
  return result_json;
 end if;
 if a='create_disciplinary_case' then
  empid:=nullif(p->>'employment_id','')::uuid; cat:=lower(trim(coalesce(p->>'case_category',''))); sev:=lower(trim(coalesce(p->>'severity','medium')));
  dt:=nullif(p->>'incident_date','')::date; ttl:=trim(coalesce(p->>'case_title','')); summ:=trim(coalesce(p->>'summary',''));
  det:=left(trim(coalesce(p->>'details','')),8000); idem:=nullif(trim(p->>'idempotency_key'),'');
  if empid is null or dt is null or idem is null or length(idem) not between 8 and 160 or
   cat not in('conduct','policy','performance','attendance','safety','security','other') or sev not in('low','medium','high','critical') or
   length(ttl) not between 3 and 180 or length(summ) not between 3 and 2000 then
   raise exception using errcode='22023',message='Employee, date, category, severity, title, summary and idempotency key are required.';
  end if;
  if dt>current_date then raise exception using errcode='22023',message='Incident date cannot be in the future.'; end if;
  if not exists(select 1 from ai_network.ai_employment_records x where x.organization_id=o and x.employment_id=empid and (x.start_date is null or dt>=x.start_date) and (x.end_date is null or dt<=x.end_date)) then
   raise exception using errcode='22023',message='Employee must belong to this organization on the incident date.';
  end if;
  insert into ai_network.ai_employee_disciplinary_cases(organization_id,employment_id,case_category,severity,incident_date,case_title,summary,details,idempotency_key,opened_by_user_id,last_updated_by_user_id)
   values(o,empid,cat,sev,dt,ttl,summ,det,idem,p_actor_user_id,p_actor_user_id) on conflict(organization_id,idempotency_key) do nothing returning case_id into cid;
  if cid is null then
   select * into c from ai_network.ai_employee_disciplinary_cases x where x.organization_id=o and x.idempotency_key=idem;
   if not found then raise exception using errcode='40001',message='Case create request could not be reconciled.'; end if;
   if c.employment_id is distinct from empid or c.case_category is distinct from cat or c.severity is distinct from sev or c.incident_date is distinct from dt or c.case_title is distinct from ttl or c.summary is distinct from summ or c.details is distinct from det then
    raise exception using errcode='22023',message='Idempotency key was already used for a different case.';
   end if;
   return jsonb_build_object('case',to_jsonb(c),'reused',true);
  end if;
  select * into c from ai_network.ai_employee_disciplinary_cases x where x.organization_id=o and x.case_id=cid;
  insert into ai_network.ai_employee_disciplinary_case_history(organization_id,case_id,action,new_status,note,actor_user_id,metadata)
   values(o,cid,'case_opened','open','',p_actor_user_id,jsonb_build_object('case_category',cat,'severity',sev,'incident_date',dt));
  return jsonb_build_object('case',to_jsonb(c),'reused',false);
 end if;
 if a='add_disciplinary_case_note' then
  cid:=nullif(p->>'case_id','')::uuid; note_text:=trim(coalesce(p->>'note',''));
  if cid is null or length(note_text) not between 3 and 4000 then raise exception using errcode='22023',message='A valid case and note between 3 and 4000 characters are required.'; end if;
  select x.case_status into st from ai_network.ai_employee_disciplinary_cases x where x.organization_id=o and x.case_id=cid for update;
  if not found then raise exception using errcode='P0002',message='Disciplinary case not found.'; end if;
  update ai_network.ai_employee_disciplinary_cases x set updated_at=now(),last_updated_by_user_id=p_actor_user_id where x.organization_id=o and x.case_id=cid;
  insert into ai_network.ai_employee_disciplinary_case_history(organization_id,case_id,action,new_status,note,actor_user_id) values(o,cid,'note_added',st,note_text,p_actor_user_id) returning * into ev;
  return jsonb_build_object('event',to_jsonb(ev),'reused',false);
 end if;
 if a='set_disciplinary_case_status' then
  cid:=nullif(p->>'case_id','')::uuid; st:=lower(trim(coalesce(p->>'status',''))); note_text:=trim(coalesce(p->>'reason',''));
  if cid is null or st not in('open','under_review','awaiting_response','resolved','dismissed') or length(note_text)<10 or length(note_text)>4000 then raise exception using errcode='22023',message='Valid status and reason of at least ten characters required.'; end if;
  select * into c from ai_network.ai_employee_disciplinary_cases x where x.organization_id=o and x.case_id=cid for update;
  if not found then raise exception using errcode='P0002',message='Disciplinary case not found.'; end if;
  oldst:=c.case_status; if oldst=st then return jsonb_build_object('case',to_jsonb(c),'reused',true); end if;
  if not((oldst='open' and st in('under_review','dismissed')) or (oldst='under_review' and st in('awaiting_response','resolved','dismissed')) or (oldst='awaiting_response' and st in('under_review','resolved','dismissed'))) then raise exception using errcode='22023',message='Disallowed case status transition.'; end if;
  update ai_network.ai_employee_disciplinary_cases x set case_status=st,resolved_at=case when st in('resolved','dismissed') then now() else null end,updated_at=now(),last_updated_by_user_id=p_actor_user_id
   where x.organization_id=o and x.case_id=cid returning * into c;
  insert into ai_network.ai_employee_disciplinary_case_history(organization_id,case_id,action,previous_status,new_status,note,actor_user_id)
   values(o,cid,'case_status_changed',oldst,st,note_text,p_actor_user_id);
  return jsonb_build_object('case',to_jsonb(c),'reused',false);
 end if;
 raise exception using errcode='22023',message='Unsupported AI HR disciplinary command.';
end;
$fn$;
comment on function public.minglora_ai_hr_disciplinary_command(text,uuid,jsonb) is 'Owner-scoped human-managed disciplinary case tracking with append-only history; no automated sanctions.';
revoke all on function public.minglora_ai_hr_disciplinary_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_hr_disciplinary_command(text,uuid,jsonb) to service_role;
