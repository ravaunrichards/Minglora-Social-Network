# Recommendations

**Current:** personalized short-video ranking is implemented for Minglora's For You route. Viewer-level signals include watch duration/completion, quick skips, followed creators, saved posts, reactions, content freshness and explicit Not interested feedback. Creator queues are interleaved to reduce repetitive author runs.

**Storage:** watch events and per-post feedback are persisted with Minglora state. Watch events are accepted only for videos the signed-in viewer may access, bounded to validated durations and capped in retention. No fake views or generated engagement are used.

**Still pending:** richer content-topic embeddings, negative-feedback controls beyond Not interested, offline recommendation evaluation and operational analytics.
