export function isFemaleMenstrualHealthAccount(user) {
  return /(^|[^a-z])(female|woman|women)([^a-z]|$)/i.test(String(user?.gender||''));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FLOWS = new Set(['spotting','light','medium','heavy','unspecified']);
const DAILY_FLOWS = new Set(['none','spotting','light','medium','heavy']);
const SYMPTOMS = new Set([
  'cramps','headache','migraine','bloating','back_pain','breast_tenderness','acne',
  'nausea','fatigue','mood_swings','irritability','anxiety','sadness','food_cravings',
  'appetite_change','sleep_changes','dizziness','other'
]);
const MOODS = new Set(['not_set','great','good','okay','low','anxious','irritable','sad']);
const MUCUS = new Set(['unknown','dry','sticky','creamy','watery','egg_white']);

function dateValue(value) {
  const text=String(value||'').trim();
  if(!DATE_RE.test(text))return null;
  const date=new Date(text+'T12:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text?date:null;
}
function dayKey(date){return date.toISOString().slice(0,10);}
function addDays(date,amount){const copy=new Date(date);copy.setUTCDate(copy.getUTCDate()+amount);return copy;}
function daysBetween(a,b){return Math.round((b.getTime()-a.getTime())/86400000);}
function integerOrNull(value,min,max){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isInteger(number)&&number>=min&&number<=max?number:null;
}
function requiredText(value,max,label){
  const text=String(value||'').trim();
  if(!text||text.length>max)throw new TypeError(label+' is required and must be no longer than '+max+' characters.');
  return text;
}
function optionalText(value,max,label){
  const text=String(value||'').trim();
  if(text.length>max)throw new TypeError(label+' must be no longer than '+max+' characters.');
  return text;
}
export function normalizeCycleInput(input={},partial=false){
  const result={};
  if(!partial||Object.prototype.hasOwnProperty.call(input,'start_date')){
    const start=dateValue(input.start_date);
    if(!start)throw new TypeError('Choose a valid period start date.');
    result.start_date=dayKey(start);
  }
  let start=input.start_date?dateValue(input.start_date):null;
  const endRaw=input.end_date?dateValue(input.end_date):null;
  if(input.end_date&&!endRaw)throw new TypeError('Choose a valid period end date.');
  if(input.end_date===null||input.end_date==='')result.end_date=null;
  else if(input.end_date)result.end_date=dayKey(endRaw);
  if(start&&endRaw&&endRaw<start)throw new TypeError('The period end date cannot be before its start date.');
  if(start&&endRaw&&daysBetween(start,endRaw)>60)throw new TypeError('Please check the period dates; the recorded duration is unusually long.');
  const flow=String(input.flow_intensity||'unspecified');
  if(!FLOWS.has(flow))throw new TypeError('Choose a valid flow level.');
  result.flow_intensity=flow;
  result.notes=optionalText(input.notes,800,'Notes');
  return result;
}
export function normalizeDailyLogInput(input={}){
  const date=dateValue(input.entry_date);
  if(!date)throw new TypeError('Choose a valid log date.');
  const flow=String(input.flow_level||'none');
  if(!DAILY_FLOWS.has(flow))throw new TypeError('Choose a valid bleeding level.');
  const symptoms=Array.isArray(input.symptoms)?[...new Set(input.symptoms.map(String))]:[];
  if(symptoms.length>18||symptoms.some(item=>!SYMPTOMS.has(item)))throw new TypeError('Choose valid symptoms.');
  const mood=String(input.mood||'not_set');
  if(!MOODS.has(mood))throw new TypeError('Choose a valid mood.');
  const pain=input.pain_level===''||input.pain_level===null||input.pain_level===undefined?null:integerOrNull(input.pain_level,0,10);
  if(input.pain_level!==''&&input.pain_level!==null&&input.pain_level!==undefined&&pain===null)throw new TypeError('Pain level must be between 0 and 10.');
  const energy=input.energy_level===''||input.energy_level===null||input.energy_level===undefined?null:integerOrNull(input.energy_level,1,5);
  if(input.energy_level!==''&&input.energy_level!==null&&input.energy_level!==undefined&&energy===null)throw new TypeError('Energy level must be between 1 and 5.');
  const sleep=input.sleep_hours===''||input.sleep_hours===null||input.sleep_hours===undefined?null:Number(input.sleep_hours);
  if(sleep!==null&&(!Number.isFinite(sleep)||sleep<0||sleep>24))throw new TypeError('Sleep hours must be between 0 and 24.');
  const temp=input.basal_temperature_c===''||input.basal_temperature_c===null||input.basal_temperature_c===undefined?null:Number(input.basal_temperature_c);
  if(temp!==null&&(!Number.isFinite(temp)||temp<30||temp>43))throw new TypeError('Temperature must be between 30°C and 43°C.');
  const mucus=String(input.cervical_mucus||'unknown');
  if(!MUCUS.has(mucus))throw new TypeError('Choose a valid cervical mucus observation.');
  return {
    entry_date:dayKey(date),flow_level:flow,symptoms,pain_level:pain,mood,energy_level:energy,
    sleep_hours:sleep,basal_temperature_c:temp,cervical_mucus:mucus,
    notes:optionalText(input.notes,1200,'Notes')
  };
}
export function normalizeJournalInput(input={}){
  const date=dateValue(input.entry_date);
  if(!date)throw new TypeError('Choose a valid journal date.');
  return {
    entry_date:dayKey(date),
    title:requiredText(input.title,120,'A journal title'),
    content:requiredText(input.content,5000,'Journal entry')
  };
}
export function normalizeReminderInput(input={}){
  const type=String(input.reminder_type||'');
  if(!['period_due','daily_log','symptom_checkin'].includes(type))throw new TypeError('Choose a valid reminder type.');
  const time=String(input.time_local||'09:00');
  if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))throw new TypeError('Choose a valid reminder time.');
  const leadDays=Number(input.lead_days??1);
  if(!Number.isInteger(leadDays)||leadDays<0||leadDays>7)throw new TypeError('Reminder lead time must be between 0 and 7 days.');
  const timezone=String(input.timezone||'America/Jamaica').trim();
  if(!timezone||timezone.length>80)throw new TypeError('Choose a valid time zone.');
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());}
  catch{throw new TypeError('Choose a recognized time zone.');}
  return {reminder_type:type,enabled:input.enabled!==false,lead_days:leadDays,time_local:time,timezone};
}
export function normalizeTrackerPreferences(input={}){
  const result={};
  for(const key of ['enabled','fertility_estimates_enabled','pregnancy_planning_enabled']){
    if(Object.prototype.hasOwnProperty.call(input,key)){
      if(typeof input[key]!=='boolean')throw new TypeError(key+' must be true or false.');
      result[key]=input[key];
    }
  }
  for(const [key,min,max] of [['average_cycle_length',15,90],['average_period_length',1,15]]){
    if(Object.prototype.hasOwnProperty.call(input,key)){
      if(input[key]===null||input[key]==='')result[key]=null;
      else{
        const value=integerOrNull(input[key],min,max);
        if(value===null)throw new TypeError(key==='average_cycle_length'?'Cycle length must be between 15 and 90 days.':'Period length must be between 1 and 15 days.');
        result[key]=value;
      }
    }
  }
  if(Object.prototype.hasOwnProperty.call(input,'timezone')){
    const timezone=String(input.timezone||'').trim();
    if(!timezone||timezone.length>80)throw new TypeError('Choose a valid time zone.');
    try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());}
    catch{throw new TypeError('Choose a recognized time zone.');}
    result.timezone=timezone;
  }
  return result;
}
export function calculateMenstrualInsights(cycles=[],profile={},asOf=new Date()){
  const sorted=(Array.isArray(cycles)?cycles:[])
    .filter(cycle=>dateValue(cycle?.start_date))
    .slice()
    .sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date)));
  const intervals=[];
  for(let index=1;index<sorted.length;index++){
    const days=daysBetween(dateValue(sorted[index-1].start_date),dateValue(sorted[index].start_date));
    if(days>=15&&days<=90)intervals.push(days);
  }
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  const observedCycleMean=mean(intervals);
  const cycleLength=integerOrNull(profile?.average_cycle_length,15,90)||(observedCycleMean===null?null:Math.round(observedCycleMean));
  const periodLengths=sorted.map(cycle=>{
    if(!cycle.end_date)return null;
    const end=dateValue(cycle.end_date),start=dateValue(cycle.start_date);
    return end&&start&&end>=start?daysBetween(start,end)+1:null;
  }).filter(value=>Number.isInteger(value)&&value>=1&&value<=60);
  const periodMean=mean(periodLengths);
  const periodLength=integerOrNull(profile?.average_period_length,1,15)||(periodMean===null?null:Math.round(periodMean));
  const last=sorted.length?dateValue(sorted[sorted.length-1].start_date):null;
  const next=last&&cycleLength?addDays(last,cycleLength):null;
  const today=new Date(asOf);
  const todayUtc=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate(),12));
  const day=last?daysBetween(last,todayUtc)+1:null;
  const std=intervals.length>1?Math.sqrt(mean(intervals.map(value=>(value-observedCycleMean)**2))):null;
  const confidence=intervals.length>=5&&std!==null&&std<=3?'higher'
    :intervals.length>=3&&std!==null&&std<=7?'moderate':next?'limited':'not_enough_data';
  let phase='not_enough_data',phaseLabel='Not enough cycle history';
  let phaseNote='Log period start dates to begin estimating your cycle timing.';
  const fertilityEnabled=profile?.fertility_estimates_enabled===true;
  let ovulation=null,fertileStart=null,fertileEnd=null;
  if(last&&cycleLength&&day!==null&&day>0){
    const bleedLength=periodLength||5;
    const ovulationDate=addDays(next,-14);
    ovulation=dayKey(ovulationDate);
    const ovulationDay=daysBetween(last,ovulationDate)+1;
    if(day<=bleedLength){phase='menstrual';phaseLabel='Menstrual phase';phaseNote='Based on your most recently recorded period dates.';}
    else if(Math.abs(day-ovulationDay)<=1){phase='ovulation_estimate';phaseLabel='Estimated ovulation window';phaseNote='Calendar estimate only; ovulation is not confirmed.';}
    else if(day<ovulationDay){phase='follicular';phaseLabel='Estimated follicular phase';phaseNote='This estimate uses your recorded cycle history.';}
    else{phase='luteal';phaseLabel='Estimated luteal phase';phaseNote='This estimate uses your recorded cycle history.';}
    if(fertilityEnabled){fertileStart=dayKey(addDays(ovulationDate,-5));fertileEnd=dayKey(addDays(ovulationDate,1));}
  }
  return {
    average_cycle_length:cycleLength,average_period_length:periodLength,
    next_period_start:next?dayKey(next):null,last_period_start:last?dayKey(last):null,
    cycle_day:day&&day>0?day:null,phase,phase_label:phaseLabel,phase_note:phaseNote,
    prediction_confidence:confidence,recorded_cycles:sorted.length,intervals_used:intervals.length,
    fertility_estimates_enabled:fertilityEnabled,estimated_ovulation_date:fertilityEnabled?ovulation:null,
    estimated_fertile_window_start:fertileStart,estimated_fertile_window_end:fertileEnd,
    prediction_disclaimer:'Calendar predictions are estimates, not a diagnosis and not reliable contraception.'
  };
}
