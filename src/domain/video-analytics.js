export const VIDEO_RETENTION_MIN_SAMPLE_SIZE = 5;
const VIDEO_RETENTION_THRESHOLDS = Object.freeze([0, 0.25, 0.5, 0.75, 0.9, 1]);

function summarizeRetention(viewers) {
  const sample = [...viewers.values()].filter(viewer => viewer.hasProgress);
  if (sample.length < VIDEO_RETENTION_MIN_SAMPLE_SIZE) {
    return { available: false, minSampleSize: VIDEO_RETENTION_MIN_SAMPLE_SIZE, sampleSize: null, points: [] };
  }
  return {
    available: true,
    minSampleSize: VIDEO_RETENTION_MIN_SAMPLE_SIZE,
    sampleSize: sample.length,
    points: VIDEO_RETENTION_THRESHOLDS.map(threshold => {
      const retainedViewers = sample.filter(viewer => viewer.furthestProgressRatio >= threshold).length;
      return {
        positionPercent: Math.round(threshold * 100),
        retainedViewers,
        retentionRate: retainedViewers / sample.length
      };
    })
  };
}

/**
 * Aggregate real Minglora video watch events for the authenticated creator.
 * Viewer identities are never returned; only per-video and portfolio totals leave this module.
 */
export function summarizeCreatorVideoAnalytics(posts = [], watchEvents = [], ownerId, nowMs = Date.now(), periodDays = 30) {
  const days = [7, 30, 90].includes(Number(periodDays)) ? Number(periodDays) : 30;
  const currentTime = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const cutoff = currentTime - days * 24 * 60 * 60 * 1000;
  const ownerPosts = posts.filter(post =>
    post && post.userId === ownerId && post.status !== 'hidden' && !post.archivedAt
  );
  const ownerPostIds = new Set(ownerPosts.map(post => post.id));

  const eventsByPost = new Map();
  const portfolioViewers = new Set();
  let uniqueVideoViews = 0;
  let completedVideoViews = 0;
  let totalWatchMs = 0;

  for (const event of watchEvents) {
    if (!event || !event.postId || !event.userId || event.userId === ownerId) continue;
    const timestamp = Date.parse(event.createdAt || '');
    const durationMs = Number(event.durationMs);
    const watchedMs = Number(event.watchedMs);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > currentTime) continue;
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 3600000) continue;
    if (!Number.isFinite(watchedMs) || watchedMs < 1000) continue;
    if (!ownerPostIds.has(event.postId)) continue;

    const safeWatchedMs = Math.min(Math.round(watchedMs), Math.round(durationMs * 1.5), 600000);
    if (safeWatchedMs < 1000) continue;
    const ratio = safeWatchedMs / durationMs;
    const byViewer = eventsByPost.get(event.postId) || new Map();
    const viewer = byViewer.get(event.userId) || {
      watchedMs: 0,
      completed: false,
      hasProgress: false,
      furthestProgressRatio: 0
    };
    viewer.watchedMs += safeWatchedMs;
    viewer.completed ||= event.completed === true || ratio >= 0.85;
    const positionMs = event.positionMs;
    if (Number.isSafeInteger(positionMs) && positionMs >= 0 && positionMs <= Math.round(durationMs)) {
      viewer.hasProgress = true;
      viewer.furthestProgressRatio = Math.max(viewer.furthestProgressRatio, positionMs / durationMs);
    }
    byViewer.set(event.userId, viewer);
    eventsByPost.set(event.postId, byViewer);
    portfolioViewers.add(event.userId);
    totalWatchMs += safeWatchedMs;
  }

  const videos = ownerPosts
    .map(post => {
      const viewers = eventsByPost.get(post.id) || new Map();
      const completedViewers = [...viewers.values()].filter(viewer => viewer.completed).length;
      const viewerCount = viewers.size;
      uniqueVideoViews += viewerCount;
      completedVideoViews += completedViewers;
      const totalVideoWatchMs = [...viewers.values()].reduce((sum, viewer) => sum + viewer.watchedMs, 0);
      return {
        postId: post.id,
        caption: String(post.text || '').trim().slice(0, 180),
        createdAt: post.createdAt || null,
        uniqueViewers: viewerCount,
        completedViewers,
        totalWatchSeconds: Math.round(totalVideoWatchMs / 1000),
        averageWatchSecondsPerViewer: viewerCount
          ? Math.round((totalVideoWatchMs / viewerCount / 1000) * 10) / 10
          : 0,
        completionRate: viewerCount ? completedViewers / viewerCount : 0,
        retention: summarizeRetention(viewers)
      };
    })
    .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));

  return {
    periodDays: days,
    generatedAt: new Date(currentTime).toISOString(),
    summary: {
      publishedVideos: videos.length,
      uniqueViewers: portfolioViewers.size,
      uniqueVideoViews,
      totalWatchSeconds: Math.round(totalWatchMs / 1000),
      averageWatchSecondsPerViewer: uniqueVideoViews
        ? Math.round((totalWatchMs / uniqueVideoViews / 1000) * 10) / 10
        : 0,
      completionRate: uniqueVideoViews ? completedVideoViews / uniqueVideoViews : 0
    },
    videos: videos.slice(0, 30)
  };
}
