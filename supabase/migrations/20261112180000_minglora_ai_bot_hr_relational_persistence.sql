-- Minglora AI corporate HR and organization persistence.
-- Additive, owner-scoped relational tables. Does not create Auth users or activate AI identities.
-- Appointments remain disabled and carry no autonomous permissions until a separately reviewed policy exists.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_departments (
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  department_id text NOT NULL CHECK (char_length(department_id) BETWEEN 3 AND 100),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,79}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  is_builtin boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  parent_department_id text,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_admin_id, department_id),
  UNIQUE (owner_admin_id, code),
  CHECK (parent_department_id IS NULL OR parent_department_id <> department_id),
  CONSTRAINT ai_departments_parent_fk FOREIGN KEY (owner_admin_id,parent_department_id)
    REFERENCES public.ai_departments(owner_admin_id,department_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_departments_owner_name_ci_uq
  ON public.ai_departments (owner_admin_id, lower(name));
CREATE INDEX IF NOT EXISTS ai_departments_owner_parent_idx
  ON public.ai_departments (owner_admin_id,parent_department_id);

CREATE TABLE IF NOT EXISTS public.ai_job_positions (
  position_code text PRIMARY KEY CHECK (position_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 100),
  position_group text NOT NULL CHECK (char_length(position_group) BETWEEN 2 AND 60),
  department_scope text NOT NULL CHECK (department_scope = 'any_department' OR department_scope ~ '^[a-z][a-z0-9_]{1,79}$'),
  reports_to jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reports_to) = 'array'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  permission_defaults jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permission_defaults) = 'array'),
  can_approve_actions boolean NOT NULL DEFAULT false CHECK (NOT can_approve_actions),
  can_delegate boolean NOT NULL DEFAULT false CHECK (NOT can_delegate),
  can_hire boolean NOT NULL DEFAULT false CHECK (NOT can_hire),
  can_manage_budgets boolean NOT NULL DEFAULT false CHECK (NOT can_manage_budgets),
  can_execute_external_actions boolean NOT NULL DEFAULT false CHECK (NOT can_execute_external_actions),
  appointment_enabled boolean NOT NULL DEFAULT false CHECK (NOT appointment_enabled),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_job_positions
  (position_code,title,level,position_group,department_scope,reports_to,description)
VALUES
  ('board_chair','Chairperson / Board President',1,'board','executive_management','[]'::jsonb,'Leads the Board of Directors and its governance agenda.'),
  ('board_director','Board Director',1,'board','executive_management','["board_chair"]'::jsonb,'Provides board oversight, governance challenge and strategic direction.'),
  ('ceo','Chief Executive Officer (CEO)',2,'executive','executive_management','["board_chair","board_director"]'::jsonb,'Coordinates executive leadership and accountable delivery of approved company strategy.'),
  ('coo','Chief Operating Officer (COO)',2,'executive','executive_management','["ceo"]'::jsonb,'Coordinates approved operational services and operating performance.'),
  ('cfo','Chief Financial Officer (CFO)',2,'executive','finance_accounting','["ceo"]'::jsonb,'Oversees financial planning, accounting controls and reporting.'),
  ('cto','Chief Technology Officer (CTO)',2,'executive','technology_engineering','["ceo"]'::jsonb,'Sets technical architecture and engineering direction.'),
  ('chro','Chief Human Resources Officer (CHRO)',2,'executive','human_resources','["ceo"]'::jsonb,'Owns workforce policy, recruitment governance and employment controls.'),
  ('ciso','Chief Information Security Officer (CISO)',2,'executive','cybersecurity_it','["ceo"]'::jsonb,'Leads information-security strategy, risk controls and incident governance.'),
  ('cmo','Chief Marketing Officer (CMO)',2,'executive','marketing_advertising','["ceo"]'::jsonb,'Directs approved marketing, communications and brand strategy.'),
  ('other_executive_officer','Other Executive Officer',2,'executive','any_department','["ceo"]'::jsonb,'Represents other formally defined executive officer roles.'),
  ('department_director','Department Director',3,'department_leadership','any_department','["ceo","other_executive_officer"]'::jsonb,'Leads a designated department under an approved executive reporting line.'),
  ('deputy_department_director','Deputy Department Director',4,'department_leadership','any_department','["department_director"]'::jsonb,'Supports a department director and provides delegated coordination when formally appointed.'),
  ('department_manager','Department Manager',5,'management','any_department','["department_director","deputy_department_director"]'::jsonb,'Coordinates a defined department function and approved workload.'),
  ('regional_manager','Regional Manager',6,'management','any_department','["department_manager"]'::jsonb,'Coordinates a designated geographic region within a department.'),
  ('team_leader','Team Leader',7,'management','any_department','["department_manager","regional_manager"]'::jsonb,'Coordinates a defined team and escalates work through its reporting manager.'),
  ('supervisor','Supervisor',8,'supervision','any_department','["team_leader","department_manager"]'::jsonb,'Reviews assigned work and escalates issues under explicitly granted supervision rules.'),
  ('senior_specialist','Senior Specialist',9,'specialist','any_department','["supervisor","team_leader"]'::jsonb,'Provides advanced expertise and may mentor specialists when authorized.'),
  ('junior_specialist','Junior Specialist',10,'specialist','any_department','["senior_specialist","supervisor"]'::jsonb,'Performs scoped specialist tasks under an assigned reviewer.'),
  ('assistant','Assistant',11,'support','any_department','["supervisor","department_manager"]'::jsonb,'Supports approved administrative and departmental workflows.'),
  ('worker','Worker',12,'workforce','any_department','["supervisor","team_leader"]'::jsonb,'Performs a defined set of approved operational tasks.')
ON CONFLICT (position_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_vacancies (
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  vacancy_id text NOT NULL CHECK (char_length(vacancy_id) BETWEEN 3 AND 120),
  position_code text NOT NULL REFERENCES public.ai_job_positions(position_code) ON DELETE RESTRICT,
  position_title text NOT NULL CHECK (char_length(position_title) BETWEEN 2 AND 120),
  department_id text NOT NULL,
  department_code text NOT NULL,
  department_name text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1200),
  requirements text NOT NULL DEFAULT '' CHECK (char_length(requirements) <= 2000),
  slots integer NOT NULL DEFAULT 1 CHECK (slots BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paused','closed')),
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(status_history) = 'array'),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_admin_id,vacancy_id),
  CONSTRAINT ai_vacancies_department_fk FOREIGN KEY (owner_admin_id,department_id)
    REFERENCES public.ai_departments(owner_admin_id,department_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ai_vacancies_owner_status_updated_idx
  ON public.ai_vacancies (owner_admin_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_vacancies_owner_department_position_idx
  ON public.ai_vacancies (owner_admin_id,department_id,position_code);

CREATE TABLE IF NOT EXISTS public.ai_candidate_applications (
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  application_id text NOT NULL CHECK (char_length(application_id) BETWEEN 3 AND 120),
  vacancy_id text NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE RESTRICT,
  vacancy_title text NOT NULL,
  position_code text NOT NULL REFERENCES public.ai_job_positions(position_code) ON DELETE RESTRICT,
  position_title text NOT NULL,
  department_id text NOT NULL,
  department_name text NOT NULL,
  candidate_display_name text NOT NULL,
  candidate_username text NOT NULL DEFAULT '',
  population text NOT NULL DEFAULT 'organizational' CHECK (population = 'organizational'),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','in_review','shortlisted','rejected','withdrawn','appointed')),
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(status_history) = 'array'),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_admin_id,application_id),
  UNIQUE (owner_admin_id,vacancy_id,identity_id),
  CONSTRAINT ai_candidate_applications_vacancy_fk FOREIGN KEY (owner_admin_id,vacancy_id)
    REFERENCES public.ai_vacancies(owner_admin_id,vacancy_id) ON DELETE RESTRICT,
  CONSTRAINT ai_candidate_applications_department_fk FOREIGN KEY (owner_admin_id,department_id)
    REFERENCES public.ai_departments(owner_admin_id,department_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ai_candidate_applications_owner_status_updated_idx
  ON public.ai_candidate_applications (owner_admin_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_candidate_applications_owner_identity_idx
  ON public.ai_candidate_applications (owner_admin_id,identity_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_appointments (
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  appointment_id text NOT NULL CHECK (char_length(appointment_id) BETWEEN 3 AND 120),
  application_id text NOT NULL,
  vacancy_id text NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE RESTRICT,
  position_code text NOT NULL REFERENCES public.ai_job_positions(position_code) ON DELETE RESTRICT,
  position_title text NOT NULL,
  position_level smallint NOT NULL CHECK (position_level BETWEEN 1 AND 100),
  department_id text NOT NULL,
  department_code text NOT NULL,
  department_name text NOT NULL,
  candidate_display_name text NOT NULL,
  candidate_username text NOT NULL DEFAULT '',
  population text NOT NULL DEFAULT 'organizational' CHECK (population = 'organizational'),
  reporting_manager_appointment_id text,
  reporting_manager_identity_id uuid REFERENCES public.ai_identities(identity_id) ON DELETE RESTRICT,
  reporting_manager_name text,
  reporting_manager_position_title text,
  status text NOT NULL DEFAULT 'appointed' CHECK (status IN ('appointed','suspended','terminated','retired','archived')),
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  appointed_at timestamptz NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(permissions) = 'array' AND permissions = '[]'::jsonb),
  permission_grant_status text NOT NULL DEFAULT 'not_granted' CHECK (permission_grant_status = 'not_granted'),
  identity_activation_status text NOT NULL DEFAULT 'unchanged_disabled' CHECK (identity_activation_status = 'unchanged_disabled'),
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(status_history) = 'array'),
  employment_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(employment_history) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_admin_id,appointment_id),
  CONSTRAINT ai_appointments_application_fk FOREIGN KEY (owner_admin_id,application_id)
    REFERENCES public.ai_candidate_applications(owner_admin_id,application_id) ON DELETE RESTRICT,
  CONSTRAINT ai_appointments_vacancy_fk FOREIGN KEY (owner_admin_id,vacancy_id)
    REFERENCES public.ai_vacancies(owner_admin_id,vacancy_id) ON DELETE RESTRICT,
  CONSTRAINT ai_appointments_department_fk FOREIGN KEY (owner_admin_id,department_id)
    REFERENCES public.ai_departments(owner_admin_id,department_id) ON DELETE RESTRICT,
  CONSTRAINT ai_appointments_reporting_manager_fk FOREIGN KEY (owner_admin_id,reporting_manager_appointment_id)
    REFERENCES public.ai_appointments(owner_admin_id,appointment_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_appointments_one_active_identity_uq
  ON public.ai_appointments (owner_admin_id,identity_id)
  WHERE status IN ('appointed','suspended');
CREATE INDEX IF NOT EXISTS ai_appointments_owner_department_status_idx
  ON public.ai_appointments (owner_admin_id,department_id,status);
CREATE INDEX IF NOT EXISTS ai_appointments_owner_manager_idx
  ON public.ai_appointments (owner_admin_id,reporting_manager_appointment_id);

CREATE TABLE IF NOT EXISTS public.ai_employment_history (
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  employment_event_id text NOT NULL CHECK (char_length(employment_event_id) BETWEEN 3 AND 120),
  appointment_id text NOT NULL,
  application_id text NOT NULL,
  vacancy_id text NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.ai_identities(identity_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'recruited','application_submitted','shortlisted','appointed','onboarded','trained',
    'work_assigned','attendance_recorded','performance_reviewed','promoted','transferred',
    'disciplinary_investigation','suspended','succession_planned','retired','terminated','archived'
  )),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  PRIMARY KEY (owner_admin_id,employment_event_id),
  CONSTRAINT ai_employment_history_appointment_fk FOREIGN KEY (owner_admin_id,appointment_id)
    REFERENCES public.ai_appointments(owner_admin_id,appointment_id) ON DELETE RESTRICT,
  CONSTRAINT ai_employment_history_application_fk FOREIGN KEY (owner_admin_id,application_id)
    REFERENCES public.ai_candidate_applications(owner_admin_id,application_id) ON DELETE RESTRICT,
  CONSTRAINT ai_employment_history_vacancy_fk FOREIGN KEY (owner_admin_id,vacancy_id)
    REFERENCES public.ai_vacancies(owner_admin_id,vacancy_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ai_employment_history_owner_identity_created_idx
  ON public.ai_employment_history (owner_admin_id,identity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_employment_history_owner_appointment_created_idx
  ON public.ai_employment_history (owner_admin_id,appointment_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_hr_audit_logs (
  owner_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 100),
  target_type text NOT NULL CHECK (target_type IN ('department','vacancy','application','appointment','employment_history')),
  target_id text NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_admin_id,event_id)
);
CREATE INDEX IF NOT EXISTS ai_hr_audit_owner_created_idx
  ON public.ai_hr_audit_logs (owner_admin_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_hr_state_upsert(
  p_state jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_departments jsonb;
  v_vacancies jsonb;
  v_applications jsonb;
  v_appointments jsonb;
  v_employment jsonb;
  v_audit jsonb;
  v_actor uuid := p_actor_user_id;
BEGIN
  IF v_actor IS NULL OR v_actor <> '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid OR
     p_state IS NULL OR pg_catalog.jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'A valid designated owner and HR state object are required.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_state) AS keys(key_name)
    WHERE key_name NOT IN ('departments','vacancies','applications','appointments','employmentHistory','audit')
  ) THEN
    RAISE EXCEPTION 'Unsupported HR state collection.' USING ERRCODE = '22023';
  END IF;

  v_departments := COALESCE(p_state->'departments','[]'::jsonb);
  v_vacancies := COALESCE(p_state->'vacancies','[]'::jsonb);
  v_applications := COALESCE(p_state->'applications','[]'::jsonb);
  v_appointments := COALESCE(p_state->'appointments','[]'::jsonb);
  v_employment := COALESCE(p_state->'employmentHistory','[]'::jsonb);
  v_audit := COALESCE(p_state->'audit','[]'::jsonb);

  IF CASE WHEN pg_catalog.jsonb_typeof(v_departments)<>'array' THEN true ELSE pg_catalog.jsonb_array_length(v_departments)>1000 END OR
     CASE WHEN pg_catalog.jsonb_typeof(v_vacancies)<>'array' THEN true ELSE pg_catalog.jsonb_array_length(v_vacancies)>5000 END OR
     CASE WHEN pg_catalog.jsonb_typeof(v_applications)<>'array' THEN true ELSE pg_catalog.jsonb_array_length(v_applications)>10000 END OR
     CASE WHEN pg_catalog.jsonb_typeof(v_appointments)<>'array' THEN true ELSE pg_catalog.jsonb_array_length(v_appointments)>10000 END OR
     CASE WHEN pg_catalog.jsonb_typeof(v_employment)<>'array' THEN true ELSE pg_catalog.jsonb_array_length(v_employment)>20000 END OR
     CASE WHEN pg_catalog.jsonb_typeof(v_audit)<>'array' THEN true ELSE pg_catalog.jsonb_array_length(v_audit)>2000 END THEN
    RAISE EXCEPTION 'One or more HR state collections are invalid or exceed their limits.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_departments) AS row_data(item)
    WHERE pg_catalog.jsonb_typeof(item)<>'object' OR
      COALESCE(item->>'id','')='' OR COALESCE(item->>'code','')='' OR
      COALESCE(item->>'name','')=''
  ) THEN
    RAISE EXCEPTION 'Department records require id, code and name.' USING ERRCODE = '22023';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  INSERT INTO public.ai_departments AS current_department (
    owner_admin_id,department_id,code,name,description,is_builtin,enabled,parent_department_id,
    created_by,updated_by,created_at,updated_at
  )
  SELECT
    v_actor,item->>'id',item->>'code',item->>'name',COALESCE(item->>'description',''),
    COALESCE((item->>'builtIn')::boolean,false),COALESCE((item->>'enabled')::boolean,true),
    NULLIF(item->>'parentDepartmentId',''),COALESCE(item->>'createdBy','system'),
    COALESCE(item->>'updatedBy','system'),
    COALESCE(NULLIF(item->>'createdAt','')::timestamptz,pg_catalog.now()),
    COALESCE(NULLIF(item->>'updatedAt','')::timestamptz,pg_catalog.now())
  FROM pg_catalog.jsonb_array_elements(v_departments) AS row_data(item)
  ON CONFLICT (owner_admin_id,department_id) DO UPDATE SET
    code=EXCLUDED.code,name=EXCLUDED.name,description=EXCLUDED.description,
    is_builtin=EXCLUDED.is_builtin,enabled=EXCLUDED.enabled,
    parent_department_id=EXCLUDED.parent_department_id,updated_by=EXCLUDED.updated_by,
    updated_at=EXCLUDED.updated_at;

  INSERT INTO public.ai_vacancies AS current_vacancy (
    owner_admin_id,vacancy_id,position_code,position_title,department_id,department_code,department_name,
    title,description,requirements,slots,status,status_history,created_by,updated_by,created_at,updated_at
  )
  SELECT
    v_actor,item->>'id',item->>'positionCode',item->>'positionTitle',
    item->>'departmentId',item->>'departmentCode',item->>'departmentName',
    item->>'title',COALESCE(item->>'description',''),COALESCE(item->>'requirements',''),
    COALESCE((item->>'slots')::integer,1),COALESCE(item->>'status','open'),
    COALESCE(item->'statusHistory','[]'::jsonb),COALESCE(item->>'createdBy',v_actor::text),
    COALESCE(item->>'updatedBy',v_actor::text),
    COALESCE(NULLIF(item->>'createdAt','')::timestamptz,pg_catalog.now()),
    COALESCE(NULLIF(item->>'updatedAt','')::timestamptz,pg_catalog.now())
  FROM pg_catalog.jsonb_array_elements(v_vacancies) AS row_data(item)
  ON CONFLICT (owner_admin_id,vacancy_id) DO UPDATE SET
    position_code=EXCLUDED.position_code,position_title=EXCLUDED.position_title,
    department_id=EXCLUDED.department_id,department_code=EXCLUDED.department_code,
    department_name=EXCLUDED.department_name,title=EXCLUDED.title,description=EXCLUDED.description,
    requirements=EXCLUDED.requirements,slots=EXCLUDED.slots,status=EXCLUDED.status,
    status_history=EXCLUDED.status_history,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_applications) AS row_data(item)
    WHERE CASE
      WHEN COALESCE(item->>'identityId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN NOT EXISTS (
        SELECT 1 FROM public.ai_identities AS identity
        WHERE identity.identity_id=(item->>'identityId')::uuid AND identity.owner_admin_id=v_actor
      )
      ELSE true
    END
  ) THEN
    RAISE EXCEPTION 'Every HR candidate must reference an AI identity owned by this administrator.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_candidate_applications AS current_application (
    owner_admin_id,application_id,vacancy_id,identity_id,vacancy_title,position_code,position_title,
    department_id,department_name,candidate_display_name,candidate_username,population,status,
    status_history,submitted_by,updated_by,created_at,updated_at
  )
  SELECT
    v_actor,item->>'id',item->>'vacancyId',(item->>'identityId')::uuid,
    item->>'vacancyTitle',item->>'positionCode',item->>'positionTitle',
    item->>'departmentId',item->>'departmentName',item->>'candidateDisplayName',
    COALESCE(item->>'candidateUsername',''),COALESCE(item->>'population','organizational'),
    COALESCE(item->>'status','submitted'),COALESCE(item->'statusHistory','[]'::jsonb),
    COALESCE(NULLIF(item->>'submittedBy','')::uuid,v_actor),
    NULLIF(item->>'updatedBy','')::uuid,
    COALESCE(NULLIF(item->>'createdAt','')::timestamptz,pg_catalog.now()),
    COALESCE(NULLIF(item->>'updatedAt','')::timestamptz,pg_catalog.now())
  FROM pg_catalog.jsonb_array_elements(v_applications) AS row_data(item)
  ON CONFLICT (owner_admin_id,application_id) DO UPDATE SET
    vacancy_id=EXCLUDED.vacancy_id,identity_id=EXCLUDED.identity_id,vacancy_title=EXCLUDED.vacancy_title,
    position_code=EXCLUDED.position_code,position_title=EXCLUDED.position_title,
    department_id=EXCLUDED.department_id,department_name=EXCLUDED.department_name,
    candidate_display_name=EXCLUDED.candidate_display_name,candidate_username=EXCLUDED.candidate_username,
    population=EXCLUDED.population,status=EXCLUDED.status,status_history=EXCLUDED.status_history,
    updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_appointments) AS row_data(item)
    WHERE COALESCE(item->'permissions','[]'::jsonb) <> '[]'::jsonb
       OR COALESCE(item->>'permissionGrantStatus','not_granted') <> 'not_granted'
       OR COALESCE(item->>'identityActivationStatus','unchanged_disabled') <> 'unchanged_disabled'
       OR CASE
         WHEN COALESCE(item->>'identityId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN NOT EXISTS (
           SELECT 1 FROM public.ai_identities AS identity
           WHERE identity.identity_id=(item->>'identityId')::uuid
             AND identity.owner_admin_id=v_actor AND identity.status='created'
         )
         ELSE true
       END
  ) THEN
    RAISE EXCEPTION 'Appointments require an owned disabled organizational AI identity with no permissions.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_appointments AS current_appointment (
    owner_admin_id,appointment_id,application_id,vacancy_id,identity_id,position_code,position_title,
    position_level,department_id,department_code,department_name,candidate_display_name,candidate_username,
    population,reporting_manager_appointment_id,reporting_manager_identity_id,reporting_manager_name,
    reporting_manager_position_title,status,approved_by,approved_at,appointed_at,permissions,
    permission_grant_status,identity_activation_status,status_history,employment_history,created_at,updated_at
  )
  SELECT
    v_actor,item->>'id',item->>'applicationId',item->>'vacancyId',(item->>'identityId')::uuid,
    item->>'positionCode',item->>'positionTitle',COALESCE((item->>'positionLevel')::smallint,1),
    item->>'departmentId',item->>'departmentCode',item->>'departmentName',
    item->>'candidateDisplayName',COALESCE(item->>'candidateUsername',''),
    COALESCE(item->>'population','organizational'),NULLIF(item->>'reportingManagerAppointmentId',''),
    NULLIF(item->>'reportingManagerIdentityId','')::uuid,
    NULLIF(item->>'reportingManagerName',''),NULLIF(item->>'reportingManagerPositionTitle',''),
    COALESCE(item->>'status','appointed'),COALESCE(NULLIF(item->>'approvedBy','')::uuid,v_actor),
    COALESCE(NULLIF(item->>'approvedAt','')::timestamptz,pg_catalog.now()),
    COALESCE(NULLIF(item->>'appointedAt','')::timestamptz,pg_catalog.now()),
    COALESCE(item->'permissions','[]'::jsonb),COALESCE(item->>'permissionGrantStatus','not_granted'),
    COALESCE(item->>'identityActivationStatus','unchanged_disabled'),
    COALESCE(item->'statusHistory','[]'::jsonb),COALESCE(item->'employmentHistory','[]'::jsonb),
    COALESCE(NULLIF(item->>'createdAt','')::timestamptz,pg_catalog.now()),
    COALESCE(NULLIF(item->>'updatedAt','')::timestamptz,pg_catalog.now())
  FROM pg_catalog.jsonb_array_elements(v_appointments) AS row_data(item)
  ON CONFLICT (owner_admin_id,appointment_id) DO UPDATE SET
    application_id=EXCLUDED.application_id,vacancy_id=EXCLUDED.vacancy_id,identity_id=EXCLUDED.identity_id,
    position_code=EXCLUDED.position_code,position_title=EXCLUDED.position_title,position_level=EXCLUDED.position_level,
    department_id=EXCLUDED.department_id,department_code=EXCLUDED.department_code,department_name=EXCLUDED.department_name,
    candidate_display_name=EXCLUDED.candidate_display_name,candidate_username=EXCLUDED.candidate_username,
    reporting_manager_appointment_id=EXCLUDED.reporting_manager_appointment_id,
    reporting_manager_identity_id=EXCLUDED.reporting_manager_identity_id,
    reporting_manager_name=EXCLUDED.reporting_manager_name,
    reporting_manager_position_title=EXCLUDED.reporting_manager_position_title,status=EXCLUDED.status,
    status_history=EXCLUDED.status_history,employment_history=EXCLUDED.employment_history,
    updated_at=EXCLUDED.updated_at;

  INSERT INTO public.ai_employment_history AS current_employment (
    owner_admin_id,employment_event_id,appointment_id,application_id,vacancy_id,identity_id,
    event_type,actor_id,created_at,notes
  )
  SELECT
    v_actor,item->>'id',item->>'appointmentId',item->>'applicationId',item->>'vacancyId',
    (item->>'identityId')::uuid,item->>'eventType',
    COALESCE(NULLIF(item->>'actorId','')::uuid,v_actor),
    COALESCE(NULLIF(item->>'createdAt','')::timestamptz,pg_catalog.now()),
    COALESCE(item->>'notes','')
  FROM pg_catalog.jsonb_array_elements(v_employment) AS row_data(item)
  ON CONFLICT (owner_admin_id,employment_event_id) DO UPDATE SET
    appointment_id=EXCLUDED.appointment_id,application_id=EXCLUDED.application_id,
    vacancy_id=EXCLUDED.vacancy_id,identity_id=EXCLUDED.identity_id,
    event_type=EXCLUDED.event_type,actor_id=EXCLUDED.actor_id,
    created_at=EXCLUDED.created_at,notes=EXCLUDED.notes;

  INSERT INTO public.ai_hr_audit_logs AS current_audit (
    owner_admin_id,event_id,actor_user_id,action,target_type,target_id,summary,created_at
  )
  SELECT
    v_actor,(item->>'id')::uuid,COALESCE(NULLIF(item->>'actorId','')::uuid,v_actor),
    item->>'action',item->>'targetType',item->>'targetId',
    COALESCE(item->>'summary',''),
    COALESCE(NULLIF(item->>'createdAt','')::timestamptz,pg_catalog.now())
  FROM pg_catalog.jsonb_array_elements(v_audit) AS row_data(item)
  WHERE item->>'targetType' IN ('department','vacancy','application','appointment','employment_history')
  ON CONFLICT (owner_admin_id,event_id) DO UPDATE SET
    actor_user_id=EXCLUDED.actor_user_id,action=EXCLUDED.action,
    target_type=EXCLUDED.target_type,target_id=EXCLUDED.target_id,
    summary=EXCLUDED.summary,created_at=EXCLUDED.created_at;

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,
    'departments',pg_catalog.jsonb_array_length(v_departments),
    'vacancies',pg_catalog.jsonb_array_length(v_vacancies),
    'applications',pg_catalog.jsonb_array_length(v_applications),
    'appointments',pg_catalog.jsonb_array_length(v_appointments),
    'employmentHistory',pg_catalog.jsonb_array_length(v_employment)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_hr_state_list(
  p_owner_admin_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_departments jsonb;
  v_positions jsonb;
  v_vacancies jsonb;
  v_applications jsonb;
  v_appointments jsonb;
  v_employment jsonb;
  v_audit jsonb;
BEGIN
  IF p_owner_admin_id IS NULL OR p_owner_admin_id <> '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner can read corporate AI HR records.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',department_id,'code',code,'name',name,'description',description,
    'builtIn',is_builtin,'enabled',enabled,'parentDepartmentId',parent_department_id,
    'createdBy',created_by,'updatedBy',updated_by,'createdAt',created_at,'updatedAt',updated_at
  ) ORDER BY is_builtin DESC,name), '[]'::jsonb)
  INTO v_departments FROM public.ai_departments WHERE owner_admin_id=p_owner_admin_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'code',position_code,'title',title,'level',level,'group',position_group,
    'departmentScope',department_scope,'reportsTo',reports_to,'description',description,
    'permissions',permission_defaults,'canApproveActions',can_approve_actions,
    'canDelegate',can_delegate,'canHire',can_hire,'canManageBudgets',can_manage_budgets,
    'canExecuteExternalActions',can_execute_external_actions,'appointmentEnabled',appointment_enabled
  ) ORDER BY level), '[]'::jsonb)
  INTO v_positions FROM public.ai_job_positions;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',vacancy_id,'positionCode',position_code,'positionTitle',position_title,
    'departmentId',department_id,'departmentCode',department_code,'departmentName',department_name,
    'title',title,'description',description,'requirements',requirements,'slots',slots,
    'status',status,'statusHistory',status_history,'ownerId',owner_admin_id,
    'createdBy',created_by,'updatedBy',updated_by,'createdAt',created_at,'updatedAt',updated_at
  ) ORDER BY updated_at DESC), '[]'::jsonb)
  INTO v_vacancies FROM public.ai_vacancies WHERE owner_admin_id=p_owner_admin_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',application_id,'vacancyId',vacancy_id,'vacancyTitle',vacancy_title,'positionCode',position_code,
    'positionTitle',position_title,'departmentId',department_id,'departmentName',department_name,
    'identityId',identity_id,'candidateDisplayName',candidate_display_name,
    'candidateUsername',candidate_username,'population',population,'status',status,
    'statusHistory',status_history,'ownerId',owner_admin_id,'submittedBy',submitted_by,
    'updatedBy',updated_by,'createdAt',created_at,'updatedAt',updated_at
  ) ORDER BY updated_at DESC), '[]'::jsonb)
  INTO v_applications FROM public.ai_candidate_applications WHERE owner_admin_id=p_owner_admin_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',appointment_id,'applicationId',application_id,'vacancyId',vacancy_id,'positionCode',position_code,
    'positionTitle',position_title,'positionLevel',position_level,'departmentId',department_id,
    'departmentCode',department_code,'departmentName',department_name,'identityId',identity_id,
    'candidateDisplayName',candidate_display_name,'candidateUsername',candidate_username,'population',population,
    'reportingManagerAppointmentId',reporting_manager_appointment_id,
    'reportingManagerIdentityId',reporting_manager_identity_id,'reportingManagerName',reporting_manager_name,
    'reportingManagerPositionTitle',reporting_manager_position_title,'status',status,
    'ownerId',owner_admin_id,'approvedBy',approved_by,'approvedAt',approved_at,'appointedAt',appointed_at,
    'createdAt',created_at,'updatedAt',updated_at,'permissions',permissions,
    'permissionGrantStatus',permission_grant_status,'identityActivationStatus',identity_activation_status,
    'statusHistory',status_history,'employmentHistory',employment_history
  ) ORDER BY appointed_at DESC), '[]'::jsonb)
  INTO v_appointments FROM public.ai_appointments WHERE owner_admin_id=p_owner_admin_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',employment_event_id,'appointmentId',appointment_id,'applicationId',application_id,
    'identityId',identity_id,'vacancyId',vacancy_id,'eventType',event_type,
    'actorId',actor_id,'createdAt',created_at,'notes',notes
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_employment FROM public.ai_employment_history WHERE owner_admin_id=p_owner_admin_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',event_id,'actorId',actor_user_id,'action',action,'targetType',target_type,
    'targetId',target_id,'summary',summary,'createdAt',created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_audit FROM public.ai_hr_audit_logs WHERE owner_admin_id=p_owner_admin_id;

  RETURN pg_catalog.jsonb_build_object(
    'departments',v_departments,'jobPositions',v_positions,'vacancies',v_vacancies,
    'applications',v_applications,'appointments',v_appointments,
    'employmentHistory',v_employment,'audit',v_audit
  );
END;
$function$;

ALTER TABLE public.ai_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_job_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_candidate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_employment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_hr_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_departments,public.ai_job_positions,public.ai_vacancies,
  public.ai_candidate_applications,public.ai_appointments,public.ai_employment_history,
  public.ai_hr_audit_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.ai_departments,public.ai_job_positions,
  public.ai_vacancies,public.ai_candidate_applications,public.ai_appointments,
  public.ai_employment_history,public.ai_hr_audit_logs TO service_role;

REVOKE ALL ON FUNCTION public.minglora_ai_bot_hr_state_upsert(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_hr_state_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_hr_state_list(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_hr_state_list(uuid) TO service_role;

COMMIT;
