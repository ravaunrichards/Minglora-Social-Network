(() => {
  'use strict';
  const API='/api/calendar/events';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const dateAt=(y,m,d)=>new Date(y,m,d,12,0,0,0);
  const plus=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
  const parse=v=>v?new Date(v):null;
  const localInput=v=>{const d=parse(v);return d?d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes()):'';};
  const iso=v=>v?new Date(v).toISOString():null;
  const zone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}};
  const startWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;};
  const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  const state={events:[],date:new Date(),view:'month',filter:'all',query:'',editing:null};
  const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const defaultColor='#1769e0';
  const icon='<svg class="nav-3d-icon" viewBox="0 0 64 64" aria-hidden="true"><use href="/assets/icons/navigation-3d.svg?v=20261107-calendar-3d-1#calendar"></use></svg>';
  async function api(path='',options={}) {
    let res;
    try{res=await fetch(API+path,{...options,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Minglora-Time-Zone':zone(),...(options.headers||{})}});}
    catch{throw new Error(navigator.onLine===false?'You are offline. Reconnect to sync your calendar.':'Minglora could not be reached.');}
    let data={};try{data=await res.json();}catch{}
    if(!res.ok)throw new Error(data.error||'Calendar request failed ('+res.status+').');
    return data;
  }
  async function load(){const data=await api();state.events=Array.isArray(data.events)?data.events:[];}
  function toast(msg){const el=$('#toast');if(el){el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400);}else console.info('[Calendar]',msg);}
  function isTask(e){return e.kind==='task';}
  function occurs(e,d){
    const start=parse(e.startAt);if(!start)return false;
    const day=dateAt(d.getFullYear(),d.getMonth(),d.getDate()),first=dateAt(start.getFullYear(),start.getMonth(),start.getDate());
    if(day<first)return false;
    if(e.repeatUntil){const until=parse(e.repeatUntil);if(day>dateAt(until.getFullYear(),until.getMonth(),until.getDate()))return false;}
    const diff=Math.round((day-first)/86400000);
    switch(e.recurrence||'none'){
      case 'daily':return true;
      case 'weekly':return diff%7===0;
      case 'monthly':return day.getDate()===first.getDate();
      case 'yearly':return day.getMonth()===first.getMonth()&&day.getDate()===first.getDate();
      default:return sameDay(day,first);
    }
  }
  function dayItems(d){
    return state.events.filter(e=>(state.filter==='all'||(state.filter==='tasks'?isTask(e):!isTask(e)))&&(!state.query||[e.title,e.description,e.location,e.calendarName].join(' ').toLowerCase().includes(state.query.toLowerCase()))&&occurs(e,d)).sort((a,b)=>String(a.startAt).localeCompare(String(b.startAt)));
  }
  function itemChip(e){
    const c=esc(e.color||defaultColor);
    return '<button type="button" class="ml-cal-chip '+(isTask(e)?'task':'')+(e.completed?' done':'')+'" style="background:'+c+'22;border-left:3px solid '+c+'" data-open="'+esc(e.id)+'" title="'+esc(e.title)+'">'+(isTask(e)?'✓ ':'')+esc(e.title)+'</button>';
  }
  function itemCard(e){
    const when=e.allDay?'All day':parse(e.startAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    const details=[when,e.location,e.calendarName||'Personal',e.recurrence&&e.recurrence!=='none'?'Repeats '+e.recurrence:''].filter(Boolean).join(' · ');
    return '<article class="ml-cal-entry" style="--entry-color:'+esc(e.color||defaultColor)+'"><strong>'+(e.completed?'<s>':'')+esc(e.title)+(e.completed?'</s>':'')+'</strong><small>'+esc(details)+'</small>'+(e.description?'<small>'+esc(e.description)+'</small>':'')+'<div class="ml-cal-entry-actions">'+(isTask(e)?'<label><input type="checkbox" data-complete="'+esc(e.id)+'" '+(e.completed?'checked':'')+'> Done</label>':'')+'<button type="button" data-open="'+esc(e.id)+'">Details / edit</button></div></article>';
  }
  function monthView(){
    const first=dateAt(state.date.getFullYear(),state.date.getMonth(),1),offset=(first.getDay()+6)%7,start=plus(first,-offset);
    let html='';
    for(let i=0;i<42;i++){
      const d=plus(start,i),items=dayItems(d),outside=d.getMonth()!==state.date.getMonth();
      html+='<div class="ml-cal-day '+(outside?'outside ':'')+(sameDay(d,new Date())?'today ':'')+(sameDay(d,state.date)?'selected':'')+'"><button type="button" class="ml-cal-date" data-date="'+key(d)+'">'+d.getDate()+'</button><div class="ml-cal-chips">'+items.slice(0,3).map(itemChip).join('')+(items.length>3?'<small class="ml-cal-overflow">+'+(items.length-3)+' more</small>':'')+'</div></div>';
    }
    return '<div class="ml-cal-card"><div class="ml-cal-weekdays">'+weekdays.map(x=>'<span>'+x+'</span>').join('')+'</div><div class="ml-cal-month-grid">'+html+'</div></div>';
  }
  function weekView(){
    const start=startWeek(state.date);
    return '<div class="ml-cal-card ml-cal-week-grid">'+weekdays.map((name,i)=>{const d=plus(start,i),items=dayItems(d);return '<section class="ml-cal-week-col"><h3>'+name+'<small>'+d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</small></h3><div class="ml-cal-day-list">'+(items.length?items.map(itemChip).join(''):'<small class="ml-cal-muted">No items</small>')+'</div><button type="button" class="ml-cal-button" data-date="'+key(d)+'">＋ Add</button></section>';}).join('')+'</div>';
  }
  function dayView(){
    const items=dayItems(state.date);
    return '<div class="ml-cal-card">'+(items.length?'<div class="ml-cal-agenda">'+items.map(itemCard).join('')+'</div>':'<div class="ml-cal-empty"><strong>No events or tasks</strong>Your day is clear. Add something when you are ready.</div>')+'</div>';
  }
  function agendaView(){
    const rows=[];for(let d=new Date();d<=plus(new Date(),60);d=plus(d,1))for(const item of dayItems(d))rows.push({date:new Date(d),item});
    return '<div class="ml-cal-card">'+(rows.length?'<div class="ml-cal-agenda">'+rows.map(r=>'<div class="ml-cal-agenda-row"><div class="ml-cal-agenda-date">'+esc(r.date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}))+'</div>'+itemCard(r.item)+'</div>').join('')+'</div>':'<div class="ml-cal-empty"><strong>Nothing scheduled</strong>Your next 60 days are clear.</div>')+'</div>';
  }
  function yearView(){
    const y=state.date.getFullYear();
    return '<div class="ml-cal-card ml-cal-year">'+Array.from({length:12},(_,m)=>{const count=state.events.filter(e=>{const d=parse(e.startAt);return d&&d.getFullYear()===y&&d.getMonth()===m;}).length;return '<button type="button" class="ml-cal-year-month" data-month="'+m+'"><strong>'+dateAt(y,m,1).toLocaleDateString(undefined,{month:'long'})+'</strong><small>'+count+' saved item'+(count===1?'':'s')+'</small></button>';}).join('')+'</div>';
  }
  function viewContent(){return state.view==='day'?dayView():state.view==='week'?weekView():state.view==='agenda'?agendaView():state.view==='year'?yearView():monthView();}
  function summary(){
    const today=new Date(),next=plus(today,7);
    const upcoming=state.events.filter(e=>!e.completed&&parse(e.startAt)>=today&&parse(e.startAt)<next).length;
    const tasks=state.events.filter(e=>isTask(e)&&!e.completed).length;
    return '<div class="ml-cal-summary"><div class="ml-cal-stat"><strong>'+state.events.length+'</strong><small>Saved items</small></div><div class="ml-cal-stat"><strong>'+upcoming+'</strong><small>Next 7 days</small></div><div class="ml-cal-stat"><strong>'+tasks+'</strong><small>Open tasks</small></div></div>';
  }
  const formHtml='<div class="ml-cal-backdrop" id="ml-cal-backdrop" hidden><section class="ml-cal-modal" role="dialog" aria-modal="true" aria-labelledby="ml-cal-modal-title"><header class="ml-cal-modal-head"><h2 id="ml-cal-modal-title">New calendar item</h2><button class="ml-cal-button" type="button" data-close aria-label="Close">✕</button></header><div class="ml-cal-modal-body"><form id="ml-cal-form" class="ml-cal-form"><div class="ml-cal-field full"><label>Title</label><input name="title" required maxlength="100" placeholder="Add a title"></div><div class="ml-cal-field"><label>Type</label><select name="kind"><option value="event">Event</option><option value="task">Task / To-do</option></select></div><div class="ml-cal-field"><label>Calendar name</label><input name="calendarName" value="Personal" maxlength="40" list="ml-cal-lists"><datalist id="ml-cal-lists"><option value="Personal"><option value="Work"><option value="Family"><option value="Birthdays"></datalist></div><div class="ml-cal-field"><label>Starts</label><input name="startAt" type="datetime-local" required></div><div class="ml-cal-field"><label>Ends (optional)</label><input name="endAt" type="datetime-local"></div><div class="ml-cal-field full"><div class="ml-cal-checks"><label><input name="allDay" type="checkbox"> All day</label><label data-task-check><input name="completed" type="checkbox"> Completed</label></div></div><div class="ml-cal-field"><label>Repeat</label><select name="recurrence"><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></div><div class="ml-cal-field"><label>Repeat until</label><input name="repeatUntil" type="date"></div><div class="ml-cal-field"><label>Reminder</label><select name="reminderMinutes"><option value="0">No reminder</option><option value="5">5 minutes before</option><option value="10">10 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></div><div class="ml-cal-field"><label>Colour</label><input name="color" type="color" value="#1769e0"></div><div class="ml-cal-field full"><label>Location</label><input name="location" maxlength="160" placeholder="Add a location"></div><div class="ml-cal-field full"><label>Notes</label><textarea name="description" maxlength="3000" placeholder="Add details or notes"></textarea></div><div class="ml-cal-form-actions full"><button type="button" class="ml-cal-button danger" data-delete hidden>Delete</button><div><button type="button" class="ml-cal-button" data-close>Cancel</button><button class="ml-cal-button primary" type="submit" data-save>Save</button></div></div></form></div></section></div>';
  function modal(show){const el=$('#ml-cal-backdrop');if(el)el.hidden=!show;}
  function openForm(id,date){
    const form=$('#ml-cal-form');if(!form)return;
    const item=id?state.events.find(e=>e.id===id):null;state.editing=item?.id||null;
    $('#ml-cal-modal-title').textContent=item?'Edit calendar item':'New calendar item';
    form.elements.title.value=item?.title||'';
    form.elements.kind.value=item?.kind||'event';
    form.elements.calendarName.value=item?.calendarName||'Personal';
    form.elements.startAt.value=item?localInput(item.startAt):key(date||state.date)+'T09:00';
    form.elements.endAt.value=item?.endAt?localInput(item.endAt):'';
    form.elements.allDay.checked=!!item?.allDay;
    form.elements.completed.checked=!!item?.completed;
    form.elements.recurrence.value=item?.recurrence||'none';
    form.elements.repeatUntil.value=item?.repeatUntil?key(parse(item.repeatUntil)):'';
    form.elements.reminderMinutes.value=String(item?.reminderMinutes||0);
    form.elements.color.value=item?.color||defaultColor;
    form.elements.location.value=item?.location||'';
    form.elements.description.value=item?.description||'';
    $('[data-delete]').hidden=!item;
    $('[data-task-check]').hidden=form.elements.kind.value!=='task';
    modal(true);form.elements.title.focus();
  }
  function closeForm(){modal(false);state.editing=null;}
  function draw(){
    const root=$('#main-content');if(!root)return;
    const label=state.view==='year'?String(state.date.getFullYear()):state.view==='day'?state.date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}):state.view==='week'?'Week of '+state.date.toLocaleDateString(undefined,{month:'short',day:'numeric'}):state.view==='agenda'?'Upcoming':state.date.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    root.innerHTML='<section class="ml-calendar"><header class="ml-cal-head"><div class="ml-cal-title">'+icon+'<div><h1>Calendar</h1><p>Events, reminders and to-do lists in one place</p></div></div><div class="ml-cal-actions"><button class="ml-cal-button" type="button" data-import>Import .ics</button><button class="ml-cal-button" type="button" data-export>Export .ics</button><button class="ml-cal-button primary" type="button" data-add>＋ New</button></div></header><div class="ml-cal-hero"><div><strong>Keep your days organised</strong><small>Private to your account · '+esc(zone())+'</small></div><div class="ml-cal-switch">'+['day','week','month','year','agenda'].map(v=>'<button type="button" data-view="'+v+'" class="'+(state.view===v?'active':'')+'">'+v[0].toUpperCase()+v.slice(1)+'</button>').join('')+'</div></div>'+summary()+'<div class="ml-cal-bar"><div class="ml-cal-month-nav"><button type="button" class="ml-cal-button" data-today>Today</button><button type="button" data-prev aria-label="Previous">‹</button><button type="button" data-next aria-label="Next">›</button><strong class="ml-cal-month-label">'+esc(label)+'</strong></div><div class="ml-cal-controls"><select class="ml-cal-filter" id="ml-cal-filter"><option value="all" '+(state.filter==='all'?'selected':'')+'>All items</option><option value="events" '+(state.filter==='events'?'selected':'')+'>Events</option><option value="tasks" '+(state.filter==='tasks'?'selected':'')+'>Tasks</option></select><input class="ml-cal-search" id="ml-cal-search" type="search" placeholder="Search calendar" value="'+esc(state.query)+'"></div></div>'+viewContent()+'<p class="ml-cal-footnote">Your calendar entries are private to your Minglora account. Browser reminders work while Minglora is open and notification permission is enabled.</p>'+formHtml+'</section>';
    bind();
  }
  function bind(){
    const root=$('#main-content');if(!root)return;
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;draw();}));
    $('[data-prev]',root)?.addEventListener('click',()=>navigate(-1));
    $('[data-next]',root)?.addEventListener('click',()=>navigate(1));
    $('[data-today]',root)?.addEventListener('click',()=>{state.date=new Date();draw();});
    $('[data-add]',root)?.addEventListener('click',()=>openForm(null,state.date));
    $('[data-date]',root)&&root.querySelectorAll('[data-date]').forEach(b=>b.addEventListener('click',()=>{const d=new Date(b.dataset.date+'T12:00:00');state.date=d;if(state.view==='month')state.view='day';draw();}));
    root.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{state.date=dateAt(state.date.getFullYear(),Number(b.dataset.month),1);state.view='month';draw();}));
    root.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openForm(b.dataset.open)));
    root.querySelectorAll('[data-complete]').forEach(b=>b.addEventListener('change',()=>update(b.dataset.complete,{completed:b.checked})));
    $('#ml-cal-filter',root)?.addEventListener('change',e=>{state.filter=e.target.value;draw();});
    $('#ml-cal-search',root)?.addEventListener('input',e=>{const p=e.target.selectionStart;state.query=e.target.value;draw();const n=$('#ml-cal-search');n?.focus();n?.setSelectionRange(p,p);});
    root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeForm));
    $('#ml-cal-backdrop',root)?.addEventListener('click',e=>{if(e.target.id==='ml-cal-backdrop')closeForm();});
    $('#ml-cal-form',root)?.addEventListener('submit',save);
    $('[data-delete]',root)?.addEventListener('click',remove);
    $('#ml-cal-form',root)?.elements.kind.addEventListener('change',e=>{$('[data-task-check]',root).hidden=e.target.value!=='task';});
  }
  function navigate(n){const d=new Date(state.date);if(state.view==='year')d.setFullYear(d.getFullYear()+n);else if(state.view==='week')d.setDate(d.getDate()+n*7);else if(state.view==='day')d.setDate(d.getDate()+n);else d.setMonth(d.getMonth()+n);state.date=d;draw();}
  function formValue(form){
    const fd=new FormData(form),start=fd.get('startAt'),end=fd.get('endAt'),s=new Date(start),e=end?new Date(end):null,until=fd.get('repeatUntil')?new Date(fd.get('repeatUntil')+'T23:59:59'):null;
    if(!start||!Number.isFinite(s.getTime()))throw new Error('Choose a valid start date and time.');
    if(e&&(!Number.isFinite(e.getTime())||e<=s))throw new Error('The end time must be after the start time.');
    if(until&&until<s)throw new Error('Repeat-until must be on or after the start date.');
    return {title:String(fd.get('title')||'').trim(),kind:fd.get('kind'),calendarName:String(fd.get('calendarName')||'Personal').trim()||'Personal',startAt:iso(start),endAt:end?iso(end):null,allDay:fd.has('allDay'),completed:fd.get('kind')==='task'&&fd.has('completed'),recurrence:fd.get('recurrence')||'none',repeatUntil:until?until.toISOString():null,reminderMinutes:Number(fd.get('reminderMinutes')||0),color:fd.get('color')||defaultColor,location:String(fd.get('location')||'').trim(),description:String(fd.get('description')||'').trim(),timeZone:zone()};
  }
  async function save(event){
    event.preventDefault();const form=event.currentTarget,button=$('[data-save]',form);button.disabled=true;
    try{
      const data=formValue(form);if(!data.title)throw new Error('Add a title first.');
      if(data.reminderMinutes&&'Notification'in window&&Notification.permission==='default')await Notification.requestPermission();
      const id=state.editing;
      await api(id?'/'+encodeURIComponent(id):'',{method:id?'PATCH':'POST',body:JSON.stringify(data)});
      closeForm();await load();draw();toast('Calendar saved.');
    }catch(error){toast(error.message);}finally{button.disabled=false;}
  }
  async function update(id,patch){try{await api('/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(patch)});await load();draw();}catch(error){toast(error.message);}}
  async function remove(){
    if(!state.editing||!confirm('Delete this calendar item?'))return;
    try{await api('/'+encodeURIComponent(state.editing),{method:'DELETE'});closeForm();await load();draw();toast('Calendar item deleted.');}catch(error){toast(error.message);}
  }
  function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportIcs(){
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Minglora//Calendar//EN'];
    for(const e of state.events){
      const d=parse(e.startAt),end=parse(e.endAt);
      const icsDate=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      const summary=String(e.title).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
      lines.push('BEGIN:VEVENT','UID:'+String(e.id).replace(/[^a-zA-Z0-9-]/g,'')+'@minglora','DTSTAMP:'+icsDate(new Date()),'DTSTART'+(e.allDay?';VALUE=DATE:'+key(d).replace(/-/g,''):' :'+icsDate(d)).replace('DTSTART :','DTSTART:'));
      if(end)lines.push('DTEND'+(e.allDay?';VALUE=DATE:'+key(end).replace(/-/g,''):' :'+icsDate(end)).replace('DTEND :','DTEND:'));
      lines.push('SUMMARY:'+summary,'END:VEVENT');
    }
    lines.push('END:VCALENDAR');download(lines.join('\r\n'),'minglora-calendar.ics','text/calendar');
  }
  async function importIcs(){
    const input=document.createElement('input');input.type='file';input.accept='.ics,text/calendar';
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        const blocks=(await file.text()).replace(/\r\n/g,'\n').split('BEGIN:VEVENT').slice(1);let count=0;
        for(const block of blocks){
          const text=block.split('END:VEVENT')[0];
          const get=name=>{const line=text.split('\n').find(x=>x.toUpperCase().startsWith(name));return line?line.slice(line.indexOf(':')+1).trim():'';};
          const title=get('SUMMARY'),raw=get('DTSTART');if(!title||!raw)continue;
          const value=raw.replace(/[^0-9TZ]/g,'');let start;
          if(/^\d{8}$/.test(value))start=new Date(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)+'T00:00:00').toISOString();
          else {const m=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);if(!m)continue;start=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))).toISOString();}
          await api('',{method:'POST',body:JSON.stringify({title,kind:'event',startAt:start,calendarName:'Imported',timeZone:zone()})});count++;
        }
        await load();draw();toast(count+' item'+(count===1?'':'s')+' imported.');
      }catch(error){toast('Import failed: '+error.message);}
    };input.click();
  }
  function checkReminders(){
    if(!('Notification'in window)||Notification.permission!=='granted')return;
    const now=Date.now(),storage='minglora:calendar:reminders:v1';let seen={};
    try{seen=JSON.parse(localStorage.getItem(storage)||'{}');}catch{}
    let changed=false;
    for(const e of state.events){
      if(!e.reminderMinutes||e.completed)continue;
      const due=parse(e.startAt).getTime()-Number(e.reminderMinutes)*60000,id=e.id+'-'+due;
      if(due<=now&&due>now-65000&&!seen[id]){new Notification(e.title,{body:(e.location?e.location+' · ':'')+'Starts '+parse(e.startAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}),tag:id});seen[id]=now;changed=true;}
    }
    if(changed)try{localStorage.setItem(storage,JSON.stringify(seen));}catch{}
  }
  let timer=null;
  async function render(){
    try{await load();draw();if(timer===null){timer=setInterval(checkReminders,30000);checkReminders();}}
    catch(error){const root=$('#main-content');if(root){root.innerHTML='<section class="card empty-state"><h3>Calendar could not load</h3><p>'+esc(error.message)+'</p><button type="button" class="primary" id="ml-cal-retry">Try again</button></section>';$('#ml-cal-retry')?.addEventListener('click',render);}}
  }
  function refresh(){return load().then(draw).catch(error=>toast(error.message));}
  window.MingloraCalendar={render,refresh};
})();
