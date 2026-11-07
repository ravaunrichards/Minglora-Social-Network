# Minglora Admin Control Centre

The private administrator workspace is served by `public/admin-centre.html`, `public/admin-centre.js` and `public/admin-centre.css`.

Current controls include:
- MFA-gated access for the designated Creator Hub administrator.
- Searchable member directory with name, username, email, phone number and account-ID lookup.
- Temporary suspensions (1 hour, 24 hours, 7 days or 30 days), permanent suspensions, permanent bans and unban/restore actions.
- Immediate session and pending-MFA challenge revocation when an account is restricted or restored.
- Automatic expiry of timed suspensions during sign-in.
- Reason-required account actions and a server-recorded administrator audit history.
- Moderation reports and member support inbox.

Every privileged operation is authorized by the server. Client-side visibility is not treated as permission. Protected administrator accounts cannot be restricted through member controls. Account action reasons, operator IDs, target IDs, prior/new statuses, duration and timestamps are recorded without storing session tokens or passwords.
