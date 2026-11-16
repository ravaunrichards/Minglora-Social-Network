# Clock Centre — development status and delivery plan

## Agreed product decisions

Clock Centre has two destinations: a standalone Android Clock application and an independent Clock Centre feature inside Minglora. The main display supports analogue only, digital only, or both. All clock appearances are user-selectable. Advanced Alarm and Smart Wake-Up are both included and users may choose a mode for each alarm. Sleep scheduling is enabled as a full feature.

Included tools are World Clock, Stopwatch, multiple simultaneous Timers, Sleep Schedule, Focus / Pomodoro, Countdowns, home-screen widgets, time-zone conversion, calendar integration, custom sounds, and themes. Editing, sorting, search, favourites, enable/disable, duplicate and delete controls are first-class requirements.

## Current implementation branch

Branch: feature/clock-centre-foundation

The first browser slice is committed in the Minglora repository. The route is reachable through Clock Centre in the desktop left rail and the mobile Explore / More hub. It includes the live analogue and digital local clock, selectable clock appearances, alarm CRUD and repeat schedules, world clocks, a timezone converter, stopwatch laps, multiple timers, sleep schedule preferences, focus intervals, countdowns, ICS export, local backup/export and settings.

The analogue dial uses a layered interactive CSS 3D presentation. It is not yet a full photorealistic 3D mechanical renderer. The standalone app remains a separate product deliverable and is not part of the Minglora repository.

## Delivery phases

1. **Minglora browser foundation:** navigation, local settings and tool screens, responsive layout, live clock and local tool state.
2. **Clock rendering:** true 3D renderer and mechanical/skeleton clock assets, 2D fallback, performance and reduced-motion controls.
3. **Native Android alarm core:** AlarmManager, exact-alarm permission checks, sound/vibration, snooze/dismiss, boot recovery, timezone and daylight-saving behavior.
4. **Native tool suite:** world clock, stopwatch, multi-timer, sleep routines and Focus session lifecycle.
5. **Native widgets and calendar:** resizable home-screen widgets, Android Calendar Provider integration and optional Do Not Disturb access.
6. **Smart Wake-Up:** wake windows, optional compatible wearable/sensor data, honest sensor availability status and fixed-time backup alarm.
7. **Optional cross-device sync:** authenticated cloud backup for preferences, city lists, countdowns and templates; never require cloud connectivity for device alarms or core tools.
8. **Release and verification:** accessibility, battery use, offline testing, app lifecycle, reboot, permission-denial, time-zone and DST test matrix, signed release and device QA.

## Critical platform truth

A normal web page cannot guarantee an alarm after the browser is closed, throttled, force-stopped, or the device reboots. The Minglora web slice is therefore open-page-only for alarms. Dependable closed-app alarms require the standalone native Android implementation.

Smart Wake-Up must not claim sleep-stage detection without a connected and supported sensor or wearable source. The first web version stores the requested wake window but uses the fixed scheduled alert.

Calendar integration in the browser first slice is ICS export. A connected native calendar requires Android Calendar Provider permissions and explicit user consent. Native widgets are also an Android deliverable, not a browser-only capability.

## Standalone app creation blocker

The connected mobile-app builder rejected standalone app creation with an authorization error requiring an active subscription. The connected GitHub tools can create branches and files in existing repositories but do not expose repository creation. The standalone Android app has therefore not been represented as created, published, or APK-ready. It needs an available native-app build workspace and a new dedicated repository before code can be committed there.
