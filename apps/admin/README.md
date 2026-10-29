# Admin client boundary

The internal administration UI is not implemented. It must cover safety reports, moderation queues, audited account/content actions and operational health. Every privileged action must be authorized by the server, use least-privilege roles, and create an audit record; hiding a button is not authorization.