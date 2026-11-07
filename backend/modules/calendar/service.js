const RECURRENCES = new Set(['none','daily','weekly','monthly','yearly']);
const REMINDERS = new Set([0,5,10,15,30,60,1440]);
const CALENDAR_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeCalendarEntry(input = {}, existing = null) {
  const value = {...(existing || {}), ...(input || {})};
  const title = String(value.title || '').trim();
  const description = String(value.description || '').trim();
  const location = String(value.location || '').trim();
  const kind = String(value.kind || 'event');
  const recurrence = String(value.recurrence || 'none');
  const startTime = Date.parse(value.startAt || '');
  const endTime = value.endAt ? Date.parse(value.endAt) : null;
  const repeatUntilTime = value.repeatUntil ? Date.parse(value.repeatUntil) : null;
  const reminderMinutes = Number(value.reminderMinutes ?? 0);
  const calendarName = String(value.calendarName || 'Personal').trim();
  const calendarId = String(value.calendarId || calendarName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'personal').trim();
  const color = String(value.color || '#1769e0');
  const timeZone = String(value.timeZone || 'UTC').trim();

  if (!title || title.length > 100) throw new Error('Calendar titles must contain 1–100 characters.');
  if (description.length > 3000) throw new Error('Calendar notes must be 3,000 characters or fewer.');
  if (location.length > 160) throw new Error('Calendar locations must be 160 characters or fewer.');
  if (!['event', 'task'].includes(kind)) throw new Error('Choose a valid calendar item type.');
  if (!Number.isFinite(startTime)) throw new Error('Choose a valid start date and time.');
  if (endTime !== null && (!Number.isFinite(endTime) || endTime <= startTime)) throw new Error('The end time must be after the start time.');
  if (!RECURRENCES.has(recurrence)) throw new Error('Choose a supported repeat option.');
  if (repeatUntilTime !== null && (!Number.isFinite(repeatUntilTime) || repeatUntilTime < startTime)) throw new Error('Repeat-until must be on or after the start date.');
  if (!REMINDERS.has(reminderMinutes)) throw new Error('Choose a supported reminder interval.');
  if (!calendarName || calendarName.length > 40 || !CALENDAR_ID.test(calendarId)) throw new Error('Calendar names must be 1–40 characters and use a valid calendar ID.');
  if (!HEX_COLOR.test(color)) throw new Error('Choose a valid calendar colour.');
  if (!timeZone || timeZone.length > 64) throw new Error('Choose a valid time zone.');

  return {
    title, description, location, kind, recurrence,
    startAt: new Date(startTime).toISOString(),
    endAt: endTime === null ? null : new Date(endTime).toISOString(),
    repeatUntil: recurrence === 'none' || repeatUntilTime === null ? null : new Date(repeatUntilTime).toISOString(),
    reminderMinutes, calendarName, calendarId, color: color.toLowerCase(), timeZone,
    allDay: value.allDay === true,
    completed: kind === 'task' && value.completed === true
  };
}
