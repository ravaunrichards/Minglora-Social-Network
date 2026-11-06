# Groups pages

The Minglora Groups experience includes the discovery hub, group creation, privacy-aware group details, member directory, group discussions, media, group chat, rules, announcements, event scheduling and RSVPs, membership requests and invitations, moderation tools, role management, analytics, and owner/admin audit history.

The active web interface is implemented in `public/app.js` and styled in `public/styles.css`. Authenticated server endpoints are implemented in `src/server.js`; group authorization helpers are in `backend/modules/groups/service.js`.

No placeholder groups, sample members, fake posts, mock invitations, or fabricated analytics are created. Group membership is separate from following and friendship.

The relational schema proposal is in `database/migrations/083_minglora_advanced_groups.sql`. It is not automatically applied to the live Supabase project by this branch. See `docs/advanced-groups.md` for scope and release notes.
