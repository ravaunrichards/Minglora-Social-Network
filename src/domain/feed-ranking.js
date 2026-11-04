/**
 * Rank content for Minglora's personalized For You feed.
 * Signals are calculated from Minglora's own posts, reactions, saves and follow graph.
 */
export function rankForYouFeed(posts = [], viewerId, follows = [], savedPosts = [], now = Date.now()) {
  const following = new Set(follows.filter(edge => edge.followerId === viewerId).map(edge => edge.followedId));
  const followers = new Set(follows.filter(edge => edge.followedId === viewerId).map(edge => edge.followerId));
  const mutualFollows = new Set([...following].filter(id => followers.has(id)));
  const savedByViewer = new Set(savedPosts.filter(item => item.userId === viewerId).map(item => item.postId));
  const savesByPost = new Map();
  for (const item of savedPosts) savesByPost.set(item.postId,(savesByPost.get(item.postId)||0)+1);

  const affinity = new Map();
  const addAffinity = (authorId,weight) => {
    if (!authorId || authorId === viewerId) return;
    affinity.set(authorId,(affinity.get(authorId)||0)+weight);
  };
  for (const post of posts) {
    if (Object.prototype.hasOwnProperty.call(post.reactions||{},viewerId)) addAffinity(post.userId,3.5);
    const commentsByViewer = (post.comments||[]).filter(comment=>comment.userId===viewerId).length;
    if (commentsByViewer) addAffinity(post.userId,Math.min(6,commentsByViewer*1.8));
    if (savedByViewer.has(post.id)) addAffinity(post.userId,4);
  }

  const scored = posts.map(post => {
    const timestamp = Date.parse(post.createdAt||'');
    const ageHours = Number.isFinite(timestamp) ? Math.max(0,(now-timestamp)/3600000) : 24*30;
    const freshness = Math.max(0,14-ageHours/12);
    const reactions = Object.keys(post.reactions||{}).length;
    const comments = (post.comments||[]).length;
    const saves = savesByPost.get(post.id)||0;
    const engagement = Math.log1p(reactions+comments*1.7+saves*2.2)*2.8;
    const followsAuthor = following.has(post.userId);
    const relationship = (followsAuthor?6:0)+(mutualFollows.has(post.userId)?3:0);
    const personalAffinity = Math.min(12,affinity.get(post.userId)||0)*0.8;
    const discovery = followsAuthor?0:2.25;
    const mediaBonus = post.mediaIds?.length?1.25:0;
    const ownPostPenalty = post.userId===viewerId?5:0;
    return {
      post,
      score:freshness+engagement+relationship+personalAffinity+discovery+mediaBonus-ownPostPenalty,
      timestamp:Number.isFinite(timestamp)?timestamp:0
    };
  }).sort((a,b)=>b.score-a.score||b.timestamp-a.timestamp||String(b.post.id).localeCompare(String(a.post.id)));

  // Interleave creator queues to make discovery more varied and avoid repeated authors.
  const queuesByCreator = new Map();
  for (const item of scored) {
    const creator = item.post.userId||'unknown-creator';
    if (!queuesByCreator.has(creator)) queuesByCreator.set(creator,[]);
    queuesByCreator.get(creator).push(item);
  }
  let queues = [...queuesByCreator.values()];
  const ranked = [];
  while (queues.length) {
    queues.sort((a,b)=>b[0].score-a[0].score);
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
