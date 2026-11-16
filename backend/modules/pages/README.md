# Pages and public identities

**Implemented:** public Page creation with case-insensitive unique handles; editable title, handle, description, category, website, contact email, phone, location and paired action-button label/URL; follow/unfollow; owner/admin/editor publishing; uploaded-media Page posts; publisher/owner/admin post deletion; Page reporting through the existing moderation intake; owner-only Page deletion; role-gated team management, follower directory and real signed-in visitor insights.

## Page roles

- **Owner:** created the Page; can edit details, assign/change/remove admin/editor/analyst roles, publish, view insights and followers, and delete the Page. Ownership is not transferable through the team API.
- **Admin:** can edit Page details, assign or manage editor/analyst access, publish, view insights and followers. Admins cannot promote another admin, remove an admin, or delete the Page.
- **Editor:** can publish and delete their own Page posts. Cannot edit Page details, manage the team, or view private insights/follower directory.
- **Analyst:** can view Page insights and the Page follower directory. Cannot publish or manage Page details/team access.

Team changes apply immediately to an existing Minglora account identified by username. A Page role is separate from that account's personal profile identity.

## Insights definition

Opening an active Page records one signed-in viewer record per Page per UTC date, excluding Page team members. Insights expose unique signed-in accounts in the selected period, recorded visitor-days, current followers and published Page post totals. Anonymous page traffic, impressions, reach, post engagement and historical follower snapshots are not measured. New analytics begin accumulating after this feature is deployed; no historical values are invented.

## Remaining work

Scheduled publishing/drafts, Page avatar and cover uploads, Page-specific post reactions/comments, custom Page inbox, anonymous/public web analytics, post impressions/watch time, follower-growth history, and advanced Page-specific moderation workflows remain incomplete.

**Ownership:** Keep each Page identity separate from the person account that owns or publishes to it. Record the actor for every Page team and publishing action.
