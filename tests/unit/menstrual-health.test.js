import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 calculateMenstrualInsights, normalizeCycleInput, normalizeDailyLogInput,
 normalizeReminderInput, normalizeTrackerPreferences, isFemaleMenstrualHealthAccount
} from '../../backend/modules/menstrual-health/service.js';

test('restricts menstrual-health access to accounts marked female',()=>{
 assert.equal(isFemaleMenstrualHealthAccount({gender:'Female'}),true);
 assert.equal(isFemaleMenstrualHealthAccount({gender:'Woman'}),true);
 assert.equal(isFemaleMenstrualHealthAccount({gender:'women'}),true);
 assert.equal(isFemaleMenstrualHealthAccount({gender:'Male'}),false);
 assert.equal(isFemaleMenstrualHealthAccount({gender:''}),false);
});

test('does not invent a standard cycle or next-period date',()=>{
 const result=calculateMenstrualInsights([],{fertility_estimates_enabled:true},new Date('2026-11-07T12:00:00Z'));
 assert.equal(result.average_cycle_length,null);
 assert.equal(result.next_period_start,null);
 assert.equal(result.prediction_confidence,'not_enough_data');
 assert.equal(result.estimated_ovulation_date,null);
});
test('calculates personal averages only from recorded dates',()=>{
 const cycles=[
  {start_date:'2026-08-01',end_date:'2026-08-05'},
  {start_date:'2026-08-29',end_date:'2026-09-02'},
  {start_date:'2026-09-26',end_date:'2026-09-30'}
 ];
 const result=calculateMenstrualInsights(cycles,{fertility_estimates_enabled:true},new Date('2026-10-02T12:00:00Z'));
 assert.equal(result.average_cycle_length,28);
 assert.equal(result.average_period_length,5);
 assert.equal(result.next_period_start,'2026-10-24');
 assert.ok(result.estimated_fertile_window_start);
 assert.match(result.prediction_disclaimer,/not reliable contraception/);
});
test('validates period records and permits owner edits',()=>{
 assert.throws(()=>normalizeCycleInput({start_date:'2026-11-08',end_date:'2026-11-07'}),/cannot be before/);
 assert.deepEqual(normalizeCycleInput({flow_intensity:'light',notes:'Updated'},true),{flow_intensity:'light',notes:'Updated'});
 assert.equal(normalizeCycleInput({start_date:'2026-11-01',end_date:'2026-11-05'}).end_date,'2026-11-05');
});
test('validates daily symptoms, pain, reminders and preferences',()=>{
 const log=normalizeDailyLogInput({entry_date:'2026-11-07',flow_level:'light',symptoms:['cramps','bloating'],pain_level:4,mood:'okay',energy_level:2,cervical_mucus:'unknown'});
 assert.deepEqual(log.symptoms,['cramps','bloating']);
 assert.throws(()=>normalizeDailyLogInput({entry_date:'2026-11-07',pain_level:11}),/Pain level/);
 assert.equal(normalizeReminderInput({reminder_type:'period_due',time_local:'08:30',timezone:'America/Jamaica'}).lead_days,1);
 assert.equal(normalizeReminderInput({reminder_type:'daily_log',enabled:false}).enabled,false);
 assert.throws(()=>normalizeReminderInput({reminder_type:'period_due',time_local:'25:90'}),/valid reminder time/);
 assert.deepEqual(normalizeTrackerPreferences({enabled:false,fertility_estimates_enabled:true}),{enabled:false,fertility_estimates_enabled:true});
});

const menstrualUi=fs.readFileSync(new URL('../../public/menstrual-health.js',import.meta.url),'utf8');
const menstrualServer=fs.readFileSync(new URL('../../src/server.js',import.meta.url),'utf8');
const menstrualApp=fs.readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
test('private tracker UI edits periods, switches reminders and exports journal data',()=>{
 assert.match(menstrualUi,/data-edit-cycle/);
 assert.match(menstrualUi,/period_enabled/);
 assert.match(menstrualUi,/daily_enabled/);
 assert.match(menstrualUi,/symptom_enabled/);
 assert.match(menstrualUi,/s\.data\.journal/);
 assert.match(menstrualUi,/s\.data\.reminders/);
});
test('frontend and API both block menstrual-health access for non-female accounts',()=>{
 assert.match(menstrualApp,/function isFemaleAccountForMenstrualHealth\(user=state\.user\)/);
 assert.match(menstrualApp,/requestedView==='menstrual-health'&&!isFemaleAccountForMenstrualHealth\(\)/);
 assert.match(menstrualApp,/state\.view==='menstrual-health'&&!isFemaleAccountForMenstrualHealth\(\)/);
 assert.match(menstrualServer,/if\(!isFemaleMenstrualHealthAccount\(user\)\)return json\(res,403/);
 assert.match(menstrualServer,/return json\(res,200,\{user:safeUser\(account,account\.id\)\}/,'the completed sign-in response exposes the signed-in account gender to its owner');
});

test('server blocks new health records when the private tracker is disabled',()=>{
 assert.match(menstrualServer,/const requireTrackerEnabled=async\(\)=>/);
 for(const resource of ['cycles','daily-logs','journal','reminders']) {
  const marker="resource==='"+resource+"'";
  const start=menstrualServer.indexOf(marker);
  assert.notEqual(start,-1,'server exposes '+resource+' route');
  assert.ok(menstrualServer.slice(start,start+400).includes('requireTrackerEnabled()'),'server requires tracker consent for '+resource);
 }
});
