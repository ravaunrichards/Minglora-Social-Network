# Clock Centre module

## Product boundary

Clock Centre is an independent Minglora tool module. It is reachable from the desktop side rail and the mobile Explore / More hub. It does not replace or merge with Calendar, MeetWave, Messenger, or another product area.

The target product has two destinations:

1. Minglora Clock Centre, integrated into the existing account and navigation.
2. A separate standalone Android Clock Centre application, with a native alarm engine and native widgets.

The two destinations may share product concepts and data contracts. Device alarms must always remain local to the device and must never depend on Minglora sign-in, Render, Supabase, or network availability.

## Current branch implementation

The web first slice is implemented in the browser client:

- Live local time and date, 12/24-hour display, analogue hands, and digital time with seconds.
- Interactive perspective clock face using layered CSS 3D transforms; selectable luxury, silver, classic, neon, futuristic, glass, wood, mechanical-skeleton and minimalist appearances.
- Advanced Alarm and Smart Wake-Up alarm modes, recurring weekdays, one-time date, custom labels, sound selection, local custom sound upload, volume, vibration, enable/disable, edit and delete.
- Searchable city clocks across 35 preset world cities and a time-zone converter based on the browser Intl time-zone database.
- Stopwatch with lap and split history.
- Multiple independent countdown timers.
- Saved bedtime/wake-up schedules that automatically create managed wind-down, bedtime and Smart Wake-Up alarms, plus wind-down preference.
- Pomodoro focus sessions with configurable work and breaks.
- Countdown events with annual recurrence, optional create/update/delete sync to Minglora Calendar, and ICS export with yearly recurrence rules.
- Local preferences, export and reset controls.
- Minglora desktop side-rail and mobile Explore / More navigation entries.

All browser Clock Centre records are stored in localStorage under a user-scoped key. This allows local use without a new backend table, but it is device/browser-local and is not cloud-synchronised.

## Important web limitations

The web implementation is a first usable slice, not the final native product.

- Browser alarms only run while the Clock Centre page is open and active enough for its timer loop to execute. Browser throttling, tab closure, device sleep, browser process termination, or a reboot can prevent a web alarm from firing. Do not present browser alarms as dependable wake-up alarms.
- The current Smart Wake-Up mode provides a gentle fixed-time alert and stores a wake-window preference. It does not infer sleep stages. Sensor/wearable-aware wake-up is a native follow-on.
- The current analogue clock is a layered, interactive CSS 3D presentation with live hands, not a photorealistic WebGL mechanical mesh.
- Home-screen widgets, native exact alarms, reboot rescheduling, native calendar-provider permissions, Do Not Disturb integration, and cloud sync are not implemented by this web slice.
- Calendar support in this first slice is export of countdown entries as an ICS file; it is not a connected calendar account integration.
- Custom alarm audio is stored locally in the browser profile and limited to 1 MB.

The user interface deliberately explains the browser alarm limitation so that a user does not mistake a browser timer for a native Android alarm.

## Standalone Android requirements

The separate Android deliverable must implement:

- Native AlarmManager-based scheduling with exact-alarm permission checks and a user-visible fallback if exact scheduling is unavailable.
- Boot receiver and time/time-zone/date-change rescheduling.
- Notification channel, full-screen alarm intent where Android permits it, lock-screen and Doze behavior tests.
- Native audio focus, vibration patterns, snooze/dismiss, sound picker and custom audio URI permissions.
- Independent Advanced Alarm and Smart Wake-Up selection per alarm.
- Explicit disclosure and graceful fallback when wearable/sensor data is not connected.
- Native resizable home-screen widgets.
- Calendar Provider integration behind runtime permission and user choice.
- Optional Do Not Disturb access only after the user grants the special access.
- Offline local database, export/import, and optional account sync for preferences and non-device-critical records.
- A proper native 3D renderer or verified 3D model implementation with a low-power 2D fallback.
- Automated unit, instrumented, lifecycle, reboot, permission-denial and timezone tests.

## Data contract target

Use stable IDs and versioned records. Keep the device schedule authoritative for alarm execution.

- Alarm: id, label, localTime, oneTimeDate, repeatDays, enabled, mode, wakeWindowMinutes, soundId/customSoundUri, volume, vibration, snoozeMinutes, maxSnoozes, createdAt, updatedAt.
- WorldClock: id, cityLabel, ianaTimeZone, sortOrder, favourite.
- Timer: id, label, durationMs, remainingMs, running, endAt, repeatPolicy, soundId.
- Stopwatch: elapsedMs, runningSince, lapRecords.
- SleepSchedule: enabled, bedtime, wakeTime, days, windDownMinutes, doNotDisturbPreference.
- FocusProfile: workMinutes, shortBreakMinutes, longBreakMinutes, sessionsCompleted.
- Countdown: id, label, targetInstant, annualRepeat, calendarExported.
- ClockPreferences: timeFormat, analogue/digital/both, faceStyle, theme, accessibility and sound preferences.

## Verification gate

Do not mark Clock Centre complete until all native alarm and widget requirements are implemented and tested. Tests must cover alarms while the app is closed, after process death, after reboot, during timezone changes, and when exact-alarm permission is denied. The browser implementation must remain explicitly labelled as open-page-only for alarms.
