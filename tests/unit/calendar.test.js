import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendarEntry} from '../../backend/modules/calendar/service.js';

test('normalizes valid private calendar entries',()=>{
  const entry=normalizeCalendarEntry({title:'Dentist appointment',startAt:'2026-12-02T14:00:00.000Z',endAt:'2026-12-02T15:00:00.000Z',reminderMinutes:30,timeZone:'America/Jamaica'});
  assert.equal(entry.title,'Dentist appointment');
  assert.equal(entry.calendarId,'personal');
  assert.equal(entry.reminderMinutes,30);
  assert.equal(entry.timeZone,'America/Jamaica');
});
test('rejects invalid dates, end times and repeat rules',()=>{
  assert.throws(()=>normalizeCalendarEntry({title:'Meeting',startAt:'not-a-date'}),/valid start date/);
  assert.throws(()=>normalizeCalendarEntry({title:'Meeting',startAt:'2026-12-02T14:00:00Z',endAt:'2026-12-02T13:00:00Z'}),/end time must be after/);
  assert.throws(()=>normalizeCalendarEntry({title:'Meeting',startAt:'2026-12-02T14:00:00Z',recurrence:'hourly'}),/supported repeat/);
});
test('supports tasks, recurring reminders and completion',()=>{
  const entry=normalizeCalendarEntry({title:'Submit assignment',kind:'task',startAt:'2026-12-02T14:00:00Z',recurrence:'weekly',repeatUntil:'2027-01-02T23:59:00Z',completed:true,reminderMinutes:1440});
  assert.equal(entry.kind,'task');assert.equal(entry.completed,true);assert.equal(entry.recurrence,'weekly');assert.equal(entry.reminderMinutes,1440);
});
test('rejects unsafe colours and overlong fields',()=>{
  assert.throws(()=>normalizeCalendarEntry({title:'Meeting',startAt:'2026-12-02T14:00:00Z',color:'red'}),/valid calendar colour/);
  assert.throws(()=>normalizeCalendarEntry({title:'x'.repeat(101),startAt:'2026-12-02T14:00:00Z'}),/1–100/);
});
