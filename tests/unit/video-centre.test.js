import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora Video Centre discovers only real video attachments from the authenticated feed', async () => {
  const [app, html, styles] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/index.html'),
    read('../../public/styles.css')
  ]);

  assert.match(app, /videoFeed:\[\]/);
  assert.match(app, /videoMode:'videos'/);
  assert.match(app, /data-video-mode="reels"/);
  assert.match(app, /function renderReelCard\(/);
  assert.match(app, /function bindReelPlayback\(/);
  assert.match(app, /new IntersectionObserver\(/);
  assert.match(app, /threshold:\[0,0\.65,1\]/);
  assert.match(app, /data-reel-video controls playsinline loop muted preload="metadata"/);
  assert.match(app, /data-react=/);
  assert.match(app, /data-comment-form=/);
  assert.match(app, /state\.videoFeed=\(result\.posts\|\|\[\]\)\.filter\(post=>\(post\.media\|\|\[\]\)\.some\(media=>media\.mediaType==='video'&&media\.url\)\)/);
  assert.match(app, /api\('\/feed\?scope='/);
  assert.match(app, /view:'videos'/);
  assert.match(app, /state\.view==='videos'/);
  assert.match(app, /function renderVideoCentre\(\)/);
  assert.match(app, /function findVisiblePost\(id\)[\s\S]*state\.videoFeed/);
  assert.match(app, /video-create-button/);
  assert.match(app, /data-video-search|video-search/);
  assert.match(html, /src="\/app\.js\?v=[^"]+"/);
  assert.match(styles, /\.video-centre-feed/);
  assert.match(styles, /\.video-centre-reels/);
  assert.match(styles, /scroll-snap-type:y mandatory/);
  assert.match(styles, /\.minglora-reel-video/);
  assert.match(html, /src="\/app\.js\?v=[^"]+"/);
  assert.doesNotMatch(app, /sampleVideoFixtures|fakeVideoFixtures|seedVideoFeed/i);
});

test('Minglora Video Centre publishes through a video-only one-file composer', async () => {
  const app = await read('../../public/app.js');
  assert.match(app, /function openVideoComposer\(options=\{\}\)/);
  assert.match(app, /createMediaPicker\(modal\.querySelector\('#create-video-media-picker'\),\{slot:'post',maxFiles:1,accept:'video\/mp4,video\/webm,video\/quicktime'\}\)/);
  assert.match(app, /new Set\(\['video\/mp4','video\/webm','video\/quicktime'\]\)/);
  assert.match(app, /Choose one supported video file before publishing/);
  assert.match(app, /if\(mediaIds\.length!==1\)/);
  assert.match(app, /api\('\/posts',\{method:'POST',body:JSON\.stringify\(\{text:values\.get\('text'\),audience:values\.get\('audience'\),mediaIds,videoFormat:options\.videoFormat==='reel'\?'reel':'video'\}\)\}\)/);
  assert.ok(app.includes("root.querySelector('#video-create-button')?.addEventListener('click',()=>openVideoComposer({videoFormat:mode==='reels'?'reel':'video'}))"));
  assert.ok(app.includes("feed.querySelector('#video-empty-create')?.addEventListener('click',()=>openVideoComposer({videoFormat:mode==='reels'?'reel':'video'}))"));
});

test('profile Create reel reuses the single-video composer and returns to the profile', async () => {
  const app = await read('../../public/app.js');
  assert.match(app, /function openProfileReelComposer\(profileId\)\{\s*return openVideoComposer\(\{videoFormat:'reel',onPublished:\(\)=>openProfile\(profileId\)\}\);\s*\}/);
  assert.match(app, /if\(typeof options\.onPublished==='function'\)await options\.onPublished\(\)/);
});

test('Minglora stores and filters Video and Reel posts as distinct formats', async () => {
  const [app, server] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js')
  ]);
  assert.match(app, /videoFormat:options\.videoFormat==='reel'\?'reel':'video'/);
  assert.match(app, /modePosts=mode==='watch-later'\?state\.videoFeed:state\.videoFeed\.filter\(post=>mode==='reels'\?post\.videoFormat==='reel':post\.videoFormat!=='reel'\)/);
  assert.match(app, /openVideoComposer\(\{videoFormat:mode==='reels'\?'reel':'video'\}\)/);
  assert.match(server, /requestedVideoFormat=input\.videoFormat===undefined\|\|input\.videoFormat===null\?null:String\(input\.videoFormat\)/);
  assert.match(server, /requestedVideoFormat&&\(assets\.length!==1\|\|assets\[0\]\?\.mediaType!=='video'\)/);
  assert.match(server, /videoFormat:requestedVideoFormat/);
});

test('Minglora Watch Later is private and accepts only posts containing an accessible video', async () => {
  const [app, server, store] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../src/store.js')
  ]);
  assert.match(app, /data-video-mode="watch-later"/);
  assert.match(app, /api\('\/video-watch-later'\)/);
  assert.match(app, /data-watch-later=/);
  assert.match(app, /data-watch-later-saved=/);
  assert.match(server, /if\(method==='GET'&&p==='\/api\/video-watch-later'\)/);
  assert.match(server, /if\(\(method==='POST'\|\|method==='DELETE'\)&&m\)/);
  assert.match(server, /saved\.readLater=true/);
  assert.match(server, /saved\.readLater=false/);
  assert.match(server, /media\.mediaType==='video'&&media\.url/);
  assert.match(server, /canViewProfileAudience\(user\.id,post\.userId,post\.audience\|\|'public'\)/);
  assert.match(server, /isWatchLater:\(db\.savedPosts\|\|\[\]\)\.some\(saved=>saved\.userId===viewerId&&saved\.postId===p\.id&&saved\.readLater===true\)/);
  assert.match(store, /'savedPosts'/);
});

test('Reels record genuine watch-time and the Video Centre paginates without replacing the current reel stack', async () => {
  const app = await read('../../public/app.js');

  assert.match(app, /data-reel-video controls playsinline loop muted preload="metadata" data-post-id=/);
  assert.match(app, /video\.dataset\.watchBuffer/);
  assert.match(app, /api\('\/videos\/'\+encodeURIComponent\(postId\)\+'\/watch'/);
  assert.match(app, /video\.addEventListener\('timeupdate'/);
  assert.match(app, /video\.addEventListener\('pause'/);
  assert.match(app, /async function fetchVideoCentrePage\(\{reset=false,watchLater=false\}=\{\}\)/);
  assert.match(app, /cursorQuery=!reset&&state\.videoNextCursor/);
  assert.match(app, /state\.videoHasMore=!watchLater&&result\.hasMore===true/);
  assert.match(app, /data-video-load-more/);
  assert.match(app, /new IntersectionObserver\(entries=>\{/);
  assert.match(app, /root:scroller,rootMargin:'650px'/);
  assert.match(app, /while\(pending\.firstChild\)list\.insertBefore\(pending\.firstChild,button\)/);
  assert.match(app, /videoCentrePaginationObserver/);
});
