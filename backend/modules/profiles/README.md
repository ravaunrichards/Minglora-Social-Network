# Profiles

**Current:** basic editable profile fields; privacy and account controls are incomplete.

**Ownership:** usernames, display names, bios, location, avatar/cover media references, account type and profile visibility. Filter fields by viewer authorization; media references must not bypass privacy.

## Profile visit analytics

- Profile views are recorded by the authenticated profile GET route only after the target exists, the viewer is not blocked, and profile visibility permits access.
- The owner is not counted as a visitor. A signed-in member is counted at most once per profile per UTC day.
- The owner's profile displays the rolling 30-day visit count; visitor identities are not exposed in this metric.
- A profile is marked as actively being viewed while a visible browser tab sends an authenticated heartbeat every 20 seconds. Presence expires after 50 seconds without a heartbeat, including when the tab is closed, hidden, or the member navigates away.
- The live active-viewer number is unique by member and is visible only to the profile owner.
- Visit and presence records are stored in the existing durable Minglora runtime state collections (`profileViews` and `profileViewPresence`). Counts are computed on the server, never accepted from the browser.
