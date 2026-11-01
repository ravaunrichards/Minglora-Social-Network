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
    id: owner.id, name: String(saved.name || owner.name || 'Minglora creator'),
    handle: String(saved.handle || owner.username || ''),
    bio: String(saved.bio ?? owner.bio ?? ''), about: String(saved.about || ''),
    location: String(saved.location || ''), links: Array.isArray(saved.links) ? saved.links : [],
    avatar: owner.avatar || '', cover: owner.cover || '',
    createdAt: saved.createdAt || null, updatedAt: saved.updatedAt || null
  };
}

async function publicChannel(db, owner, resolveAssetUrl) {
  const channel = channelFor(db, owner);
  const saved = array(db, 'streambayChannels').find(item => item.userId === owner.id) || {};
  for (const field of ['avatar', 'cover']) {
    const assetId = saved[field + 'AssetId'];
    if (!assetId) continue;
    const asset = array(db, 'mediaAssets').find(item =>
      item.id === assetId && item.ownerId === owner.id && item.slot === 'post' &&
      item.status === 'attached' && item.attachedTo === 'streambay:channel:' + field &&
      item.mediaType === 'image'
    );
    if (asset) { try { channel[field] = await resolveAssetUrl(asset) || channel[field]; } catch {} }
  }
  return channel;
}

function resolveChannelUser(db, id) {
  const key = decodeURIComponent(String(id || '')).toLowerCase();
  return db.users.find(item => item.id === id ||
    String(item.username || '').toLowerCase() === key ||
    array(db, 'streambayChannels').some(channel => channel.userId === item.id && String(channel.handle || '').toLowerCase() === key)
  ) || null;
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
    thumbnailUrl: await (async () => {
      const thumbnail = array(db, 'mediaAssets').find(item =>
        item.id === video.thumbnailAssetId && item.ownerId === video.ownerId &&
        item.slot === 'post' && item.mediaType === 'image' && item.status === 'attached' &&
        item.attachedTo === 'streambay:thumbnail:' + video.id
      );
      if (!thumbnail) return null;
      try { return await resolveAssetUrl(thumbnail); } catch { return null; }
    })(),
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
  const { method, path, url, input={}, user, db, saveStore, uid, now, requireAuth, safeUser, resolveAssetUrl, blockedBetween, deleteMediaAsset } = context;
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
    const result = await Promise.all(rows.map(async item => {
      const owner = db.users.find(entry => entry.id === item.creatorId);
      if (!owner || blockedBetween(user.id, owner.id)) return null;
      return { ...await publicChannel(db, owner, resolveAssetUrl), subscribers: count(subscriptions, sub => sub.creatorId === owner.id), subscribed: true };
    }));
    return { status: 200, body: { channels: result.filter(Boolean) } };
  }

  if (method === 'PATCH' && path === '/api/streambay/channel') {
    requireAuth(user);
    const name = input.name === undefined ? null : String(input.name).trim();
    const handle = input.handle === undefined ? null : String(input.handle).trim().replace(/^@/, '').toLowerCase();
    const bio = input.bio === undefined ? null : String(input.bio).trim();
    const about = input.about === undefined ? null : String(input.about).trim();
    const location = input.location === undefined ? null : String(input.location).trim();
    let links = null;
    if (input.links !== undefined) {
      const rawLinks = Array.isArray(input.links) ? input.links : String(input.links || '').split(/\r?\n/);
      if (rawLinks.length > 5) fail('A channel can contain up to 5 external links.');
      links = rawLinks.map(value => {
        const raw = typeof value === 'string' ? value : value?.url;
        try {
          const parsed = new URL(String(raw || '').trim());
          if (parsed.protocol !== 'https:' || parsed.href.length > 2048) throw new Error();
          return { label: String((typeof value === 'object' && value?.label) || parsed.hostname).trim().slice(0, 50), url: parsed.href };
        } catch { fail('Channel links must be valid HTTPS URLs.'); }
      }).filter(Boolean);
    }
    if (name !== null && (name.length < 2 || name.length > 60)) fail('Channel name must contain 2–60 characters.');
    if (handle !== null && !/^[a-z0-9._-]{3,30}$/.test(handle)) fail('Channel handle must be 3–30 letters, numbers, dots, underscores or hyphens.');
    if (bio !== null && bio.length > 500) fail('Channel bio must be 500 characters or fewer.');
    if (about !== null && about.length > 5000) fail('Channel About must be 5,000 characters or fewer.');
    if (location !== null && location.length > 120) fail('Channel location must be 120 characters or fewer.');
    let channel = channels.find(item => item.userId === user.id);
    if (!channel) { channel = { userId: user.id, createdAt: now() }; channels.push(channel); }
    if (handle !== null) {
      const collision = channels.find(item => item.userId !== user.id && String(item.handle || '').toLowerCase() === handle);
      const usernameCollision = db.users.find(item => item.id !== user.id && String(item.username || '').toLowerCase() === handle);
      if (collision || usernameCollision) fail('That channel handle is already in use.', 409);
      channel.handle = handle;
    }
    if (name !== null) channel.name = name;
    if (bio !== null) channel.bio = bio;
    if (about !== null) channel.about = about;
    if (location !== null) channel.location = location;
    if (links !== null) channel.links = links;
    for (const field of ['avatar', 'cover']) {
      const key = field + 'AssetId';
      if (input[key] === undefined) continue;
      const previousId = channel[key], nextId = String(input[key] || '').trim();
      if (!nextId) {
        const previous = array(db, 'mediaAssets').find(item => item.id === previousId && item.ownerId === user.id);
        if (previous) { previous.status = 'deleted'; previous.deletedAt = now(); }
        channel[key] = null; continue;
      }
      const asset = array(db, 'mediaAssets').find(item =>
        item.id === nextId && item.ownerId === user.id && item.slot === 'post' &&
        item.mediaType === 'image' && item.status === 'uploaded'
      );
      if (!asset) fail('Choose a completed channel image uploaded from your Minglora account.');
      const previous = array(db, 'mediaAssets').find(item => item.id === previousId && item.ownerId === user.id);
      if (previous && previous.id !== asset.id) { previous.status = 'deleted'; previous.deletedAt = now(); }
      asset.status = 'attached'; asset.attachedTo = 'streambay:channel:' + field; asset.attachedAt = now();
      channel[key] = asset.id;
    }
    channel.updatedAt = now();
    await saveStore();
    return { status: 200, body: { channel: await publicChannel(db, user, resolveAssetUrl) } };
  }

  const videoMatch = path.match(/^\/api\/streambay\/videos\/([^/]+)(?:\/(view|like|comments))?$/);
  if (videoMatch) {
    let id;
    try { id = decodeURIComponent(videoMatch[1]); } catch { fail('Video identifier is invalid.', 400); }
    const action = videoMatch[2] || '';
    const video = videos.find(item => item.id === id && visibleVideo(db, item, user, blockedBetween));
    if (!video) fail('Video not found.', 404);

    if (method === 'PATCH' && !action) {
      requireAuth(user);
      if (video.ownerId !== user.id) fail('Only the channel owner can edit this video.', 403);
      const title = input.title === undefined ? video.title : String(input.title).trim();
      const description = input.description === undefined ? video.description || '' : String(input.description).trim();
      const category = input.category === undefined ? video.category || 'Other' : String(input.category).trim();
      if (title.length < 2 || title.length > 120) fail('Video title must contain 2–120 characters.');
      if (description.length > 5000) fail('Video description must be 5,000 characters or fewer.');
      if (!CATEGORIES.has(category)) fail('Choose a supported video category.');
      video.title = title; video.description = description; video.category = category;
      if (input.thumbnailAssetId !== undefined) {
        const previous = array(db, 'mediaAssets').find(item => item.id === video.thumbnailAssetId && item.ownerId === user.id);
        const nextId = String(input.thumbnailAssetId || '').trim();
        if (!nextId) {
          if (previous) { previous.status = 'deleted'; previous.deletedAt = now(); }
          video.thumbnailAssetId = null;
        } else {
          const thumbnail = array(db, 'mediaAssets').find(item =>
            item.id === nextId && item.ownerId === user.id && item.slot === 'post' &&
            item.mediaType === 'image' && item.status === 'uploaded'
          );
          if (!thumbnail) fail('Choose a completed video thumbnail uploaded from your Minglora account.');
          if (previous && previous.id !== thumbnail.id) { previous.status = 'deleted'; previous.deletedAt = now(); }
          thumbnail.status = 'attached'; thumbnail.attachedTo = 'streambay:thumbnail:' + video.id; thumbnail.attachedAt = now();
          video.thumbnailAssetId = thumbnail.id;
        }
      }
      video.updatedAt = now();
      await saveStore();
      return { status: 200, body: { video: await publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl }) } };
    }
    if (method === 'DELETE' && !action) {
      requireAuth(user);
      if (video.ownerId !== user.id) fail('Only the channel owner can delete this video.', 403);
      const asset = mediaAssetFor(db, video);
      if (asset) {
        if (typeof deleteMediaAsset !== 'function') fail('Video storage deletion is not configured.', 503);
        await deleteMediaAsset(asset);
        asset.status = 'deleted'; asset.deletedAt = now();
      }
      const thumbnail = array(db, 'mediaAssets').find(item => item.id === video.thumbnailAssetId && item.ownerId === user.id);
      if (thumbnail) { thumbnail.status = 'deleted'; thumbnail.deletedAt = now(); }
      video.status = 'deleted';
      video.deletedAt = now();
      db.streambayLikes = likes.filter(item => item.videoId !== video.id);
      db.streambayComments = comments.filter(item => item.videoId !== video.id);
      db.streambayHistory = history.filter(item => item.videoId !== video.id);
      await saveStore();
      return { status: 200, body: { ok: true, deleted: true, videoId: video.id } };
    }

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

  if (method === 'GET' && path === '/api/streambay/watch-later') {
    requireAuth(user);
    const rows = array(db, 'streambayWatchLater').filter(item => item.userId === user.id).sort((a,b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const result = await Promise.all(rows.map(async item => {
      const video = videos.find(entry => entry.id === item.videoId);
      if (!visibleVideo(db, video, user, blockedBetween)) return null;
      return { ...await publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl }), savedAt: item.savedAt };
    }));
    return { status: 200, body: { videos: result.filter(Boolean) } };
  }

  const watchLaterMatch = path.match(/^\/api\/streambay\/watch-later\/([^/]+)$/);
  if (watchLaterMatch) {
    requireAuth(user);
    const videoId = decodeURIComponent(watchLaterMatch[1]);
    if (method === 'POST') {
      const video = videos.find(item => item.id === videoId && visibleVideo(db, item, user, blockedBetween));
      if (!video) fail('Video not found.', 404);
      if (!array(db, 'streambayWatchLater').some(item => item.userId === user.id && item.videoId === videoId))
        array(db, 'streambayWatchLater').push({ id: uid(), userId: user.id, videoId, savedAt: now() });
      await saveStore(); return { status: 200, body: { saved: true } };
    }
    if (method === 'DELETE') {
      db.streambayWatchLater = array(db, 'streambayWatchLater').filter(item => !(item.userId === user.id && item.videoId === videoId));
      await saveStore(); return { status: 200, body: { saved: false } };
    }
  }

  if (method === 'GET' && path === '/api/streambay/playlists') {
    const mine = url.searchParams.get('mine') === '1';
    if (mine) requireAuth(user);
    const rows = array(db, 'streambayPlaylists').filter(item => item.status !== 'deleted' && (mine ? item.ownerId === user.id : item.visibility === 'public'))
      .sort((a,b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    return { status: 200, body: { playlists: rows.map(item => ({
      ...item, videoCount: count(array(db, 'streambayPlaylistItems'), entry => entry.playlistId === item.id && videos.some(video => video.id === entry.videoId && visibleVideo(db, video, user, blockedBetween))),
      owner: safeUser(db.users.find(entry => entry.id === item.ownerId), user?.id || null)
    })) } };
  }

  if (method === 'POST' && path === '/api/streambay/playlists') {
    requireAuth(user);
    const title = String(input.title || '').trim(), description = String(input.description || '').trim(), visibility = String(input.visibility || 'public');
    if (title.length < 2 || title.length > 100) fail('Playlist title must contain 2–100 characters.');
    if (description.length > 1000) fail('Playlist description must be 1,000 characters or fewer.');
    if (!['public', 'private'].includes(visibility)) fail('Choose public or private playlist visibility.');
    const playlist = { id: uid(), ownerId: user.id, title, description, visibility, status: 'active', createdAt: now(), updatedAt: now() };
    array(db, 'streambayPlaylists').push(playlist); await saveStore();
    return { status: 201, body: { playlist: { ...playlist, owner: safeUser(user, user.id), videoCount: 0 } } };
  }

  const playlistMatch = path.match(/^\/api\/streambay\/playlists\/([^/]+)(?:\/videos(?:\/([^/]+))?)?$/);
  if (playlistMatch) {
    const playlistId = decodeURIComponent(playlistMatch[1]);
    const playlist = array(db, 'streambayPlaylists').find(item => item.id === playlistId && item.status !== 'deleted');
    if (!playlist) fail('Playlist not found.', 404);
    const isOwner = Boolean(user && playlist.ownerId === user.id);
    if (!isOwner && playlist.visibility !== 'public') fail('Playlist not found.', 404);
    if (method === 'GET' && !playlistMatch[2] && !path.endsWith('/videos')) {
      const ordered = array(db, 'streambayPlaylistItems').filter(item => item.playlistId === playlist.id).sort((a,b) => a.position - b.position || String(a.addedAt).localeCompare(String(b.addedAt)));
      const result = await Promise.all(ordered.map(async item => {
        const video = videos.find(entry => entry.id === item.videoId);
        if (!visibleVideo(db, video, user, blockedBetween)) return null;
        return publicVideo({ db, video, viewer: user, safeUser, resolveAssetUrl });
      }));
      return { status: 200, body: { playlist: { ...playlist, owner: safeUser(db.users.find(entry => entry.id === playlist.ownerId), user?.id || null), videoCount: result.filter(Boolean).length }, videos: result.filter(Boolean) } };
    }
    if (playlistMatch[2] === undefined && path.endsWith('/videos') && method === 'POST') {
      requireAuth(user); if (!isOwner) fail('Only the playlist owner can add videos.', 403);
      const videoId = String(input.videoId || '');
      const video = videos.find(item => item.id === videoId && visibleVideo(db, item, user, blockedBetween));
      if (!video) fail('Choose an available video to add.', 404);
      const items = array(db, 'streambayPlaylistItems');
      if (!items.some(item => item.playlistId === playlist.id && item.videoId === videoId))
        items.push({ id: uid(), playlistId: playlist.id, videoId, position: items.filter(item => item.playlistId === playlist.id).length, addedAt: now() });
      playlist.updatedAt = now(); await saveStore();
      return { status: 200, body: { ok: true, videoCount: items.filter(item => item.playlistId === playlist.id).length } };
    }
    if (playlistMatch[2] !== undefined && method === 'DELETE') {
      requireAuth(user); if (!isOwner) fail('Only the playlist owner can remove videos.', 403);
      db.streambayPlaylistItems = array(db, 'streambayPlaylistItems').filter(item => !(item.playlistId === playlist.id && item.videoId === decodeURIComponent(playlistMatch[2])));
      playlist.updatedAt = now(); await saveStore(); return { status: 200, body: { ok: true } };
    }
    if (method === 'PATCH') {
      requireAuth(user); if (!isOwner) fail('Only the playlist owner can edit this playlist.', 403);
      const title = input.title === undefined ? playlist.title : String(input.title).trim();
      const description = input.description === undefined ? playlist.description : String(input.description).trim();
      const visibility = input.visibility === undefined ? playlist.visibility : String(input.visibility);
      if (title.length < 2 || title.length > 100) fail('Playlist title must contain 2–100 characters.');
      if (description.length > 1000) fail('Playlist description must be 1,000 characters or fewer.');
      if (!['public', 'private'].includes(visibility)) fail('Choose public or private playlist visibility.');
      Object.assign(playlist, { title, description, visibility, updatedAt: now() });
      await saveStore(); return { status: 200, body: { playlist } };
    }
    if (method === 'DELETE') {
      requireAuth(user); if (!isOwner) fail('Only the playlist owner can delete this playlist.', 403);
      playlist.status = 'deleted'; db.streambayPlaylistItems = array(db, 'streambayPlaylistItems').filter(item => item.playlistId !== playlist.id);
      await saveStore(); return { status: 200, body: { ok: true, deleted: true } };
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
        ...await publicChannel(db, owner, resolveAssetUrl),
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
