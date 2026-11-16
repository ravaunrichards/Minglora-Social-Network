# Feed and ranking

**Current:** account-backed All, Following, Friends and For You feed routes. The standard feed supports cursor pagination. A dedicated For You route filters to real, viewer-authorized video attachments and returns personalized, creator-diversified recommendations.

**Ownership:** candidate selection, privacy filtering, viewer-specific ranking, cursor pagination, duplicate suppression and refresh behavior. The short-video ranker uses persisted watch completion/skip signals, creator affinity, follow relationships, saves, reactions, freshness and explicit Not interested feedback. Only include content the viewer may access. Never create synthetic posts, watch events or engagement to fill a feed.

**Still pending:** production-grade media transcoding/adaptive bitrate delivery and richer recommendation analytics.
