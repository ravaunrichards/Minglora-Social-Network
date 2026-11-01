const CATEGORIES = new Set(['Music','Gaming','Education','News','Sports','Comedy','Technology','Travel','Food','Lifestyle','Other']);
const array = (db, key) => {
  if (!Array.isArray(db[key])) db[key] = [];
  return db[key];
};
const fail = (message, status=400) => { throw Object.assign(new Error(message), { status }); };
const count = (items, predicate) => items.filter(predicate).length;

function channelFor(db, owner) {
  const saved = array(db, 'streambayChannels').find(item => item.userId === owner.id) || {};
  return {
    id: owner.id,
    name: String(saved.name || owner.name || 'Minglora creator'),
    handle: String(owner.username || ''),
    bio: String(saved.bio ?? owner.bio ?? ''),
    avatar: owner.avatar || '',
    cover: owner.cover || ''
  };
}

function resolveChannelUser(db, id) {
  const key = decodeURIComponent(String(id || ''));
  return db.users.find(item => item.id === key || String(item.username || '').toLowerCase() === key.toLowerCase()) || null;
}

function mediaAssetFor(db, video) {
  return array(db, 'mediaAssets').find(asset =>
    asset.id === video.assetId &&
    asset.ownerId === video.ownerId &&
    asset.slot === 'post' &&
    asset.status === 'attached' &&
    asset.attachedTo === 'streambay:' + video.id &&
    asset.mediaType === 'video'
  ) || null;
}

async function publicVideo({ db, video, viewer, safeUser, resolveAssetUrl }) {
  const owner = db.users.find(item => item.id === video.ownerId) || null;
  const asset = mediaAssetFor(db, video);
  let mediaUrl = null;
  if (asset) {
    try { mediaUrl = await resolveAssetUrl(asset); } catch { mediaUrl = null; }
  }
  const likes = array(db, 'streambayLikes');
  const comments = array(db, 'streambayComments');
  const subscriptions = array(db, 'streambaySubscriptions');
  return {
    id: video.id,
    ownerId: video.ownerId,
    title: video.title,
    description: video.description || '',
    category: video.category || 'Other',
    views: Number(video.views) || 0,
    createdAt: video.createdAt,
    duration: video.duration || '',
    media: mediaUrl ? { url: mediaUrl, mimeType: asset.mimeType, byteSize: asset.byteSize } : null,
    owner: owner ? safeUser(owner, viewer?.id || null) : { id: video.ownerId, name: 'Former creator', username: 'deleted', avatar: '' },
    likes: count(likes, item => item.videoId === video.id),
    liked: Boolean(viewer && likes.some(item => item.videoId === video.id && item.userId === viewer.id)),
    comments: count(comments, item => item.videoId === video.id),
    subscribers: count(subscriptions, item => item.creatorId === video.ownerId)
  };
}

function visibleVideo(db, video, viewer, blockedBetween) {
  if (!video || video.status !== 'published' || !mediaAssetFor(db, video)) return false;
  if (viewer && blockedBetween(viewer.id, video.ownerId)) return false;
  const owner = db.users.find(item => item.id === video.ownerId);
  return Boolean(owner && !['suspended', 'deactivated'].includes(owner.status));
}

export async function handleStreamBayApi(context) {
  const { method, path, url, input={}, user, db, saveStore, uid, now, requireAuth, safeUser, resolveAssetUrl, blockedBetween } = context;
  const videos = array(db, 'streambayVideos');
  const comments = array(db, 'streambayComments');
  const subscriptions = array(db, 'streambaySubscriptions');
  const likes = array(db, 'streambayLikes');
  const history = array(db, 'streambayHistory');
  const channels = array(db, 'streambayChannels');

  if (method === 'GET' && path === '/api/streambay/health') {
    return { status: 200, body: { ok: true, service: 'minglora-streambay', videos: videos.filter(item => item.status === 'published').length } };
  }

  if (method === 'GET' && path === '/api/streambay/videos') {
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    const sort = String(url.searchParams.get('sort') || 'recent');
    const mine = url.searchParams.get('mine') === '1';
    if (mine) requireAuth(user);
    let rows = videos.filter(video => visibleVideo(db, video, user, blockedBetween));
    if (mine) rows = rows.filter(video => video.ownerId === user.id);
    if (sort === 'subscriptions') {
      const creatorIds = new Set(subscriptions.filter(item => item.subscriberId === user?.id).map(item => item.creatorId));
      rows = rows.filter(video => creatorIds.has(video.ownerId));
    }
    if (query) {
      rows = rows.filter(video => {
        const owner = db.users.find(item => item.id === video.ownerId);
        return [video.title, video.description, video.category, owner?.name, owner?.username].join(' ').toLowerCase().includes(query);
      });
    }
    if (sort === 'popular') {
      rows.sort((a,b) => {
        const scoreA = count(likes, item => item.videoId === a.id) * 4 + (Number(a.views) || 0);
        const scoreB = count(likes, item => item.videoId === b.id) * 4 + (Number(b.views) || 0);
        return scoreB - scoreA || String(b.createdAt).localeCompare(String(a.createdAt));
      });
    } else {
      rows.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    const result = await Promise.all(rows.slice(0, 100).map(video => publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl })));
    return { status: 200, body: { videos: result } };
  }

  if (method === 'GET' && path === '/api/streambay/history') {
    requireAuth(user);
    const rows = history.filter(item => item.userId === user.id).sort((a,b) => String(b.viewedAt).localeCompare(String(a.viewedAt))).slice(0, 100);
    const seen = new Set();
    const unique = rows.filter(item => !seen.has(item.videoId) && seen.add(item.videoId));
    const result = await Promise.all(unique.map(async item => {
      const video = videos.find(entry => entry.id === item.videoId);
      if (!visibleVideo(db, video, user, blockedBetween)) return null;
      const view = await publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl });
      return { ...view, viewedAt: item.viewedAt };
    }));
    return { status: 200, body: { videos: result.filter(Boolean) } };
  }

  if (method === 'DELETE' && path === '/api/streambay/history') {
    requireAuth(user);
    db.streambayHistory = history.filter(item => item.userId !== user.id);
    await saveStore();
    return { status: 200, body: { ok: true } };
  }

  if (method === 'GET' && path === '/api/streambay/subscriptions') {
    requireAuth(user);
    const rows = subscriptions.filter(item => item.subscriberId === user.id);
    const result = rows.map(item => {
      const owner = db.users.find(entry => entry.id === item.creatorId);
      if (!owner || blockedBetween(user.id, owner.id)) return null;
      return { ...channelFor(db, owner), subscribers: count(subscriptions, sub => sub.creatorId === owner.id), subscribed: true };
    }).filter(Boolean);
    return { status: 200, body: { channels: result } };
  }

  if (method === 'PATCH' && path === '/api/streambay/channel') {
    requireAuth(user);
    const name = input.name === undefined ? null : String(input.name).trim();
    const bio = input.bio === undefined ? null : String(input.bio).trim();
    if (name !== null && (name.length < 2 || name.length > 60)) fail('Channel name must contain 2–60 characters.');
    if (bio !== null && bio.length > 500) fail('Channel description must be 500 characters or fewer.');
    let channel = channels.find(item => item.userId === user.id);
    if (!channel) { channel = { userId: user.id, createdAt: now() }; channels.push(channel); }
    if (name !== null) channel.name = name;
    if (bio !== null) channel.bio = bio;
    channel.updatedAt = now();
    await saveStore();
    return { status: 200, body: { channel: channelFor(db, user) } };
  }

  const videoMatch = path.match(/^\/api\/streambay\/videos\/([^/]+)(?:\/(view|like|comments))?$/);
  if (videoMatch) {
    let id;
    try { id = decodeURIComponent(videoMatch[1]); } catch { fail('Video identifier is invalid.', 400); }
    const action = videoMatch[2] || '';
    const video = videos.find(item => item.id === id && visibleVideo(db, item, user, blockedBetween));
    if (!video) fail('Video not found.', 404);

    if (method === 'GET' && !action) {
      return { status: 200, body: { video: await publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl }) } };
    }
    if (method === 'GET' && action === 'view') {
      video.views = (Number(video.views) || 0) + 1;
      if (user) {
        const previous = history.find(item => item.userId === user.id && item.videoId === video.id);
        if (previous) previous.viewedAt = now();
        else history.push({ id: uid(), userId: user.id, videoId: video.id, viewedAt: now() });
      }
      await saveStore();
      return { status: 200, body: { video: await publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl }) } };
    }
    if (method === 'POST' && action === 'like') {
      requireAuth(user);
      const index = likes.findIndex(item => item.videoId === video.id && item.userId === user.id);
      if (index >= 0) likes.splice(index, 1);
      else likes.push({ id: uid(), videoId: video.id, userId: user.id, createdAt: now() });
      await saveStore();
      return { status: 200, body: { liked: index < 0, likes: count(likes, item => item.videoId === video.id) } };
    }
    if (method === 'GET' && action === 'comments') {
      const rows = comments.filter(item => item.videoId === video.id).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const result = rows.map(item => {
        const author = db.users.find(entry => entry.id === item.userId);
        return { ...item, user: author ? safeUser(author, user?.id || null) : { id: item.userId, name: 'Former member', avatar: '' } };
      });
      return { status: 200, body: { comments: result } };
    }
    if (method === 'POST' && action === 'comments') {
      requireAuth(user);
      const text = String(input.text || '').trim();
      if (!text || text.length > 1000) fail('Comment must contain 1–1000 characters.');
      const comment = { id: uid(), videoId: video.id, userId: user.id, text, createdAt: now() };
      comments.push(comment);
      await saveStore();
      return { status: 201, body: { comment: { ...comment, user: safeUser(user, user.id) } } };
    }
  }

  const channelMatch = path.match(/^\/api\/streambay\/channels\/([^/]+)(?:\/(subscribe|videos))?$/);
  if (channelMatch) {
    let id;
    try { id = decodeURIComponent(channelMatch[1]); } catch { fail('Channel identifier is invalid.'); }
    const owner = resolveChannelUser(db, id);
    if (!owner || (user && blockedBetween(user.id, owner.id))) fail('Channel not found.', 404);
    const action = channelMatch[2] || '';
    const channel = channelFor(db, owner);
    if (method === 'GET' && !action) {
      return { status: 200, body: { channel: {
        ...channel,
        owner: safeUser(owner, user?.id || null),
        subscribers: count(subscriptions, item => item.creatorId === owner.id),
        subscribed: Boolean(user && subscriptions.some(item => item.creatorId === owner.id && item.subscriberId === user.id)),
        videoCount: count(videos, item => item.ownerId === owner.id && item.status === 'published' && Boolean(mediaAssetFor(db, item)))
      } } };
    }
    if (method === 'GET' && action === 'videos') {
      const rows = videos.filter(item => item.ownerId === owner.id && visibleVideo(db, item, user, blockedBetween)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const result = await Promise.all(rows.map(video => publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl })));
      return { status: 200, body: { videos: result } };
    }
    if (method === 'POST' && action === 'subscribe') {
      requireAuth(user);
      if (owner.id === user.id) fail('You cannot subscribe to your own channel.');
      const index = subscriptions.findIndex(item => item.creatorId === owner.id && item.subscriberId === user.id);
      if (index >= 0) subscriptions.splice(index, 1);
      else subscriptions.push({ id: uid(), creatorId: owner.id, subscriberId: user.id, createdAt: now() });
      await saveStore();
      return { status: 200, body: { subscribed: index < 0, subscribers: count(subscriptions, item => item.creatorId === owner.id) } };
    }
  }

  if (method === 'POST' && path === '/api/streambay/videos') {
    requireAuth(user);
    const assetId = String(input.assetId || '');
    const asset = array(db, 'mediaAssets').find(item =>
      item.id === assetId &&
      item.ownerId === user.id &&
      item.slot === 'post' &&
      item.status === 'uploaded' &&
      item.mediaType === 'video'
    );
    if (!asset) fail('Choose a completed video upload from your Minglora account.');
    const title = String(input.title || '').trim().slice(0, 120);
    const description = String(input.description || '').trim().slice(0, 5000);
    const category = String(input.category || 'Other').trim();
    if (title.length < 2) fail('Video title must contain at least 2 characters.');
    if (!CATEGORIES.has(category)) fail('Choose a supported video category.');
    if (Number(asset.byteSize) > 500 * 1024 * 1024) fail('Video uploads cannot exceed 500 MB.');
    const video = {
      id: uid(), ownerId: user.id, assetId: asset.id, title, description, category,
      views: 0, status: 'published', duration: '', createdAt: now()
    };
    videos.unshift(video);
    asset.status = 'attached';
    asset.attachedTo = 'streambay:' + video.id;
    asset.attachedAt = now();
    await saveStore();
    return { status: 201, body: { video: await publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl }) } };
  }

  return path.startsWith('/api/streambay/')
    ? { status: 404, body: { error: 'StreamBay route not found.' } }
    : null;
}
