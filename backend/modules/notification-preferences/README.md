# Notification preferences

**Status:** partially implemented and persisted on the member account.

Available controls: master in-app delivery, friend requests, messages, post interactions, browser/device Web Push, profile-view history, voice/video calls, LIVE and moderator updates, gifts and Fan Club, MeetWave invitations, league matches, and account/platform updates. Category preferences are checked by the server before in-app storage and push dispatch. Existing basic settings remain backward-compatible through defaults.

The current `inApp` and `push` switches are the available channels. Per-channel schedules, quiet hours, daily/weekly digests, email notifications, delivery receipts, retry queues, and realtime subscriptions are not implemented and must not be represented as working controls. Security-critical transactional notices need a separately defined policy before they can bypass member preferences.