/**
 * Rank Minglora's real short-form videos for each viewer.
 * Inputs are persisted watch events, follows, saves and post interactions; no synthetic metrics.
 */
export function rankForYouVideos(posts = [], viewerId, follows = [], savedPosts = [], watchEvents = [], feedback = [], now = Date.now()) {
  const following = new Set(follows.filter(edge => edge.followerId === viewerId).map(edge => edge.followedId));
  const savedByViewer = new Set(savedPosts.filter(item => item.userId === viewerId).map(item => item.postId));
  const savesByPost = new Map();
  for (const item of savedPosts) savesByPost.set(item.postId, (savesByPost.get(item.postId) || 0) + 1);

  const hiddenPosts = new Set(feedback
    .filter(item => item.userId === viewerId && item.action === 'not_interested')
    .map(item => item.postId));
  const interestedPosts = new Set(feedback
    .filter(item => item.userId === viewerId && item.action === 'interested')
    .map(item => item.postId));
  const interestedCreators = new Map();
  for (const post of posts) {
    if (interestedPosts.has(post.id) && post.userId && post.userId !== viewerId) {
      interestedCreators.set(post.userId, (interestedCreators.get(post.userId) || 0) + 1);
    }
  }
  const viewerEvents = watchEvents.filter(event => {
    if (event.userId !== viewerId) return false;
    const timestamp = Date.parse(event.createdAt || '');
    return Number.isFinite(timestamp) && timestamp >= now - 90 * 24 * 60 * 60 * 1000;
  });

  const eventsByPost = new Map();
  const creatorAffinity = new Map();
  for (const event of viewerEvents) {
    const ratio = Math.max(0, Math.min(1.5, Number(event.durationMs) > 0
      ? Number(event.watchedMs || 0) / Number(event.durationMs)
      : 0));
    const current = eventsByPost.get(event.postId) || { count: 0, completed: 0, skipCount: 0, totalRatio: 0 };
    current.count += 1;
    current.completed += event.completed === true || ratio >= 0.9 ? 1 : 0;
    current.skipCount += Number(event.watchedMs || 0) < 2500 ? 1 : 0;
    current.totalRatio += ratio;
    eventsByPost.set(event.postId, current);

    const authorId = event.authorId || posts.find(post => post.id === event.postId)?.userId;
    if (authorId && authorId !== viewerId) {
      const interest = Math.min(8, ratio * 5 + (event.completed === true || ratio >= 0.9 ? 2 : 0));
      creatorAffinity.set(authorId, (creatorAffinity.get(authorId) || 0) + interest);
    }
  }

  const scored = posts
    .filter(post => !hiddenPosts.has(post.id))
    .map((post, index) => {
      const timestamp = Date.parse(post.createdAt || '');
      const ageHours = Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3600000) : 24 * 30;
      const freshness = Math.max(0, 12 - ageHours / 24);
      const reactions = Object.keys(post.reactions || {}).length;
      const comments = (post.comments || []).length;
      const saves = savesByPost.get(post.id) || 0;
      const engagement = Math.log1p(reactions + comments * 1.8 + saves * 2.2) * 2.5;
      const activity = eventsByPost.get(post.id) || { count: 0, completed: 0, skipCount: 0 };
      const followedAuthor = following.has(post.userId);
      const relationship = followedAuthor ? 4.5 : 0;
      const affinity = Math.min(10, creatorAffinity.get(post.userId) || 0) * 0.65;
      const discovery = activity.count === 0 ? 2.5 : 0;
      const completionPenalty = Math.min(8, activity.completed * 2.5 + Math.max(0, activity.count - 1));
      const skipPenalty = Math.min(10, activity.skipCount * 3.5);
      const savedBonus = savedByViewer.has(post.id) ? 2 : 0;
      const explicitInterestBonus = interestedPosts.has(post.id) ? 8 : 0;
      const interestedCreatorBonus = Math.min(8, interestedCreators.get(post.userId) || 0) * 0.75;
      const ownPostPenalty = post.userId === viewerId ? 6 : 0;
      return {
        post,
        score: freshness + engagement + relationship + affinity + discovery + savedBonus + explicitInterestBonus + interestedCreatorBonus - completionPenalty - skipPenalty - ownPostPenalty,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        originalIndex: index
      };
    })
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp || a.originalIndex - b.originalIndex);

  const queuesByCreator = new Map();
  for (const item of scored) {
    const creator = item.post.userId || 'unknown-creator';
    if (!queuesByCreator.has(creator)) queuesByCreator.set(creator, []);
    queuesByCreator.get(creator).push(item);
  }

  let queues = [...queuesByCreator.values()];
  const ranked = [];
  while (queues.length) {
    queues.sort((a, b) => b[0].score - a[0].score || a[0].originalIndex - b[0].originalIndex);
    const round = queues;
    queues = [];
    for (const queue of round) {
      const item = queue.shift();
      if (item) ranked.push(item.post);
      if (queue.length) queues.push(queue);
    }
  }
  return ranked;
}
