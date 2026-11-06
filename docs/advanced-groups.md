# Minglora Advanced Groups

This document describes the Groups implementation on `feat/minglora-advanced-groups-20261106`.

## Member experience

- Groups hub with Discover, My groups, and Invitations sections.
- Search across group names, descriptions, categories, and topics.
- Public, private-visible, and private-hidden visibility.
- Group creation settings for category, topics, join approval, post approval, and member invitations.
- Individual group areas for Discussion, About, Members, Events, Group chat, Media, and Manage.
- Group posts support member reactions, threaded comments, and uploaded media.
- Group rules and moderator announcements.
- Group events with Going / Interested responses.
- Member-only group chat with author and moderator message removal.

## Roles

- Owner: full group control and ownership authority.
- Admin: group settings, role assignment within the admin boundary, member moderation, announcements, analytics, and audit history.
- Moderator: member and content moderation, membership requests, announcements, and event management.
- Content Manager: content moderation capabilities in the authorization service.
- Event Manager: group event management.
- Member: participation, posts, comments, reactions, event responses, invitations where permitted, and group chat.

Owner and admin checks are server-enforced. A banned account cannot join or accept a new invitation until an authorized moderator unbans it. The current owner can transfer ownership to an active member; the previous owner becomes an administrator. A group owner can also soft-delete a group by confirming its exact name. Soft deletion removes the group from discovery while retaining its records for audit and retention procedures.

## Privacy and behavior

- Public groups can be discovered and their published posts can be viewed by non-members.
- Private-visible groups expose discoverable group information only. Non-members do not receive the private member directory, discussions, group chat, events, rules, or announcements.
- Private-hidden groups are not discoverable and require an invitation.
- Membership in a group does not create a follow or friendship relationship.
- Member counts, post totals, event responses, and analytics are calculated from stored records; no demo group data or sample engagement is seeded.
- Group chat messages and membership-only comments are not available to non-members.

## API areas

The authenticated server API now supports group discovery and creation, membership requests, invitations, group settings, member roles, ownership transfer, confirmed soft deletion, ban/unban operations, post approvals, announcements, rules, events and RSVPs, member chat, post comments and reactions, analytics, and owner/admin audit history.

## Storage and migration note

The running Minglora server's current persistence layer stores its social-state collections through its existing Supabase-backed state gateway. The additive relational schema is recorded in `database/migrations/083_minglora_advanced_groups.sql` for the relational migration path. This change does **not** execute that SQL against the live Supabase project. Do not treat the relational migration as applied or the feature as production-deployed until the migration path is adopted and validated in a disposable PostgreSQL/Supabase environment, then applied through the project's normal release process.

## Verification and remaining release work

The branch is covered by the repository's CI checks, including JavaScript syntax validation and automated tests. Production release still requires reviewing the open pull request, confirming the latest CI run is green, validating privacy and role flows in a test environment, validating the SQL migration, and then deploying through Minglora's existing Render/Supabase release pipeline.
