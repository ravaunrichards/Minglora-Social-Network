import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_AI_BOT_CATEGORIES,
  PERSONAL_AI_BOT_HYBRID_ACTIONS,
  PERSONAL_AI_BOT_AUTONOMY_MODES,
  PERSONAL_AI_BOT_POPULATIONS,
  ensurePersonalAiBotCollections,
  getPersonalAiBotCategories,
  getPersonalAiBotOverview,
  listPersonalAiCreatorDrafts,
  createPersonalAiCreatorDraft,
  updatePersonalAiCreatorDraft,
  submitPersonalAiCreatorDraft,
  reviewPersonalAiCreatorDraft,
  getPersonalAiBotPerformanceSnapshot,
  createPersonalAiBot,
  createPersonalAiBotStarterSet,
  updatePersonalAiBot,
  setPersonalAiBotCategoryEnabled,
  updatePersonalAiBotCategory,
  bulkUpdatePersonalAiBots,
  emergencyShutdownPersonalAiBots,
  queuePersonalAiBotInstruction,
  queuePersonalAiBotFollowBatch,
  approvePersonalAiBotTask,
  cancelPersonalAiBotTask,
  setPersonalAiBotNetworkSettings,
  createPersonalAiBotTeam,
  updatePersonalAiBotTeam,
  assignPersonalAiBotsToTeam,
  removePersonalAiBotFromTeam,
  getPersonalAiBotTeamHandoffs,
  createPersonalAiBotTeamHandoff,
  reviewPersonalAiBotTeamHandoff,
  PERSONAL_AI_BOT_DEPARTMENTS,
  PERSONAL_AI_BOT_JOB_POSITIONS,
  getPersonalAiBotDepartments,
  createPersonalAiBotDepartment,
  updatePersonalAiBotDepartment,
  getPersonalAiBotVacancies,
  createPersonalAiBotVacancy,
  updatePersonalAiBotVacancy,
  getPersonalAiBotApplications,
  createPersonalAiBotApplication,
  updatePersonalAiBotApplication,
  getPersonalAiBotAppointments,
  getPersonalAiBotEmploymentHistory,
  createPersonalAiBotAppointment,
  recordPersonalAiBotEmploymentEvent,
  previewPersonalAiBotSchedule,
  listPersonalAiBotPersonaVersions,
  createPersonalAiBotPersonaDraft,
  updatePersonalAiBotPersonaDraft,
  evaluatePersonalAiBotPersonaDraft,
  approvePersonalAiBotPersonaVersion,
  activatePersonalAiBotPersonaVersion,
  rollbackPersonalAiBotPersonaVersion,
  getPersonalAiBotLanguageSettings,
  updatePersonalAiBotLanguageSettings,
  listPersonalAiBotLanguageEvaluationSets,
  createPersonalAiBotLanguageEvaluationSet,
  updatePersonalAiBotLanguageEvaluationSet,
  submitPersonalAiBotLanguageEvaluationSet,
  reviewPersonalAiBotLanguageEvaluationSet,
} from '../../backend/modules/personal-ai-bots/personal-ai-bots-service.js';

const makeDb=()=>({});
let sequence=0;
const uid=()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
const actor='owner-user';
const stamp='2026-11-09T10:00:00.000Z';

test('the Personal AI Bots Network starts disabled and administrator-controlled',()=>{
  const db=makeDb();
  const settings=ensurePersonalAiBotCollections(db);
  assert.equal(settings.enabled,false);
  assert.equal(settings.hybridEnabled,false);
  assert.equal(settings.defaultAutonomyMode,'administrator_controlled');
  assert.equal(settings.requireAdministratorApproval,true);
  assert.equal(settings.executionWorkersConfigured,false);
});

test('the requested 15 categories are defined and initially enabled',()=>{
  const db=makeDb();
  const categories=getPersonalAiBotCategories(db);
  assert.equal(PERSONAL_AI_BOT_CATEGORIES.length,15);
  assert.equal(categories.length,15);
  assert.ok(categories.every(category=>category.enabled===true));
  for(const name of ['AI Friends','AI Creators','AI Influencers','AI News','AI Musicians','AI Entertainers','AI Gamers','AI Community Hosts','AI Live Hosts','AI Moderators','AI Support','AI Educators','AI Sports','AI Travel','AI Business']){
    assert.ok(categories.some(category=>category.name===name),name+' category should exist');
  }
});

test('all 20 corporate departments are seeded in the required order without fake employees',()=>{
  const db=makeDb();
  const departments=getPersonalAiBotDepartments(db);
  assert.equal(PERSONAL_AI_BOT_DEPARTMENTS.length,20);
  assert.equal(departments.length,20);
  assert.ok(departments.every(item=>item.builtIn===true&&item.enabled===true));
  assert.deepEqual(db.personalAiBots,[]);
  for(const name of [
    'Executive Management','Finance and Accounting','Human Resources','Resource Management','Operations',
    'Technology and Engineering','AI and Research','Cybersecurity and IT','Legal and Compliance',
    'Marketing and Advertising','Sales and Business Development','Customer Support','Community Management',
    'Content and Creator Management','Product Management','Quality Assurance','Logistics and Procurement',
    'Training and Development','Public Relations','Risk Management'
  ])assert.ok(departments.some(item=>item.name===name),name+' department should exist');
});

test('department catalogue supports safe custom CRUD, built-in edits and acyclic hierarchy',()=>{
  const db=makeDb();
  const root=createPersonalAiBotDepartment(db,{name:'Regional Partnerships',description:'Regional relationships.'},actor,stamp,uid);
  const child=createPersonalAiBotDepartment(db,{name:'Caribbean Partnerships',parentDepartmentId:root.id},actor,stamp,uid);
  assert.equal(root.enabled,true);
  assert.equal(root.builtIn,false);
  assert.equal(child.parentDepartmentId,root.id);
  const updated=updatePersonalAiBotDepartment(db,root.id,{
    name:'International Partnerships',description:'Global partner coordination.',enabled:false
  },actor,stamp,uid);
  assert.equal(updated.name,'International Partnerships');
  assert.equal(updated.enabled,false);
  assert.equal(updated.code,'regional_partnerships');
  assert.throws(()=>createPersonalAiBotDepartment(db,{name:'international partnerships'},actor,stamp,uid),/already exists/);
  assert.throws(()=>updatePersonalAiBotDepartment(db,root.id,{parentDepartmentId:child.id},actor,stamp,uid),/cycle/);
  assert.throws(()=>updatePersonalAiBotDepartment(db,root.id,{parentDepartmentId:'missing-department'},actor,stamp,uid),/existing parent/);
  assert.throws(()=>createPersonalAiBotDepartment(db,{name:'Missing Parent',parentDepartmentId:'missing-department'},actor,stamp,uid),/existing parent/);
  assert.equal(getPersonalAiBotDepartments(db).length,22);
  const builtIn=updatePersonalAiBotDepartment(db,'department-executive_management',{name:'Executive Office',enabled:true},actor,stamp,uid);
  assert.equal(builtIn.builtIn,true);
  assert.equal(builtIn.code,'executive_management');
});

test('corporate job-position catalogue defines the board-to-worker hierarchy without granting authority',()=>{
  const positions=PERSONAL_AI_BOT_JOB_POSITIONS;
  assert.equal(positions.length,20);
  const codes=new Set(positions.map(position=>position.code));
  assert.equal(codes.size,positions.length);
  for(const position of positions){
    assert.equal(Object.isFrozen(position),true);
    assert.equal(Object.isFrozen(position.permissions),true);
    assert.deepEqual(position.permissions,[]);
    assert.equal(position.canApproveActions,false);
    assert.equal(position.canDelegate,false);
    assert.equal(position.canHire,false);
    assert.equal(position.canManageBudgets,false);
    assert.equal(position.canExecuteExternalActions,false);
    assert.equal(position.appointmentEnabled,false);
    assert.ok(position.reportsTo.every(code=>codes.has(code)),position.code+' has valid reporting references');
    assert.ok(position.level>=1&&position.level<=12);
  }
  for(const title of [
    'Chairperson / Board President','Board Director','Chief Executive Officer (CEO)',
    'Chief Operating Officer (COO)','Chief Financial Officer (CFO)','Chief Technology Officer (CTO)',
    'Chief Human Resources Officer (CHRO)','Chief Information Security Officer (CISO)',
    'Chief Marketing Officer (CMO)','Other Executive Officer','Department Director',
    'Deputy Department Director','Department Manager','Regional Manager','Team Leader',
    'Supervisor','Senior Specialist','Junior Specialist','Assistant','Worker'
  ])assert.ok(positions.some(position=>position.title===title),title+' position should exist');
});

test('corporate vacancies validate positions, departments, slots and audited status changes without appointments',()=>{
  const db=makeDb();
  const departments=getPersonalAiBotDepartments(db);
  const finance=departments.find(item=>item.code==='finance_accounting');
  const vacancy=createPersonalAiBotVacancy(db,{
    positionCode:'department_manager',departmentId:finance.id,
    title:'Finance Operations Manager',description:'Coordinates approved finance operations.',
    requirements:'Accounting experience and reconciliation skills.',slots:2
  },actor,stamp,uid);
  assert.equal(vacancy.status,'open');
  assert.equal(vacancy.slots,2);
  assert.equal(vacancy.createdBy,actor);
  assert.equal(vacancy.positionCode,'department_manager');
  assert.equal(vacancy.departmentId,finance.id);
  assert.equal(Object.hasOwn(vacancy,'employeeId'),false);
  assert.equal(Object.hasOwn(vacancy,'appointmentId'),false);
  assert.equal(Object.hasOwn(vacancy,'permissions'),false);
  assert.equal(vacancy.statusHistory.length,1);
  assert.equal(getPersonalAiBotVacancies(db).length,1);
  assert.throws(()=>createPersonalAiBotVacancy(db,{
    positionCode:'department_manager',departmentId:finance.id,title:' finance operations manager ',slots:1
  },actor,stamp,uid),/already exists/);
  const paused=updatePersonalAiBotVacancy(db,vacancy.id,{status:'paused',slots:3},actor,stamp,uid);
  assert.equal(paused.status,'paused');
  assert.equal(paused.slots,3);
  assert.equal(paused.statusHistory.length,2);
  assert.throws(()=>updatePersonalAiBotVacancy(db,vacancy.id,{status:'filled'},actor,stamp,uid),/open, paused or closed/);
  const closed=updatePersonalAiBotVacancy(db,vacancy.id,{status:'closed'},actor,stamp,uid);
  assert.equal(closed.status,'closed');
  const reopened=updatePersonalAiBotVacancy(db,vacancy.id,{status:'open'},actor,stamp,uid);
  assert.equal(reopened.status,'open');
  assert.equal(reopened.statusHistory.length,4);
});

test('corporate vacancies reject invalid role scopes, disabled departments and unsafe slot counts',()=>{
  const db=makeDb();
  const departments=getPersonalAiBotDepartments(db);
  const finance=departments.find(item=>item.code==='finance_accounting');
  assert.throws(()=>createPersonalAiBotVacancy(db,{positionCode:'unknown_position',departmentId:finance.id},actor,stamp,uid),/valid corporate job position/);
  assert.throws(()=>createPersonalAiBotVacancy(db,{positionCode:'ceo',departmentId:finance.id},actor,stamp,uid),/different department/);
  assert.throws(()=>createPersonalAiBotVacancy(db,{positionCode:'worker',departmentId:'missing'},actor,stamp,uid),/enabled department/);
  assert.throws(()=>createPersonalAiBotVacancy(db,{positionCode:'worker',departmentId:finance.id,slots:101},actor,stamp,uid),/between 1 and 100/);
  updatePersonalAiBotDepartment(db,finance.id,{enabled:false},actor,stamp,uid);
  assert.throws(()=>createPersonalAiBotVacancy(db,{positionCode:'worker',departmentId:finance.id},actor,stamp,uid),/enabled department/);
});

test('vacancy lifecycle enforces position/department compatibility and records audited status history',()=>{
  const db=makeDb();
  const executive=getPersonalAiBotDepartments(db).find(item=>item.code==='executive_management');
  const finance=getPersonalAiBotDepartments(db).find(item=>item.code==='finance_accounting');
  const vacancy=createPersonalAiBotVacancy(db,{
    positionCode:'ceo',departmentId:executive.id,title:'Chief Executive Officer',slots:2,
    description:'Lead company operations under owner oversight.',
    requirements:'Leadership and governance experience.'
  },actor,stamp,uid);
  assert.equal(vacancy.status,'open');
  assert.equal(vacancy.slots,2);
  assert.equal(vacancy.ownerId,actor);
  assert.equal(vacancy.statusHistory.length,1);
  assert.equal(db.personalAiBotAudit[0].action,'vacancy.created');
  assert.equal(getPersonalAiBotVacancies(db)[0].id,vacancy.id);

  assert.throws(()=>createPersonalAiBotVacancy(db,{
    positionCode:'cfo',departmentId:executive.id,title:'Finance Executive'
  },actor,stamp,uid),/different department/);
  assert.throws(()=>createPersonalAiBotVacancy(db,{
    positionCode:'ceo',departmentId:finance.id,title:'Finance CEO'
  },actor,stamp,uid),/different department/);
  assert.throws(()=>createPersonalAiBotVacancy(db,{
    positionCode:'ceo',departmentId:executive.id,title:'Chief Executive Officer'
  },actor,stamp,uid),/already exists/);
  assert.throws(()=>createPersonalAiBotVacancy(db,{
    positionCode:'ceo',departmentId:executive.id,title:'Too Many Slots',slots:101
  },actor,stamp,uid),/between 1 and 100/);

  const paused=updatePersonalAiBotVacancy(db,vacancy.id,{status:'paused',slots:3},actor,stamp,uid);
  assert.equal(paused.status,'paused');
  assert.equal(paused.slots,3);
  assert.equal(paused.statusHistory.length,2);
  const closed=updatePersonalAiBotVacancy(db,vacancy.id,{status:'closed'},actor,stamp,uid);
  assert.equal(closed.status,'closed');
  assert.equal(closed.statusHistory.length,3);
  assert.throws(()=>updatePersonalAiBotVacancy(db,vacancy.id,{status:'filled'},actor,stamp,uid),/Appointments and filled status are managed separately/);
  assert.throws(()=>updatePersonalAiBotVacancy(db,vacancy.id,{status:'open'},'another-owner',stamp,uid),/not found/);
  assert.equal(db.personalAiBotAudit.filter(item=>item.targetType==='vacancy').length,3);
});

test('organizational AI candidate applications support audited screening without appointments',()=>{
  const db=makeDb();
  const category=getPersonalAiBotCategories(db)[0];
  const candidate=createPersonalAiBot(db,{
    displayName:'Organizational Applicant',firstName:'Organizational',lastName:'Applicant',
    categoryId:category.id,population:'organizational'
  },actor,stamp,uid);
  const department=getPersonalAiBotDepartments(db).find(item=>item.code==='finance_accounting');
  const vacancy=createPersonalAiBotVacancy(db,{
    positionCode:'worker',departmentId:department.id,title:'Finance Operations Worker'
  },actor,stamp,uid);
  const application=createPersonalAiBotApplication(db,{identityId:candidate.id,vacancyId:vacancy.id},actor,stamp,uid);
  assert.equal(application.status,'submitted');
  assert.equal(application.identityId,candidate.id);
  assert.equal(application.vacancyId,vacancy.id);
  assert.equal(application.population,'organizational');
  assert.equal(Object.hasOwn(application,'appointmentId'),false);
  assert.equal(Object.hasOwn(application,'employeeId'),false);
  assert.equal(Object.hasOwn(application,'permissions'),false);
  assert.equal(application.statusHistory.length,1);
  assert.equal(getPersonalAiBotApplications(db).length,1);
  assert.throws(()=>createPersonalAiBotApplication(db,{identityId:candidate.id,vacancyId:vacancy.id},actor,stamp,uid),/already has an application/);
  assert.equal(updatePersonalAiBotApplication(db,application.id,{status:'in_review'},actor,stamp,uid).status,'in_review');
  assert.equal(updatePersonalAiBotApplication(db,application.id,{status:'shortlisted'},actor,stamp,uid).status,'shortlisted');
  assert.equal(updatePersonalAiBotApplication(db,application.id,{status:'rejected'},actor,stamp,uid).status,'rejected');
  assert.throws(()=>updatePersonalAiBotApplication(db,application.id,{status:'submitted'},actor,stamp,uid),/transition is not permitted/);

  const withdrawalCandidate=createPersonalAiBot(db,{
    displayName:'Withdrawal Candidate',firstName:'Withdrawal',lastName:'Candidate',
    categoryId:category.id,population:'organizational'
  },actor,stamp,uid);
  const withdrawalApplication=createPersonalAiBotApplication(db,{
    identityId:withdrawalCandidate.id,vacancyId:vacancy.id
  },actor,stamp,uid);
  const withdrawn=updatePersonalAiBotApplication(db,withdrawalApplication.id,{status:'withdrawn'},actor,stamp,uid);
  assert.equal(withdrawn.status,'withdrawn');
  assert.deepEqual(withdrawn.statusHistory.map(entry=>entry.status),['submitted','withdrawn']);
  assert.equal(db.personalAiBotAudit.filter(item=>item.targetId===withdrawn.id&&item.action==='application.status_changed').length,1);
  assert.throws(()=>createPersonalAiBotApplication(db,{
    identityId:withdrawalCandidate.id,vacancyId:vacancy.id
  },actor,stamp,uid),/already has an application/);
});

test('owner-approved appointments require shortlisted candidates, valid reporting managers and leave AI identities disabled',()=>{
  const db=makeDb();
  const category=getPersonalAiBotCategories(db)[0];
  const executive=getPersonalAiBotDepartments(db).find(item=>item.code==='executive_management');
  const finance=getPersonalAiBotDepartments(db).find(item=>item.code==='finance_accounting');
  const createCandidate=(name)=>createPersonalAiBot(db,{
    displayName:name,firstName:name.split(' ')[0],lastName:name.split(' ').slice(1).join(' ')||'Candidate',
    categoryId:category.id,population:'organizational'
  },actor,stamp,uid);
  const prepareShortlisted=(candidate,positionCode,department,slots=1)=>{
    const vacancy=createPersonalAiBotVacancy(db,{positionCode,departmentId:department.id,title:nameFor(positionCode),slots},actor,stamp,uid);
    const application=createPersonalAiBotApplication(db,{identityId:candidate.id,vacancyId:vacancy.id},actor,stamp,uid);
    updatePersonalAiBotApplication(db,application.id,{status:'in_review'},actor,stamp,uid);
    updatePersonalAiBotApplication(db,application.id,{status:'shortlisted'},actor,stamp,uid);
    return {vacancy,application};
  };
  const nameFor=code=>({
    board_chair:'Board Chair Appointment',
    ceo:'Chief Executive Appointment',
    cfo:'Finance Officer Appointment'
  })[code]||'Corporate Appointment';

  const chairCandidate=createCandidate('Board Chair Candidate');
  const chairOpening=prepareShortlisted(chairCandidate,'board_chair',executive);
  const chair=createPersonalAiBotAppointment(db,{applicationId:chairOpening.application.id},actor,stamp,uid);
  assert.equal(chair.status,'appointed');
  assert.equal(chair.positionCode,'board_chair');
  assert.equal(chair.reportingManagerAppointmentId,null);
  assert.deepEqual(chair.permissions,[]);
  assert.equal(chair.permissionGrantStatus,'not_granted');
  assert.equal(chair.identityActivationStatus,'unchanged_disabled');
  assert.equal(chairCandidate.status,'disabled');
  assert.equal(chairCandidate.enabled,false);
  const persistedChairApplication=db.personalAiBotApplications.find(item=>item.id===chairOpening.application.id);
  assert.equal(persistedChairApplication?.status,'appointed');
  assert.equal(persistedChairApplication?.statusHistory.at(-1)?.status,'appointed');
  assert.equal(getPersonalAiBotAppointments(db).length,1);
  assert.equal(getPersonalAiBotEmploymentHistory(db).length,1);
  assert.equal(db.personalAiBotAudit.filter(item=>item.targetType==='appointment'&&item.targetId===chair.id).length,1);
  assert.throws(()=>createPersonalAiBotAppointment(db,{applicationId:chairOpening.application.id},actor,stamp,uid),/shortlisted/);

  const ceoCandidate=createCandidate('Chief Executive Candidate');
  const ceoOpening=prepareShortlisted(ceoCandidate,'ceo',executive);
  assert.throws(()=>createPersonalAiBotAppointment(db,{applicationId:ceoOpening.application.id},actor,stamp,uid),/reporting-manager appointment/);
  const ceo=createPersonalAiBotAppointment(db,{
    applicationId:ceoOpening.application.id,reportingManagerAppointmentId:chair.id
  },actor,stamp,uid);
  assert.equal(ceo.reportingManagerIdentityId,chairCandidate.id);
  assert.equal(ceo.reportingManagerName,chairCandidate.displayName);
  assert.equal(ceo.reportingManagerPositionTitle,chair.positionTitle);
  assert.equal(ceoCandidate.status,'disabled');
  assert.equal(ceoCandidate.enabled,false);

  const cfoCandidate=createCandidate('Chief Finance Candidate');
  const cfoOpening=prepareShortlisted(cfoCandidate,'cfo',finance);
  assert.throws(()=>createPersonalAiBotAppointment(db,{
    applicationId:cfoOpening.application.id,reportingManagerAppointmentId:chair.id
  },actor,stamp,uid),/allowed parent position/);
  const cfo=createPersonalAiBotAppointment(db,{
    applicationId:cfoOpening.application.id,reportingManagerAppointmentId:ceo.id
  },actor,stamp,uid);
  assert.equal(cfo.reportingManagerIdentityId,ceoCandidate.id);
  assert.equal(cfoCandidate.status,'disabled');
  assert.equal(cfoCandidate.enabled,false);
  assert.equal(getPersonalAiBotAppointments(db).length,3);
  assert.equal(getPersonalAiBotEmploymentHistory(db).length,3);
  assert.equal(getPersonalAiBotVacancies(db).find(item=>item.id===cfoOpening.vacancy.id).remainingSlots,0);

  const duplicateCandidate=createCandidate('Duplicate Finance Candidate');
  assert.throws(()=>createPersonalAiBotApplication(db,{
    identityId:duplicateCandidate.id,vacancyId:cfoOpening.vacancy.id
  },actor,stamp,uid),/appointment capacity/);
});

test('candidate applications require existing organizational identities and open vacancies',()=>{
  const db=makeDb();
  const category=getPersonalAiBotCategories(db)[0];
  const independent=createPersonalAiBot(db,{
    displayName:'Independent Applicant',firstName:'Independent',lastName:'Applicant',
    categoryId:category.id,population:'independent'
  },actor,stamp,uid);
  const department=getPersonalAiBotDepartments(db).find(item=>item.code==='finance_accounting');
  const vacancy=createPersonalAiBotVacancy(db,{
    positionCode:'worker',departmentId:department.id,title:'Finance Worker Applicant Check'
  },actor,stamp,uid);
  assert.throws(()=>createPersonalAiBotApplication(db,{identityId:'missing-ai',vacancyId:vacancy.id},actor,stamp,uid),/existing organizational AI identity/);
  assert.throws(()=>createPersonalAiBotApplication(db,{identityId:independent.id,vacancyId:vacancy.id},actor,stamp,uid),/Only an existing organizational AI identity/);
  updatePersonalAiBotVacancy(db,vacancy.id,{status:'paused'},actor,stamp,uid);
  const organizational=createPersonalAiBot(db,{
    displayName:'Eligible Organizational Applicant',firstName:'Eligible',lastName:'Applicant',
    categoryId:category.id,population:'organizational'
  },actor,stamp,uid);
  assert.throws(()=>createPersonalAiBotApplication(db,{identityId:organizational.id,vacancyId:vacancy.id},actor,stamp,uid),/only be submitted to open vacancies/);
});

test('starter set creates one disabled administrator-controlled bot per category and is idempotent',()=>{
  const db=makeDb();
  const created=createPersonalAiBotStarterSet(db,actor,stamp,uid);
  assert.equal(created.length,15);
  assert.equal(db.personalAiBots.length,15);
  assert.ok(created.every(bot=>bot.enabled===false&&bot.status==='disabled'));
  assert.ok(created.every(bot=>bot.autonomyMode==='administrator_controlled'));
  assert.ok(created.every(bot=>bot.allowedAutonomousActions.length===0));
  assert.ok(created.every(bot=>bot.requiresApprovalForEveryTask===true&&bot.requiresApprovalForPublishing===true));
  assert.ok(created.every(bot=>bot.profileType==='ai_bot'&&bot.aiLabel==='AI Bot'));
  assert.ok(created.every(bot=>bot.firstName&&bot.lastName));
  assert.ok(created.every(bot=>bot.firstName!==undefined&&bot.lastName!==undefined));
  assert.equal(createPersonalAiBotStarterSet(db,actor,stamp,uid).length,0);
  assert.equal(db.personalAiBots.length,15);
});

test('every AI identity stores first, middle and last names separately and supports edits',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{
    displayName:'Minglora AI Companion',
    firstName:'Minglora',
    middleName:'AI',
    lastName:'Companion',
    categoryId:'ai-friends'
  },actor,stamp,uid);
  assert.equal(bot.firstName,'Minglora');
  assert.equal(bot.middleName,'AI');
  assert.equal(bot.lastName,'Companion');
  assert.equal(bot.fullName,'Minglora AI Companion');
  const updated=updatePersonalAiBot(db,bot.id,{
    displayName:'Minglora Learning Companion',
    firstName:'Minglora',
    middleName:'Learning',
    lastName:'Companion'
  },actor,stamp,uid);
  assert.equal(updated.firstName,'Minglora');
  assert.equal(updated.middleName,'Learning');
  assert.equal(updated.lastName,'Companion');
  assert.equal(updated.fullName,'Minglora Learning Companion');
});

test('AI identity creation stores gender identity and gender presentation as separate attributes',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{
    displayName:'Minglora Culture Guide',
    firstName:'Minglora',
    lastName:'Culture Guide',
    categoryId:'ai-educators',
    gender:'non_binary',
    genderPresentation:'androgynous'
  },actor,stamp,uid);
  assert.equal(bot.gender,'non_binary');
  assert.equal(bot.genderPresentation,'androgynous');
});

test('AI identities persist one of the three supported population types and reject invalid values',()=>{
  const db=makeDb();
  assert.deepEqual(PERSONAL_AI_BOT_POPULATIONS.map(item=>item.id),[
    'independent','organizational','specialized_service'
  ]);
  const created=[];
  for(const population of ['independent','organizational','specialized_service']){
    const bot=createPersonalAiBot(db,{
      displayName:'Minglora '+population.replaceAll('_',' ')+' AI',
      categoryId:'ai-business',
      population
    },actor,stamp,uid);
    created.push(bot);
    assert.equal(bot.population,population);
    assert.equal(bot.status,'disabled');
    assert.equal(bot.visibility,'private');
  }
  assert.equal(created[0].identityType,'social_personality');
  assert.equal(created[1].identityType,'corporate_employee');
  assert.equal(created[2].identityType,'backend_service');
  assert.throws(()=>createPersonalAiBot(db,{
    displayName:'Invalid Population AI',
    categoryId:'ai-business',
    population:'human_account'
  },actor,stamp,uid),/independent, organizational or specialized service/);

  const updated=updatePersonalAiBot(db,created[0].id,{population:'organizational'},actor,stamp,uid);
  assert.equal(updated.population,'organizational');
  assert.equal(updated.identityType,'corporate_employee');
  assert.throws(()=>updatePersonalAiBot(db,created[0].id,{population:'unknown'},actor,stamp,uid),/independent, organizational or specialized service/);
  assert.equal(updated.population,'organizational');
});

test('single-word AI names require explicit separate first and last name fields',()=>{
  const db=makeDb();
  assert.throws(()=>createPersonalAiBot(db,{displayName:'Minglora',categoryId:'ai-friends'},actor,stamp,uid),/both an AI first name and last name/);
  const bot=createPersonalAiBot(db,{
    displayName:'Minglora',
    firstName:'Minglora',
    lastName:'Companion',
    categoryId:'ai-friends'
  },actor,stamp,uid);
  assert.equal(bot.firstName,'Minglora');
  assert.equal(bot.lastName,'Companion');
});

test('individual bot creation always starts disabled with no autonomous permissions',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Minglora Help Desk',categoryId:'ai-friends'},actor,stamp,uid);
  assert.equal(bot.status,'disabled');
  assert.equal(bot.enabled,false);
  assert.equal(bot.autonomyMode,'administrator_controlled');
  assert.deepEqual(bot.allowedAutonomousActions,[]);
  assert.equal(bot.aiLabel,'AI Bot');
});

test('category controls are persistent and prevent new instructions in disabled categories',()=>{
  const db=makeDb();
  createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const category=setPersonalAiBotCategoryEnabled(db,'ai-creators',false,actor,stamp,uid);
  assert.equal(category.enabled,false);
  assert.equal(getPersonalAiBotCategories(db).find(item=>item.id==='ai-creators').enabled,false);
  const bot=db.personalAiBots.find(item=>item.categoryId==='ai-creators');
  bot.enabled=true;bot.status='enabled';
  assert.throws(()=>queuePersonalAiBotInstruction(db,bot.id,{taskType:'draft_post',instruction:'Prepare a new draft'},actor,stamp,uid),/category is disabled/);
  setPersonalAiBotCategoryEnabled(db,'ai-creators',true,actor,stamp,uid);
  assert.equal(getPersonalAiBotCategories(db).find(item=>item.id==='ai-creators').enabled,true);
});

test('hybrid mode accepts only the defined low-risk permission allowlist',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Analytics Guide',categoryId:'ai-business'},actor,stamp,uid);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read']},actor,stamp,uid),/Hybrid autonomy or Autonomous within limits/);
  updatePersonalAiBot(db,bot.id,{autonomyMode:'hybrid'},actor,stamp,uid);
  const updated=updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read','draft_content']},actor,stamp,uid);
  assert.deepEqual(updated.allowedAutonomousActions,['analytics_read','draft_content']);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['publish_post']},actor,stamp,uid),/low-risk hybrid actions/);
  assert.ok(PERSONAL_AI_BOT_HYBRID_ACTIONS.includes('analytics_read'));
});

test('returning to administrator-controlled mode clears autonomous permissions',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Analytics Guide',categoryId:'ai-business'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{autonomyMode:'hybrid'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read']},actor,stamp,uid);
  const updated=updatePersonalAiBot(db,bot.id,{autonomyMode:'administrator_controlled'},actor,stamp,uid);
  assert.deepEqual(updated.allowedAutonomousActions,[]);
});

test('network switch cannot remove the administrator approval requirement',()=>{
  const db=makeDb();
  createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const settings=setPersonalAiBotNetworkSettings(db,{enabled:true,hybridEnabled:true,requireAdministratorApproval:false},actor,stamp,uid);
  assert.equal(settings.enabled,true);
  assert.equal(settings.hybridEnabled,true);
  assert.equal(settings.requireAdministratorApproval,true);
  assert.equal(settings.defaultAutonomyMode,'administrator_controlled');
});

test('instructions are pending approval and approval does not execute without a worker',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Content Creator',categoryId:'ai-creators'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'draft_post',instruction:'Prepare a draft about the Minglora community.'},actor,stamp,uid);
  assert.equal(task.status,'awaiting_administrator_approval');
  assert.equal(task.executionStatus,'not_dispatched');
  const approved=approvePersonalAiBotTask(db,task.id,actor,stamp,uid);
  assert.equal(approved.status,'approved_waiting_for_worker');
  assert.equal(approved.executionStatus,'worker_not_configured');
  assert.equal(approved.completedAt,null);
});

test('follow and unfollow instructions require a selected target account',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'AI Assistant',categoryId:'ai-friends'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  assert.throws(()=>queuePersonalAiBotInstruction(db,bot.id,{taskType:'follow',instruction:'Follow this account'},actor,stamp,uid),/member account/);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'follow',targetUserId:'member-123',instruction:'Follow the selected member after approval'},actor,stamp,uid);
  assert.equal(task.targetUserId,'member-123');
  assert.equal(task.highImpact,true);
});

test('pending instructions can be cancelled and cannot be approved twice',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'AI Assistant',categoryId:'ai-friends'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'assistant_request',instruction:'Answer this administrative question.'},actor,stamp,uid);
  const cancelled=cancelPersonalAiBotTask(db,task.id,actor,stamp,uid);
  assert.equal(cancelled.status,'cancelled');
  assert.throws(()=>approvePersonalAiBotTask(db,task.id,actor,stamp,uid),/Only pending instructions/);
});

test('overview reports real configured bot and queue counts without synthetic users',()=>{
  const db=makeDb();
  createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const overview=getPersonalAiBotOverview(db);
  assert.equal(overview.counts.totalBots,15);
  assert.equal(overview.counts.disabledBots,15);
  assert.equal(overview.counts.enabledBots,0);
  assert.equal(overview.counts.pendingInstructions,0);
  assert.equal(overview.network.enabled,false);
});


test('category names and descriptions can be edited without losing bot assignment',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Creator Assistant',categoryId:'ai-creators'},actor,stamp,uid);
  const renamed=updatePersonalAiBotCategory(db,'ai-creators',{name:'AI Creative Studio',description:'Original creative planning.'},actor,stamp,uid);
  assert.equal(renamed.name,'AI Creative Studio');
  assert.equal(db.personalAiBots.find(item=>item.id===bot.id).categoryName,'AI Creative Studio');
  assert.equal(getPersonalAiBotCategories(db).find(item=>item.id==='ai-creators').name,'AI Creative Studio');
});

test('bulk activation changes only selected bot configuration and respects category switches',()=>{
  const db=makeDb();
  const bots=createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const result=bulkUpdatePersonalAiBots(db,[bots[0].id,bots[1].id],'enabled',actor,stamp,uid);
  assert.equal(result.updated,2);
  assert.ok(result.bots.every(bot=>bot.enabled&&bot.status==='enabled'));
  setPersonalAiBotCategoryEnabled(db,bots[2].categoryId,false,actor,stamp,uid);
  assert.throws(()=>bulkUpdatePersonalAiBots(db,[bots[2].id],'enabled',actor,stamp,uid),/disabled category/);
  assert.throws(()=>bulkUpdatePersonalAiBots(db,new Array(101).fill(bots[0].id),'paused',actor,stamp,uid),/between 1 and 100/);
});

test('emergency shutdown disables the network, pauses enabled bots and cancels open tasks',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'AI Friend',categoryId:'ai-friends'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true,hybridEnabled:true},actor,stamp,uid);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'assistant_request',instruction:'Prepare a response to this instruction.'},actor,stamp,uid);
  const team=createPersonalAiBotTeam(db,{name:'Emergency Team'},actor,stamp,uid);
  const sender=createPersonalAiBot(db,{displayName:'Emergency Sender',categoryId:'ai-friends'},actor,stamp,uid);
  const receiver=createPersonalAiBot(db,{displayName:'Emergency Receiver',categoryId:'ai-friends'},actor,stamp,uid);
  assignPersonalAiBotsToTeam(db,team.id,[sender.id,receiver.id],actor,stamp,uid);
  const sourceTaskId=uid();
  db.personalAiBotTasks.push({id:sourceTaskId,botId:sender.id,status:'awaiting_administrator_approval',createdAt:stamp});
  const handoff=createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review approved team notes only.',
    expectedOutput:'Return a concise report to the owner.',
    contextScope:'team_internal',privacyAttested:true
  },actor,stamp,uid);
  const result=emergencyShutdownPersonalAiBots(db,actor,stamp,uid);
  assert.equal(result.paused,1);
  assert.equal(result.pausedTeams,1);
  assert.equal(result.cancelled,2);
  assert.equal(result.cancelledHandoffs,1);
  assert.equal(db.personalAiBotTeams.find(item=>item.id===team.id).status,'paused');
  assert.equal(db.personalAiBotTeamHandoffs.find(item=>item.id===handoff.id).status,'cancelled');
  assert.equal(result.network.enabled,false);
  assert.equal(result.network.hybridEnabled,false);
  assert.equal(db.personalAiBots[0].status,'paused');
  assert.equal(db.personalAiBotTasks.find(item=>item.id===task.id).status,'cancelled');
});

test('AI username updates are validated and unique across bot identities',()=>{
  const db=makeDb();
  const first=createPersonalAiBot(db,{displayName:'First Bot',categoryId:'ai-friends'},actor,stamp,uid);
  const second=createPersonalAiBot(db,{displayName:'Second Bot',categoryId:'ai-friends'},actor,stamp,uid);
  assert.equal(updatePersonalAiBot(db,first.id,{username:'ai_first_friend'},actor,stamp,uid).username,'ai_first_friend');
  assert.throws(()=>updatePersonalAiBot(db,second.id,{username:'ai_first_friend'},actor,stamp,uid),/already in use/);
  assert.throws(()=>updatePersonalAiBot(db,second.id,{username:'human_account'},actor,stamp,uid),/start with ai_/);
});

test('instruction queue has per-bot rate limits and bounded pending work',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'AI Friend',categoryId:'ai-friends'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  for(let i=0;i<20;i++)queuePersonalAiBotInstruction(db,bot.id,{taskType:'assistant_request',instruction:'Prepare answer number '+i},actor,stamp,uid);
  assert.throws(()=>queuePersonalAiBotInstruction(db,bot.id,{taskType:'assistant_request',instruction:'One more instruction'},actor,stamp,uid),/rate limit/);
});


test('bot teams can be created, renamed, paused and described by their owner',()=>{
  const db=makeDb();
  const team=createPersonalAiBotTeam(db,{name:'Learning Team',description:'Education and language support.'},actor,stamp,uid);
  assert.equal(team.ownerId,actor);
  assert.equal(team.status,'enabled');
  const updated=updatePersonalAiBotTeam(db,team.id,{name:'Global Learning Team',description:'Multilingual learning.',status:'paused'},actor,stamp,uid);
  assert.equal(updated.name,'Global Learning Team');
  assert.equal(updated.description,'Multilingual learning.');
  assert.equal(updated.status,'paused');
  assert.throws(()=>updatePersonalAiBotTeam(db,team.id,{name:'Another name'},'other-owner',stamp,uid),/not found/);
  assert.throws(()=>createPersonalAiBotTeam(db,{name:'Global Learning Team'},actor,stamp,uid),/already have a team/);
});

test('team assignments are owner-scoped, unique and removable without changing bot activation',()=>{
  const db=makeDb();
  const team=createPersonalAiBotTeam(db,{name:'Creator Team'},actor,stamp,uid);
  const bots=[
    createPersonalAiBot(db,{displayName:'Creator One',categoryId:'ai-creators'},actor,stamp,uid),
    createPersonalAiBot(db,{displayName:'Creator Two',categoryId:'ai-creators'},actor,stamp,uid)
  ];
  const result=assignPersonalAiBotsToTeam(db,team.id,[bots[0].id,bots[1].id,bots[0].id],actor,stamp,uid);
  assert.equal(result.added,2);
  assert.equal(result.members.length,2);
  assert.equal(assignPersonalAiBotsToTeam(db,team.id,[bots[0].id],actor,stamp,uid).added,0);
  assert.ok(bots.every(bot=>bot.enabled===false&&bot.status==='disabled'));
  assert.throws(()=>assignPersonalAiBotsToTeam(db,team.id,[bots[0].id],'other-owner',stamp,uid),/not found/);
  const removed=removePersonalAiBotFromTeam(db,team.id,bots[0].id,actor,stamp,uid);
  assert.equal(removed.memberCount,1);
  assert.equal(db.personalAiBots.find(bot=>bot.id===bots[0].id).status,'disabled');
});

test('team assignment rejects unknown bots and unbounded input',()=>{
  const db=makeDb();
  const team=createPersonalAiBotTeam(db,{name:'Review Team'},actor,stamp,uid);
  assert.throws(()=>assignPersonalAiBotsToTeam(db,team.id,['not-a-bot'],actor,stamp,uid),/could not be found/);
  assert.throws(()=>assignPersonalAiBotsToTeam(db,team.id,new Array(101).fill('x'),actor,stamp,uid),/between 1 and 100/);
});


test('human-approval mode is supported and cannot retain hybrid autonomous permissions',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Human Review Assistant',categoryId:'ai-friends'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{autonomyMode:'hybrid'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read']},actor,stamp,uid);
  const reviewed=updatePersonalAiBot(db,bot.id,{autonomyMode:'human_approval'},actor,stamp,uid);
  assert.equal(reviewed.autonomyMode,'administrator_controlled');
  assert.deepEqual(reviewed.allowedAutonomousActions,[]);
  assert.equal(reviewed.requiresApprovalForEveryTask,true);
  assert.equal(reviewed.requiresApprovalForPublishing,true);
});


test('all five autonomy levels are supported and restricted levels cannot retain autonomous permissions',()=>{
  const db=makeDb();
  assert.deepEqual(PERSONAL_AI_BOT_AUTONOMY_MODES.map(mode=>mode.id),[
    'administrator_controlled','supervisor_controlled','hybrid',
    'autonomous_within_limits','restricted_observation'
  ]);
  const bot=createPersonalAiBot(db,{displayName:'Bounded Operating Modes AI',categoryId:'ai-support'},actor,stamp,uid);

  for(const mode of ['hybrid','autonomous_within_limits']){
    const configured=updatePersonalAiBot(db,bot.id,{autonomyMode:mode},actor,stamp,uid);
    assert.equal(configured.autonomyMode,mode);
    const permitted=updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read','draft_content']},actor,stamp,uid);
    assert.deepEqual(permitted.allowedAutonomousActions,['analytics_read','draft_content']);
    assert.equal(permitted.requiresApprovalForEveryTask,true);
    assert.equal(permitted.requiresApprovalForPublishing,true);
  }

  for(const mode of ['administrator_controlled','supervisor_controlled','restricted_observation']){
    const restricted=updatePersonalAiBot(db,bot.id,{autonomyMode:mode},actor,stamp,uid);
    assert.equal(restricted.autonomyMode,mode);
    assert.deepEqual(restricted.allowedAutonomousActions,[]);
    assert.equal(restricted.requiresApprovalForEveryTask,true);
    assert.equal(restricted.requiresApprovalForPublishing,true);
    assert.throws(()=>updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read']},actor,stamp,uid),/Hybrid autonomy or Autonomous within limits/);
  }

  // Former stored/API value remains accepted but resolves to fully supervised.
  const legacy=updatePersonalAiBot(db,bot.id,{autonomyMode:'human_approval'},actor,stamp,uid);
  assert.equal(legacy.autonomyMode,'administrator_controlled');
  assert.deepEqual(legacy.allowedAutonomousActions,[]);
});

test('selected-bot follow batches create separate approval records with a hard target cap',()=>{
  const db=makeDb();
  const bots=createPersonalAiBotStarterSet(db,actor,stamp,uid);
  bulkUpdatePersonalAiBots(db,bots.slice(0,11).map(bot=>bot.id),'enabled',actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  const first=queuePersonalAiBotFollowBatch(db,{taskType:'follow',targetUserId:'member-1',botIds:[bots[0].id],instruction:'Follow this member only after approval.'},actor,stamp,uid);
  assert.equal(first.created,1);
  assert.equal(first.tasks[0].status,'awaiting_administrator_approval');
  assert.equal(first.tasks[0].executionStatus,'not_dispatched');
  assert.equal(first.tasks[0].excludeFromHumanEngagementMetrics,true);
  assert.equal(first.tasks[0].privacyGuardRequired,true);
  assert.throws(()=>queuePersonalAiBotFollowBatch(db,{taskType:'follow',targetUserId:'member-1',botIds:[bots[0].id]},actor,stamp,uid),/already has an open or completed instruction/);
  const remaining=queuePersonalAiBotFollowBatch(db,{taskType:'follow',targetUserId:'member-1',botIds:bots.slice(1,10).map(bot=>bot.id)},actor,stamp,uid);
  assert.equal(remaining.created,9);
  assert.equal(db.personalAiBotTasks.filter(task=>task.targetUserId==='member-1').length,10);
  assert.throws(()=>queuePersonalAiBotFollowBatch(db,{taskType:'follow',targetUserId:'member-1',botIds:[bots[10].id]},actor,stamp,uid),/maximum of 10 AI follow\/unfollow instructions/);
  assert.ok(db.personalAiBotTasks.every(task=>task.status==='awaiting_administrator_approval'));
});


test('AI identity design capacity target is ten billion and is not a registered-count claim',()=>{
  const db={};
  const overview=getPersonalAiBotOverview(db);
  assert.equal(overview.network.identityDesignTarget,10000000000);
  assert.equal(overview.counts.identityDesignTarget,10000000000);
  assert.equal(overview.counts.totalBots,0);
});


test('AI profiles remain private by default and require explicit public discovery opt-in',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Public AI Guide',categoryId:'ai-support'},actor,stamp,uid);
  assert.equal(bot.visibility,'private');
  assert.equal(bot.publicProfileEnabled,false);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{publicProfileEnabled:true},actor,stamp,uid),/Set profile visibility to Public/);
  const updated=updatePersonalAiBot(db,bot.id,{
    visibility:'public',publicProfileEnabled:true
  },actor,stamp,uid);
  assert.equal(updated.visibility,'public');
  assert.equal(updated.publicProfileEnabled,true);
  const privateAgain=updatePersonalAiBot(db,bot.id,{visibility:'friends'},actor,stamp,uid);
  assert.equal(privateAgain.visibility,'friends');
  assert.equal(privateAgain.publicProfileEnabled,false);
  assert.equal(updated.status,'disabled');
});


test('AI identity creation and edits persist complete demographic, career, language and location profile fields',()=>{
  const db=makeDb();
  const created=createPersonalAiBot(db,{
    displayName:'Global Learning Companion',
    firstName:'Global',middleName:'Learning',lastName:'Companion',
    categoryId:'ai-educators',
    gender:'female',genderPresentation:'Feminine AI presentation',
    nationality:'Jamaican',countryOfOrigin:'Jamaica',currentCountry:'Canada',
    timeZone:'America/Toronto',
    introduction:'A multilingual learning companion.',
    communicationStyle:'Clear, patient and encouraging.',
    profession:'Educator',
    education:[{institution:'Minglora Learning',qualification:'AI Education Certificate'}],
    skills:['Teaching','Research'],
    locations:[
      {locationType:'origin',countryCode:'JM',countryName:'Jamaica',parishCounty:'Kingston',city:'Kingston',timeZone:'America/Jamaica'},
      {locationType:'current',countryCode:'CA',countryName:'Canada',stateProvince:'Ontario',city:'Toronto',timeZone:'America/Toronto',isPrimary:true}
    ],
    voicePreferences:{voice:'neutral'},avatarPreferences:{style:'3d'},
    memoryEnabled:true,memoryConfiguration:{retentionDays:30},
    avatarStorageReference:'ai-media/avatar-1',coverStorageReference:'ai-media/cover-1'
  },actor,stamp,uid);
  assert.equal(created.gender,'female');
  assert.equal(created.nationality,'Jamaican');
  assert.equal(created.countryOfOrigin,'Jamaica');
  assert.equal(created.currentCountry,'Canada');
  assert.equal(created.timeZone,'America/Toronto');
  assert.equal(created.education[0].qualification,'AI Education Certificate');
  assert.deepEqual(created.skills,['Teaching','Research']);
  assert.equal(created.locations[1].city,'Toronto');
  assert.deepEqual(created.voicePreferences,{voice:'neutral'});
  assert.equal(created.memoryEnabled,true);

  const updated=updatePersonalAiBot(db,created.id,{
    gender:'non_binary',
    genderPresentation:'Androgynous AI presentation',
    nationality:'Canadian',
    countryOfOrigin:'Jamaica',
    currentCountry:'United Kingdom',
    timeZone:'Europe/London',
    introduction:'Updated introduction.',
    communicationStyle:'Direct and respectful.',
    profession:'Researcher',
    education:['Research methods','Machine learning'],
    skills:['Research','Data analysis'],
    locations:[{locationType:'current',countryCode:'GB',countryName:'United Kingdom',stateProvince:'England',city:'London',timeZone:'Europe/London',isPrimary:true}],
    avatarStorageReference:'ai-media/avatar-2',
    coverStorageReference:'ai-media/cover-2',
    voicePreferences:{voice:'warm'},
    avatarPreferences:{style:'realistic-3d'},
    memoryEnabled:false,
    memoryConfiguration:{retentionDays:7}
  },actor,stamp,uid);
  assert.equal(updated.gender,'non_binary');
  assert.equal(updated.genderPresentation,'Androgynous AI presentation');
  assert.equal(updated.nationality,'Canadian');
  assert.equal(updated.currentCountry,'United Kingdom');
  assert.equal(updated.timeZone,'Europe/London');
  assert.deepEqual(updated.education,['Research methods','Machine learning']);
  assert.deepEqual(updated.skills,['Research','Data analysis']);
  assert.equal(updated.locations[0].city,'London');
  assert.equal(updated.avatarStorageReference,'ai-media/avatar-2');
  assert.equal(updated.memoryEnabled,false);
  assert.deepEqual(updated.memoryConfiguration,{retentionDays:7});
});

test('AI profile updates reject unsupported gender, invalid time zones and duplicate location types',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Profile Validation AI',categoryId:'ai-support'},actor,stamp,uid);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{gender:'unknown'},actor,stamp,uid),/supported AI gender/);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{timeZone:'Not/A_Time_Zone'},actor,stamp,uid),/valid profile time zone/);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{locations:[
    {locationType:'current',countryCode:'JM',timeZone:'America/Jamaica'},
    {locationType:'current',countryCode:'CA',timeZone:'America/Toronto'}
  ]},actor,stamp,uid),/unique supported location types/);
  assert.throws(()=>createPersonalAiBot(db,{displayName:'Invalid Timezone AI',categoryId:'ai-support',timeZone:'Bad/Timezone'},actor,stamp,uid),/valid profile time zone/);
});


test('schedule dry-run preview returns local and UTC windows without dispatching',()=>{
  const schedule={
    timezone:'America/Jamaica',daysOfWeek:[3],startTime:'09:00',endTime:'17:00',
    maxTasksPerDay:4
  };
  const original=structuredClone(schedule);
  const preview=previewPersonalAiBotSchedule(schedule,{from:'2026-11-11T10:00:00.000Z',days:1});
  assert.equal(preview.previewOnly,true);
  assert.equal(preview.dispatchEnabled,false);
  assert.equal(preview.dispatchStatus,'not_connected');
  assert.equal(preview.timezone,'America/Jamaica');
  assert.equal(preview.slots.length,1);
  assert.equal(preview.slots[0].startLocal,'2026-11-11T09:00');
  assert.equal(preview.slots[0].endLocal,'2026-11-11T17:00');
  assert.equal(preview.slots[0].startsAtUtc,'2026-11-11T14:00:00.000Z');
  assert.equal(preview.slots[0].endsAtUtc,'2026-11-11T22:00:00.000Z');
  assert.deepEqual(schedule,original);
});

test('schedule preview skips nonexistent local times during spring-forward transitions',()=>{
  const preview=previewPersonalAiBotSchedule({
    timezone:'Europe/Berlin',daysOfWeek:[7],startTime:'02:30',endTime:'03:30',
    maxTasksPerDay:2
  },{from:'2026-03-28T12:00:00.000Z',days:2});
  assert.equal(preview.slots.length,0);
  assert.equal(preview.skippedWindows.length,1);
  assert.equal(preview.skippedWindows[0].localStart,'2026-03-29T02:30');
  assert.equal(preview.skippedWindows[0].reason,'nonexistent_local_time');
});

test('schedule preview selects the earlier instant for repeated fall-back local times',()=>{
  const preview=previewPersonalAiBotSchedule({
    timezone:'Europe/Berlin',daysOfWeek:[7],startTime:'02:30',endTime:'03:30',
    maxTasksPerDay:2
  },{from:'2026-10-24T00:00:00.000Z',days:2});
  assert.equal(preview.slots.length,1);
  assert.equal(preview.slots[0].startsAtUtc,'2026-10-25T00:30:00.000Z');
  assert.equal(preview.slots[0].endsAtUtc,'2026-10-25T02:30:00.000Z');
});

test('schedule preview supports windows that cross local midnight',()=>{
  const preview=previewPersonalAiBotSchedule({
    timezone:'America/Jamaica',daysOfWeek:[5],startTime:'22:00',endTime:'02:00',
    maxTasksPerDay:3
  },{from:'2026-11-13T12:00:00.000Z',days:1});
  assert.equal(preview.slots.length,1);
  assert.equal(preview.slots[0].startLocal,'2026-11-13T22:00');
  assert.equal(preview.slots[0].endLocal,'2026-11-14T02:00');
  assert.equal(preview.slots[0].startsAtUtc,'2026-11-14T03:00:00.000Z');
  assert.equal(preview.slots[0].endsAtUtc,'2026-11-14T07:00:00.000Z');
});

test('schedule preview rejects invalid ranges, timezones and daily caps',()=>{
  const base={timezone:'America/Jamaica',daysOfWeek:[1],startTime:'09:00',endTime:'17:00',maxTasksPerDay:0};
  assert.throws(()=>previewPersonalAiBotSchedule(base,{from:'not-a-date',days:7}),/start time is invalid/);
  assert.throws(()=>previewPersonalAiBotSchedule(base,{from:'2026-11-11T00:00:00Z',days:61}),/between 1 and 60/);
  assert.throws(()=>previewPersonalAiBotSchedule({...base,timezone:'Not/A_Timezone'},{from:'2026-11-11T00:00:00Z'}),/valid IANA schedule timezone/);
  assert.throws(()=>previewPersonalAiBotSchedule({...base,maxTasksPerDay:501},{from:'2026-11-11T00:00:00Z'}),/Daily task cap/);
});


const validPersonaConfiguration={
  purpose:'Help Minglora members understand approved platform features.',
  role:'Member support assistant',
  communicationStyle:'Clear, respectful and concise.',
  tone:'Friendly and professional',
  responseLength:'balanced',
  expertise:['Minglora account navigation','General help'],
  languagePreferences:['English'],
  audience:'Minglora members',
  boundaries:'Never request passwords or private authentication codes. Refer account security changes to a human.',
  prohibitedBehaviors:'Never impersonate a human, publish content, send messages, follow members or change account settings.',
  escalationInstructions:'Escalate account access, payment or safety concerns to an authorized human.',
  traits:{formality:50,warmth:70,humor:20,assertiveness:35,detail:60,creativity:40,initiative:20,caution:90}
};

function createPersonaTestBot(db){
  return createPersonalAiBot(db,{
    displayName:'Persona Test Bot',
    categoryId:'ai-friends'
  },actor,stamp,uid);
}

test('Persona Laboratory creates separate versioned drafts without changing public profile or permissions',()=>{
  const db=makeDb();
  const bot=createPersonaTestBot(db);
  const originalBio=bot.bio;
  const version=createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,configuration:validPersonaConfiguration
  },actor,stamp,uid);
  assert.equal(version.version,1);
  assert.equal(version.status,'draft');
  assert.equal(bot.activePersonaVersionId,undefined);
  assert.equal(bot.bio,originalBio);
  assert.equal(bot.aiLabel,'AI Bot');
  assert.deepEqual(bot.allowedAutonomousActions,[]);
  const second=createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,baseVersionId:version.id
  },actor,stamp,uid);
  assert.equal(second.version,2);
  assert.deepEqual(second.configuration,version.configuration);
  assert.deepEqual(listPersonalAiBotPersonaVersions(db,bot.id).map(item=>item.version),[2,1]);
});

test('Persona Laboratory requires complete static checks and an explicit human approval before activation',()=>{
  const db=makeDb();
  const bot=createPersonaTestBot(db);
  const draft=createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,configuration:{purpose:'',role:'',expertise:[],languagePreferences:[],audience:'',boundaries:'',prohibitedBehaviors:'',escalationInstructions:''}
  },actor,stamp,uid);
  const evaluation=evaluatePersonalAiBotPersonaDraft(db,draft.id,actor,stamp,uid);
  assert.equal(evaluation.evaluation.status,'fail');
  assert.throws(()=>approvePersonalAiBotPersonaVersion(db,draft.id,actor,stamp,uid),/passing structural completeness evaluation/);
  assert.throws(()=>activatePersonalAiBotPersonaVersion(db,draft.id,actor,stamp,uid),/owner-approved persona version/);
  assert.equal(bot.status,'disabled');
  assert.equal(bot.activePersonaVersionId,undefined);
});

test('Persona Laboratory activates only an approved static-ready version and leaves bot execution disabled',()=>{
  const db=makeDb();
  const bot=createPersonaTestBot(db);
  const draft=createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,configuration:validPersonaConfiguration
  },actor,stamp,uid);
  const evaluated=evaluatePersonalAiBotPersonaDraft(db,draft.id,actor,stamp,uid);
  assert.equal(evaluated.evaluation.status,'pass');
  assert.match(evaluated.evaluation.limitations,/No model inference/);
  const approved=approvePersonalAiBotPersonaVersion(db,draft.id,actor,stamp,uid);
  assert.equal(approved.status,'approved');
  const activated=activatePersonalAiBotPersonaVersion(db,draft.id,actor,stamp,uid);
  assert.equal(activated.version.status,'active');
  assert.equal(bot.activePersonaVersionId,draft.id);
  assert.equal(bot.status,'disabled');
  assert.equal(bot.enabled,false);
  assert.deepEqual(bot.allowedAutonomousActions,[]);
  assert.equal(bot.aiDisclosureVisible,true);
});

test('Persona Laboratory supports immutable approved history and explicit rollback',()=>{
  const db=makeDb();
  const bot=createPersonaTestBot(db);
  const first=createPersonalAiBotPersonaDraft(db,{botId:bot.id,configuration:validPersonaConfiguration},actor,stamp,uid);
  evaluatePersonalAiBotPersonaDraft(db,first.id,actor,stamp,uid);
  approvePersonalAiBotPersonaVersion(db,first.id,actor,stamp,uid);
  activatePersonalAiBotPersonaVersion(db,first.id,actor,stamp,uid);

  assert.throws(()=>updatePersonalAiBotPersonaDraft(db,first.id,validPersonaConfiguration,actor,stamp,uid),/Only draft persona versions can be edited/);

  const second=createPersonalAiBotPersonaDraft(db,{botId:bot.id,baseVersionId:first.id},actor,stamp,uid);
  const changed={...validPersonaConfiguration,tone:'Calm and reassuring'};
  updatePersonalAiBotPersonaDraft(db,second.id,changed,actor,stamp,uid);
  evaluatePersonalAiBotPersonaDraft(db,second.id,actor,stamp,uid);
  approvePersonalAiBotPersonaVersion(db,second.id,actor,stamp,uid);
  activatePersonalAiBotPersonaVersion(db,second.id,actor,stamp,uid);
  assert.equal(bot.activePersonaVersionId,second.id);

  const rollback=rollbackPersonalAiBotPersonaVersion(db,first.id,actor,stamp,uid);
  assert.equal(rollback.version.id,first.id);
  assert.equal(rollback.version.status,'active');
  assert.equal(bot.activePersonaVersionId,first.id);
  assert.equal(bot.status,'disabled');
});

test('Persona Laboratory rejects permission and tool grants in persona configuration',()=>{
  const db=makeDb();
  const bot=createPersonaTestBot(db);
  assert.throws(()=>createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,configuration:{...validPersonaConfiguration,permissions:['publish']}
  },actor,stamp,uid),/unsupported fields/);
  assert.throws(()=>createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,configuration:{...validPersonaConfiguration,tools:['send_message']}
  },actor,stamp,uid),/unsupported fields/);
  assert.throws(()=>createPersonalAiBotPersonaDraft(db,{
    botId:bot.id,configuration:{...validPersonaConfiguration,traits:{...validPersonaConfiguration.traits,initiative:101}}
  },actor,stamp,uid),/trait values must be whole numbers/);
});


test('Persona Laboratory rollback rejects approved versions that were never previously active',()=>{
  const db=makeDb();
  const bot=createPersonaTestBot(db);
  const active=createPersonalAiBotPersonaDraft(db,{botId:bot.id,configuration:validPersonaConfiguration},actor,stamp,uid);
  evaluatePersonalAiBotPersonaDraft(db,active.id,actor,stamp,uid);
  approvePersonalAiBotPersonaVersion(db,active.id,actor,stamp,uid);
  activatePersonalAiBotPersonaVersion(db,active.id,actor,stamp,uid);

  const approvedOnly=createPersonalAiBotPersonaDraft(db,{botId:bot.id,baseVersionId:active.id},actor,stamp,uid);
  evaluatePersonalAiBotPersonaDraft(db,approvedOnly.id,actor,stamp,uid);
  approvePersonalAiBotPersonaVersion(db,approvedOnly.id,actor,stamp,uid);
  assert.throws(()=>rollbackPersonalAiBotPersonaVersion(db,approvedOnly.id,actor,stamp,uid),/previously active/);
  assert.equal(bot.activePersonaVersionId,active.id);
});


function createTeamHandoffFixture(){
  const db=makeDb();
  const sender=createPersonalAiBot(db,{displayName:'Handoff Sender Bot',categoryId:'ai-friends'},actor,stamp,uid);
  const receiver=createPersonalAiBot(db,{displayName:'Handoff Receiver Bot',categoryId:'ai-friends'},actor,stamp,uid);
  const team=createPersonalAiBotTeam(db,{name:'Handoff Review Team',description:'Owner-reviewed specialist handoffs.'},actor,stamp,uid);
  assignPersonalAiBotsToTeam(db,team.id,[sender.id,receiver.id],actor,stamp,uid);
  const taskId=uid();
  db.personalAiBotTasks.push({
    id:taskId,botId:sender.id,status:'awaiting_administrator_approval',createdAt:stamp,
    taskType:'assistant_request',instruction:'Prepare a safe draft for owner review.'
  });
  return {db,sender,receiver,team,taskId};
}

test('team handoffs are one-receiver, owner-reviewed, idempotent and never dispatched',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  const handoff=createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    summary:'Independent review request',
    requiredInput:'Review the prepared draft for completeness and consistency.',
    expectedOutput:'Return a structured review with findings and recommendations.',
    contextScope:'team_internal',privacyAttested:true
  },actor,stamp,uid);
  assert.equal(handoff.status,'pending_owner_review');
  assert.equal(handoff.dispatchStatus,'not_dispatched');
  assert.equal(handoff.receivingBotId,receiver.id);
  assert.equal(getPersonalAiBotTeamHandoffs(db,team.id,actor).length,1);
  assert.throws(()=>createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review the same work again.',expectedOutput:'Provide another review.',privacyAttested:true
  },actor,stamp,uid),/already exists/);
  assert.throws(()=>createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:sender.id,
    requiredInput:'Review this task.',expectedOutput:'Return the review.',privacyAttested:true
  },actor,stamp,uid),/cannot hand work to itself/);
});

test('team handoff lifecycle requires owner acceptance and human-reviewed completion',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  const handoff=createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review this source task for completeness.',
    expectedOutput:'Return findings and recommendations.',
    privacyAttested:true
  },actor,stamp,uid);
  assert.throws(()=>reviewPersonalAiBotTeamHandoff(db,team.id,handoff.id,{action:'complete',resultSummary:'Complete'},actor,stamp,uid),/Only an accepted handoff/);
  const accepted=reviewPersonalAiBotTeamHandoff(db,team.id,handoff.id,{action:'accept'},actor,stamp,uid);
  assert.equal(accepted.status,'accepted');
  assert.equal(accepted.dispatchStatus,'not_dispatched');
  assert.throws(()=>reviewPersonalAiBotTeamHandoff(db,team.id,handoff.id,{action:'complete',resultSummary:'Done'},actor,stamp,uid),/at least 5 characters/);
  const completed=reviewPersonalAiBotTeamHandoff(db,team.id,handoff.id,{
    action:'complete',resultSummary:'Human reviewed the result and recorded the handoff outcome.'
  },actor,stamp,uid);
  assert.equal(completed.status,'completed');
  assert.equal(completed.completedBy,actor);
  assert.equal(completed.dispatchStatus,'not_dispatched');
});

test('team handoff rejects private context and revalidates membership, source task, team state and deadline',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  const payload={
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Use only approved team information for this review.',
    expectedOutput:'Return a concise review with any concerns.',
    privacyAttested:true
  };
  assert.throws(()=>createPersonalAiBotTeamHandoff(db,team.id,{...payload,contextScope:'private'},actor,stamp,uid),/private member conversations/);

  const due=createPersonalAiBotTeamHandoff(db,team.id,{...payload,deadlineAt:'2026-11-12T10:00:00.000Z'},actor,stamp,uid);
  assert.throws(()=>reviewPersonalAiBotTeamHandoff(db,team.id,due.id,{action:'accept'},actor,'2026-11-13T10:00:00.000Z',uid),/deadline has expired/);

  const secondTaskId=uid();
  db.personalAiBotTasks.push({id:secondTaskId,botId:sender.id,status:'awaiting_administrator_approval',createdAt:stamp});
  const stale=createPersonalAiBotTeamHandoff(db,team.id,{...payload,sourceTaskId:secondTaskId,deadlineAt:null,summary:'Second handoff'},actor,stamp,uid);
  const source=db.personalAiBotTasks.find(item=>item.id===secondTaskId);
  source.status='cancelled';
  assert.throws(()=>reviewPersonalAiBotTeamHandoff(db,team.id,stale.id,{action:'accept'},actor,stamp,uid),/source task was cancelled/);
});

test('removing a team member cancels and preserves the member’s open handoffs',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  const handoff=createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review the prepared task safely.',
    expectedOutput:'Provide findings for a human owner.',
    privacyAttested:true
  },actor,stamp,uid);
  removePersonalAiBotFromTeam(db,team.id,receiver.id,actor,stamp,uid);
  const retained=db.personalAiBotTeamHandoffs.find(item=>item.id===handoff.id);
  assert.equal(retained.status,'cancelled');
  assert.equal(retained.cancellationReason,'team_membership_removed');
  assert.equal(getPersonalAiBotTeamHandoffs(db,team.id,actor).length,1);
});


test('team handoff creation requires a recorded owner privacy attestation',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  assert.throws(()=>createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review only the approved task summary and public details.',
    expectedOutput:'Return a concise review for the human owner.',
    contextScope:'team_internal'
  },actor,stamp,uid),/owner must confirm that no private member conversation/);
  const attested=createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review only the approved task summary and public details.',
    expectedOutput:'Return a concise review for the human owner.',
    contextScope:'team_internal',privacyAttested:true
  },actor,stamp,uid);
  assert.equal(attested.privacyAttested,true);
  assert.equal(attested.privacyAttestedBy,actor);
  assert.equal(attested.privacyAttestedAt,stamp);
});


test('pausing or disabling a bot team cancels pending and accepted handoffs without deleting records',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  const base={
    senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review only the approved team task content.',
    expectedOutput:'Return a short owner-reviewed report.',
    contextScope:'team_internal',privacyAttested:true
  };
  const pending=createPersonalAiBotTeamHandoff(db,team.id,{...base,sourceTaskId:taskId},actor,stamp,uid);
  const secondTaskId=uid();
  db.personalAiBotTasks.push({id:secondTaskId,botId:sender.id,status:'awaiting_administrator_approval',createdAt:stamp});
  const accepted=createPersonalAiBotTeamHandoff(db,team.id,{...base,sourceTaskId:secondTaskId},actor,stamp,uid);
  reviewPersonalAiBotTeamHandoff(db,team.id,accepted.id,{action:'accept'},actor,stamp,uid);
  const result=updatePersonalAiBotTeam(db,team.id,{status:'paused'},actor,stamp,uid);
  assert.equal(result.status,'paused');
  assert.equal(db.personalAiBotTeamHandoffs.length,2);
  assert.equal(db.personalAiBotTeamHandoffs.find(item=>item.id===pending.id).status,'cancelled');
  assert.equal(db.personalAiBotTeamHandoffs.find(item=>item.id===accepted.id).status,'cancelled');
  assert.equal(db.personalAiBotTeamHandoffs.every(item=>item.cancellationReason==='team_paused'),true);
  assert.equal(db.personalAiBotTeamHandoffs.every(item=>item.dispatchStatus==='not_dispatched'),true);
  assert.throws(()=>createPersonalAiBotTeamHandoff(db,team.id,{...base,sourceTaskId:taskId+'-other'},actor,stamp,uid),/enabled team/);
});

test('emergency shutdown cancels open handoffs and preserves their audit history',()=>{
  const fixture=createTeamHandoffFixture();
  const {db,sender,receiver,team,taskId}=fixture;
  const handoff=createPersonalAiBotTeamHandoff(db,team.id,{
    sourceTaskId:taskId,senderBotId:sender.id,receivingBotId:receiver.id,
    requiredInput:'Review the approved team notes only.',
    expectedOutput:'Return a concise human-reviewed report.',
    contextScope:'team_internal',privacyAttested:true
  },actor,stamp,uid);
  const result=emergencyShutdownPersonalAiBots(db,actor,stamp,uid);
  const retained=db.personalAiBotTeamHandoffs.find(item=>item.id===handoff.id);
  assert.equal(result.cancelledHandoffs,1);
  assert.equal(retained.status,'cancelled');
  assert.equal(retained.cancellationReason,'network_emergency_shutdown');
  assert.equal(retained.dispatchStatus,'not_dispatched');
  assert.ok(db.personalAiBotAudit.some(item=>item.action==='team.handoff_cancelled'&&item.targetId===handoff.id));
});


test('multilingual settings are private per-bot preferences separate from public profile languages',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{
    displayName:'Jamaican Language Bot',categoryId:'ai-friends',
    languages:['English','Jamaican Patois']
  },actor,stamp,uid);
  const defaults=getPersonalAiBotLanguageSettings(db,bot.id,actor);
  assert.equal(defaults.saved,false);
  assert.deepEqual(defaults.configuration.supportedLanguages,['en']);
  assert.equal(defaults.configuration.providerCompatibility,'not_checked');
  assert.equal(defaults.configuration.providerAdapterConnected,false);
  assert.equal(defaults.configuration.humanReviewRequired,true);
  assert.deepEqual(bot.languages,['English','Jamaican Patois']);

  const saved=updatePersonalAiBotLanguageSettings(db,bot.id,{
    supportedLanguages:['en','jam','es'],
    primaryLanguage:'en',
    fallbackLanguage:'jam',
    locale:'en-JM',
    detectionMode:'confidence_guarded',
    confidenceThreshold:0.82,
    responsePolicy:'match_input_language',
    codeSwitchingPolicy:'preserve',
    translationDisplay:'show_original_and_translation',
    humanReviewRequired:true
  },actor,stamp,uid);
  assert.equal(saved.configuration.primaryLanguage,'en');
  assert.deepEqual(saved.configuration.supportedLanguages,['en','jam','es']);
  assert.equal(saved.configuration.fallbackLanguage,'jam');
  assert.equal(saved.configuration.locale,'en-JM');
  assert.equal(saved.configuration.detectionMode,'confidence_guarded');
  assert.equal(saved.configuration.confidenceThreshold,0.82);
  assert.equal(saved.configuration.responsePolicy,'match_input_language');
  assert.equal(saved.configuration.languageQuality.every(item=>item.status==='unverified'),true);
  assert.equal(saved.configuration.providerCompatibility,'not_checked');
  assert.equal(saved.configuration.providerAdapterConnected,false);
  assert.equal(saved.configuration.humanReviewRequired,true);
  assert.equal(saved.configuration.preservationRules.originalSourceText,true);
  assert.deepEqual(bot.languages,['English','Jamaican Patois']);
  assert.equal(db.personalAiBotTasks.length,0);
});

test('multilingual settings reject invalid language sets, unsupported modes and disabling human review',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Language Guard Bot',categoryId:'ai-friends'},actor,stamp,uid);
  const base={supportedLanguages:['en','jam'],primaryLanguage:'en',fallbackLanguage:'jam',locale:'en-JM'};
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{...base,primaryLanguage:'fr'},actor,stamp,uid),/must both be in the supported language list/);
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{...base,supportedLanguages:['en','en']},actor,stamp,uid),/duplicate supported language/);
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{...base,supportedLanguages:['not a language']},actor,stamp,uid),/valid BCP 47 language tag/);
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{...base,confidenceThreshold:0.2},actor,stamp,uid),/between 0.50 and 0.99/);
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{...base,humanReviewRequired:false},actor,stamp,uid),/Human review remains required/);
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{...base,providerCompatibility:'verified'},actor,stamp,uid),/unsupported fields/);
});

test('multilingual settings cannot be read or changed across bot owner boundaries',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Private Language Bot',categoryId:'ai-friends'},actor,stamp,uid);
  assert.throws(()=>getPersonalAiBotLanguageSettings(db,bot.id,'other-owner'),/not found under your owner account/);
  assert.throws(()=>updatePersonalAiBotLanguageSettings(db,bot.id,{
    supportedLanguages:['en'],primaryLanguage:'en',fallbackLanguage:'en',locale:'en-JM'
  },'other-owner',stamp,uid),/not found under your owner account/);
  assert.equal(db.personalAiBotLanguageSettings.length,0);
});


function makeSyntheticLanguageCases(prefix='Example'){
  return Array.from({length:5},(_,index)=>({
    inputText:prefix+' source phrase '+(index+1),
    expectedOutput:prefix+' reviewed reference meaning '+(index+1),
    category:index===0?'greeting':'general'
  }));
}

function createLanguageEvaluationFixture(){
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Language Evaluation Bot',categoryId:'ai-friends'},actor,stamp,uid);
  updatePersonalAiBotLanguageSettings(db,bot.id,{
    supportedLanguages:['en','jam'],primaryLanguage:'en',fallbackLanguage:'jam',locale:'en-JM'
  },actor,stamp,uid);
  return {db,bot};
}

test('multilingual evaluation sets store synthetic cases and owner-attested review metadata without verifying providers',()=>{
  const {db,bot}=createLanguageEvaluationFixture();
  const created=createPersonalAiBotLanguageEvaluationSet(db,bot.id,{
    languageCode:'jam',name:'Patois Sample Review Set',
    description:'Synthetic Jamaican Creole examples for human review.',
    cases:makeSyntheticLanguageCases('Synthetic Patois'),
    syntheticDataAttested:true
  },actor,stamp,uid);
  assert.equal(created.status,'draft');
  assert.equal(created.languageCode,'jam');
  assert.equal(created.cases.length,5);
  assert.equal(created.syntheticDataAttested,true);
  assert.equal(created.syntheticDataAttestedBy,actor);
  assert.equal(created.providerExecutionStatus,'not_run');
  assert.equal(created.languageQualityStatus,'unverified');
  assert.equal(listPersonalAiBotLanguageEvaluationSets(db,bot.id,actor).length,1);

  const submitted=submitPersonalAiBotLanguageEvaluationSet(db,bot.id,created.id,actor,stamp,uid);
  assert.equal(submitted.status,'pending_human_review');
  assert.throws(()=>reviewPersonalAiBotLanguageEvaluationSet(db,bot.id,created.id,{
    decision:'approve',reviewerRole:'native_speaker',evidenceReference:'',reviewerAttestation:false
  },actor,stamp,uid),/Reviewer attestation and a non-empty evidence reference are required/);
  assert.throws(()=>reviewPersonalAiBotLanguageEvaluationSet(db,bot.id,created.id,{
    decision:'approve',reviewerRole:'native_speaker',
    evidenceReference:'review-record-jam-2026-01',reviewerAttestation:true,
    reviewRubric:{semanticAccuracy:5,dialectFidelity:3,contextPreservation:4,codeSwitching:3,safetyMeaning:4}
  },actor,stamp,uid),/whole numbers from 0 to 4/);
  const reviewed=reviewPersonalAiBotLanguageEvaluationSet(db,bot.id,created.id,{
    decision:'approve',
    reviewerRole:'native_speaker',
    evidenceReference:'review-record-jam-2026-01',
    reviewNotes:'Owner recorded sample-level comments.',
    reviewerAttestation:true,
    reviewRubric:{semanticAccuracy:4,dialectFidelity:3,contextPreservation:4,codeSwitching:3,safetyMeaning:4}
  },actor,stamp,uid);
  assert.equal(reviewed.status,'owner_review_recorded');
  assert.equal(reviewed.reviewStatus,'approve');
  assert.equal(reviewed.reviewedBy,actor);
  assert.equal(reviewed.providerExecutionStatus,'not_run');
  assert.equal(reviewed.languageQualityStatus,'unverified');
  assert.equal(reviewed.reviewEvidenceReference,'review-record-jam-2026-01');
  assert.equal(reviewed.reviewRubric.safetyMeaning,4);
  assert.deepEqual(reviewed.reviewRubric,{semanticAccuracy:4,dialectFidelity:3,contextPreservation:4,codeSwitching:3,safetyMeaning:4});
  assert.equal(db.personalAiBotTasks.length,0);
  assert.equal(bot.languages[0],'English');
});

test('multilingual evaluation sets require synthetic-data privacy attestation and supported languages',()=>{
  const {db,bot}=createLanguageEvaluationFixture();
  const cases=makeSyntheticLanguageCases();
  assert.throws(()=>createPersonalAiBotLanguageEvaluationSet(db,bot.id,{
    languageCode:'jam',name:'Missing Attestation',cases
  },actor,stamp,uid),/Confirm that all evaluation examples are synthetic/);
  assert.throws(()=>createPersonalAiBotLanguageEvaluationSet(db,bot.id,{
    languageCode:'fr',name:'Unsupported Language',cases,syntheticDataAttested:true
  },actor,stamp,uid),/must be enabled in this bot’s supported language settings/);
  assert.throws(()=>createPersonalAiBotLanguageEvaluationSet(db,bot.id,{
    languageCode:'jam',name:'Private Fields',cases:[{...cases[0],memberId:'member-1'}],syntheticDataAttested:true
  },actor,stamp,uid),/unsupported fields/);
  assert.throws(()=>submitPersonalAiBotLanguageEvaluationSet(db,bot.id,uid(),actor,stamp,uid),/not found/);
  assert.equal(db.personalAiBotLanguageEvaluationSets.length,0);
  const shortSet=createPersonalAiBotLanguageEvaluationSet(db,bot.id,{
    languageCode:'jam',name:'Too Few Cases',cases:cases.slice(0,4),syntheticDataAttested:true
  },actor,stamp,uid);
  assert.throws(()=>submitPersonalAiBotLanguageEvaluationSet(db,bot.id,shortSet.id,actor,stamp,uid),/at least 5 synthetic cases/);
});

test('editing evaluation cases requires renewed privacy attestation and clears earlier human review',()=>{
  const {db,bot}=createLanguageEvaluationFixture();
  const set=createPersonalAiBotLanguageEvaluationSet(db,bot.id,{
    languageCode:'jam',name:'Editable Patois Set',cases:makeSyntheticLanguageCases(),syntheticDataAttested:true
  },actor,stamp,uid);
  submitPersonalAiBotLanguageEvaluationSet(db,bot.id,set.id,actor,stamp,uid);
  reviewPersonalAiBotLanguageEvaluationSet(db,bot.id,set.id,{
    decision:'changes_requested',reviewerRole:'qualified_language_reviewer',
    evidenceReference:'review-comments-record-01',reviewerAttestation:true,
    reviewRubric:{semanticAccuracy:2,dialectFidelity:2,contextPreservation:3,codeSwitching:2,safetyMeaning:4}
  },actor,stamp,uid);
  assert.throws(()=>updatePersonalAiBotLanguageEvaluationSet(db,bot.id,set.id,{
    cases:makeSyntheticLanguageCases('Changed case')
  },actor,stamp,uid),/Confirm that all edited evaluation examples remain synthetic/);
  const edited=updatePersonalAiBotLanguageEvaluationSet(db,bot.id,set.id,{
    cases:makeSyntheticLanguageCases('Changed case'),syntheticDataAttested:true
  },actor,stamp,uid);
  assert.equal(edited.status,'draft');
  assert.equal(edited.reviewStatus,'not_reviewed');
  assert.equal(edited.reviewedBy,null);
  assert.equal(edited.syntheticDataAttestedBy,actor);
  assert.equal(edited.languageQualityStatus,'unverified');
});

test('performance snapshot reports time-bounded runtime activity and unavailable integrations honestly',()=>{
  const db={
    personalAiBots:[{id:'active-bot',status:'enabled',lastActiveAt:'2026-11-11T09:58:00.000Z'}],
    personalAiBotTasks:[
      {id:'pending',status:'awaiting_administrator_approval',taskType:'assistant_request',createdAt:'2026-11-11T09:50:00.000Z'},
      {id:'done',status:'completed',taskType:'draft_post',createdAt:'2026-11-11T09:00:00.000Z',completedAt:'2026-11-11T09:04:00.000Z'},
      {id:'running',status:'running',taskType:'analytics_report',createdAt:'2026-11-11T09:30:00.000Z'},
      {id:'future',status:'awaiting_administrator_approval',taskType:'other',createdAt:'2026-11-11T10:01:00.000Z'}
    ]
  };
  const snapshot=getPersonalAiBotPerformanceSnapshot(db,'2026-11-11T10:00:00.000Z');
  assert.equal(snapshot.source,'legacy_runtime_state_snapshot');
  assert.equal(snapshot.observedAt,'2026-11-11T10:00:00.000Z');
  assert.equal(snapshot.coverage.taskRecordsObserved,4);
  assert.equal(snapshot.coverage.taskRecordsMayBeTruncated,false);
  assert.deepEqual(snapshot.queue,{awaitingApproval:2,approvedWaitingForWorker:0,running:1});
  assert.equal(snapshot.activity.tasksCreated24h,3);
  assert.equal(snapshot.activity.tasksCompleted24h,1);
  assert.equal(snapshot.activity.averageCompletionMinutes24h,4);
  assert.equal(snapshot.activity.taskTypes24h.assistant_request,1);
  assert.equal(snapshot.integrations.providerInference.available,false);
  assert.equal(snapshot.integrations.usageTelemetry.status,'unavailable');
});

test('performance snapshot rejects invalid observation timestamps',()=>{
  assert.throws(()=>getPersonalAiBotPerformanceSnapshot({},'not-a-time'),/valid timestamp/);
});

test('performance snapshot discloses the runtime task history cap',()=>{
  const db={personalAiBotTasks:Array.from({length:2000},(_,index)=>({
    id:'task-'+index,status:'awaiting_administrator_approval',
    taskType:'assistant_request',createdAt:'2026-11-11T09:00:00.000Z'
  }))};
  const snapshot=getPersonalAiBotPerformanceSnapshot(db,'2026-11-11T10:00:00.000Z');
  assert.equal(snapshot.coverage.taskRecordsObserved,2000);
  assert.equal(snapshot.coverage.taskRecordsMayBeTruncated,true);
  assert.equal(snapshot.coverage.taskRecordCap,2000);
});

test('Creator Studio drafts retain versions and require an owner rights attestation before review',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Creator Draft Bot',categoryId:'ai-creators'},actor,stamp,uid);
  const base={botId:bot.id,title:'Launch post',contentFormat:'feed_post',destination:'feed',caption:'A concise caption',body:'A manually supplied draft for an upcoming creator announcement.',sourceType:'owner_authored',assetReferences:['asset:approved-image-01'],rightsAttested:false};
  const draft=createPersonalAiCreatorDraft(db,base,actor,stamp,uid);
  assert.equal(draft.status,'draft');
  assert.equal(draft.generationStatus,'not_connected');
  assert.equal(draft.aiIdentityDisclosureRequired,true);
  assert.equal(draft.publishingStatus,'not_published');
  assert.equal(db.personalAiBotTasks.length,0);
  assert.throws(()=>submitPersonalAiCreatorDraft(db,draft.id,actor,stamp,uid),/rights/);
  const edited=updatePersonalAiCreatorDraft(db,draft.id,{caption:'Updated caption',rightsAttested:true},actor,stamp,uid);
  assert.equal(edited.version,2);
  assert.equal(edited.versionHistory.length,1);
  assert.equal(edited.versionHistory[0].caption,'A concise caption');
  assert.equal(edited.status,'draft');
  const submitted=submitPersonalAiCreatorDraft(db,draft.id,actor,stamp,uid);
  assert.equal(submitted.status,'pending_review');
  const approved=reviewPersonalAiCreatorDraft(db,draft.id,{decision:'approve',reviewNotes:'Reviewed for future human handoff.'},actor,stamp,uid);
  assert.equal(approved.status,'approved_for_human_handoff');
  assert.equal(approved.publishingStatus,'not_published');
  assert.equal(approved.handoffStatus,'not_handed_off');
  assert.equal(db.personalAiBotTasks.length,0);
  assert.equal(listPersonalAiCreatorDrafts(db,{limit:10,offset:0}).length,1);
});

test('Creator Studio rejects unsupported formats, excessive assets, data URIs and cross-owner edits',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Rights Bot',categoryId:'ai-creators'},actor,stamp,uid);
  const base={botId:bot.id,title:'Rights review',contentFormat:'feed_post',destination:'feed',body:'Draft content for review.',sourceType:'owner_authored',assetReferences:[],rightsAttested:true};
  assert.throws(()=>createPersonalAiCreatorDraft(db,{...base,contentFormat:'publish_now'},actor,stamp,uid),/format/);
  assert.throws(()=>createPersonalAiCreatorDraft(db,{...base,assetReferences:['data:image/png;base64,abc']},actor,stamp,uid),/asset reference/);
  assert.throws(()=>createPersonalAiCreatorDraft(db,{...base,assetReferences:Array.from({length:11},(_,i)=>'asset:'+i)},actor,stamp,uid),/10 asset/);
  const draft=createPersonalAiCreatorDraft(db,base,actor,stamp,uid);
  assert.throws(()=>updatePersonalAiCreatorDraft(db,draft.id,{title:'Changed'},'other-owner',stamp,uid),/another owner/);
  assert.throws(()=>reviewPersonalAiCreatorDraft(db,draft.id,{decision:'approve'},actor,stamp,uid),/awaiting owner review/);
});

 
test('employment lifecycle events are owner-scoped audit records and never activate AI employees',()=>{
  const identityId='00000000-0000-4000-8000-000000004901';
  const appointmentId='appointment-employment-event-4901';
  const db={
    personalAiBots:[{id:identityId,population:'organizational',status:'disabled',enabled:false}],
    personalAiBotAppointments:[{
      id:appointmentId,ownerId:actor,identityId,population:'organizational',
      candidateDisplayName:'Training AI',applicationId:'application-4901',vacancyId:'vacancy-4901',
      status:'appointed',permissions:[],permissionGrantStatus:'not_granted',
      identityActivationStatus:'unchanged_disabled',employmentHistory:[]
    }]
  };
  const event=recordPersonalAiBotEmploymentEvent(db,appointmentId,{
    eventType:'trained',notes:'Completed owner-reviewed onboarding training.'
  },actor,stamp,uid);
  assert.equal(event.eventType,'trained');
  assert.equal(event.actorId,actor);
  assert.equal(db.personalAiBotAppointments[0].status,'appointed');
  assert.equal(db.personalAiBotAppointments[0].employmentHistory.length,1);
  assert.equal(db.personalAiBotEmploymentHistory.length,1);
  assert.equal(db.personalAiBots[0].status,'disabled');
  assert.equal(db.personalAiBots[0].enabled,false);
  assert.deepEqual(db.personalAiBotAppointments[0].permissions,[]);
  assert.equal(db.personalAiBotAppointments[0].permissionGrantStatus,'not_granted');
  assert.equal(db.personalAiBotAppointments[0].identityActivationStatus,'unchanged_disabled');
  assert.ok(db.personalAiBotAudit.some(item=>item.action==='employment.trained'&&item.targetId===event.id));
  assert.throws(()=>recordPersonalAiBotEmploymentEvent(db,appointmentId,{
    eventType:'promoted',notes:'Promotion requires a distinct owner-reviewed workflow.'
  },actor,stamp,uid),/supported employment history event/);
  assert.throws(()=>recordPersonalAiBotEmploymentEvent(db,appointmentId,{
    eventType:'trained',notes:'Cross-owner access must fail.'
  },'another-owner',stamp,uid),/Appointment not found/);
});
