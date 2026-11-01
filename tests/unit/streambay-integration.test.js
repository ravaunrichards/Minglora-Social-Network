import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleStreamBayApi } from '../../backend/modules/streambay/service.js';

const owner = { id:'creator-1', name:'StreamBay Creator', username:'creatorone', bio:'Minglora profile', avatar:'https://cdn.example/creator.jpg', status:'active' };
const viewer = { id:'viewer-1', name:'Minglora Viewer', username:'viewerone', avatar:'', status:'active' };
const makeContext = () => {
  const db = {
    users:[owner,viewer],
    mediaAssets:[{id:'asset-1',ownerId:owner.id,slot:'post',status:'attached',attachedTo:'streambay:video-1',mediaType:'video',mimeType:'video/mp4',byteSize:1024,bucket:'videos',path:'creator/video-1.mp4'}],
    streambayVideos:[{id:'video-1',ownerId:owner.id,assetId:'asset-1',title:'A real video',description:'A description',category:'Education',views:2,status:'published',createdAt:'2026-10-30T12:00:00.000Z'}],
    streambayComments:[],streambaySubscriptions:[],streambayLikes:[],streambayHistory:[],streambayChannels:[],streambayPlaylists:[],streambayPlaylistItems:[],streambayWatchLater:[]
  };
  let sequence=0;
  return {
    db, method:'GET', path:'/api/streambay/videos', url:new URL('https://minglora.test/api/streambay/videos'),
    input:{}, user:viewer, saveStore:async()=>{}, uid:()=>'id-'+(++sequence),
    now:()=> '2026-11-01T12:00:00.000Z',
    requireAuth:user=>{if(!user)throw Object.assign(new Error('Sign in to continue.'),{status:401});},
    safeUser:user=>user?{id:user.id,name:user.name,username:user.username,avatar:user.avatar||''}:null,
    resolveAssetUrl:async asset=>'https://media.example/'+asset.path,
    deleteMediaAsset:async()=>{},
    blockedBetween:()=>false
  };
};

test('StreamBay lists only published videos and resolves their Minglora-stored media', async()=>{
  const context=makeContext();
  const result=await handleStreamBayApi(context);
  assert.equal(result.status,200);
  assert.equal(result.body.videos.length,1);
  assert.equal(result.body.videos[0].media.url,'https://media.example/creator/video-1.mp4');
  assert.equal(result.body.videos[0].owner.id,owner.id);
  assert.equal(result.body.videos[0].likes,0);
});

test('StreamBay publishes a completed video asset owned by the signed-in Minglora user',async()=>{
  const context=makeContext();
  context.db.mediaAssets.push({id:'asset-2',ownerId:viewer.id,slot:'post',status:'uploaded',mediaType:'video',mimeType:'video/webm',byteSize:2048,bucket:'videos',path:'viewer/video-2.webm'});
  context.method='POST';context.path='/api/streambay/videos';
  context.input={assetId:'asset-2',title:'My new video',description:'First upload',category:'Music'};
  const result=await handleStreamBayApi(context);
  assert.equal(result.status,201);
  assert.equal(result.body.video.ownerId,viewer.id);
  assert.equal(context.db.mediaAssets.find(item=>item.id==='asset-2').status,'attached');
  assert.match(context.db.mediaAssets.find(item=>item.id==='asset-2').attachedTo,/^streambay:/);
  await assert.rejects(()=>handleStreamBayApi({...context,input:{assetId:'unknown',title:'Rejected video',category:'Music'}}),/completed video upload/);
});

test('StreamBay uses Minglora users for channel subscriptions, likes and comments',async()=>{
  const context=makeContext();
  context.method='POST';context.path='/api/streambay/channels/creator-1/subscribe';
  let result=await handleStreamBayApi(context);
  assert.equal(result.body.subscribed,true);
  context.method='GET';context.path='/api/streambay/videos';context.url=new URL('https://minglora.test/api/streambay/videos?sort=subscriptions');
  result=await handleStreamBayApi(context);
  assert.equal(result.body.videos.length,1);
  context.method='POST';context.path='/api/streambay/videos/video-1/like';
  result=await handleStreamBayApi(context);
  assert.equal(result.body.liked,true);
  context.path='/api/streambay/videos/video-1/comments';context.input={text:'Great video'};
  result=await handleStreamBayApi(context);
  assert.equal(result.status,201);
  assert.equal(result.body.comment.user.id,viewer.id);
});

test('StreamBay video edits and deletes require the owning Minglora account',async()=>{
  const context=makeContext();
  context.user=owner;
  context.method='PATCH';context.path='/api/streambay/videos/video-1';
  context.input={title:'Updated title',description:'Updated details',category:'Music'};
  const updated=await handleStreamBayApi(context);
  assert.equal(updated.status,200);
  assert.equal(updated.body.video.title,'Updated title');
  context.user={...viewer,id:'someone-else'};
  await assert.rejects(()=>handleStreamBayApi(context),error=>error.status===403);
  context.user=owner;
  context.method='DELETE';context.path='/api/streambay/videos/video-1';
  context.deleteMediaAsset=async()=>{};
  const deleted=await handleStreamBayApi(context);
  assert.equal(deleted.body.deleted,true);
  assert.equal(context.db.streambayVideos[0].status,'deleted');
  assert.equal(context.db.mediaAssets[0].status,'deleted');
});

test('StreamBay records account history and allows channel-specific profile settings',async()=>{
  const context=makeContext();
  context.path='/api/streambay/videos/video-1/view';
  const viewed=await handleStreamBayApi(context);
  assert.equal(viewed.body.video.views,3);
  context.path='/api/streambay/history';
  const history=await handleStreamBayApi(context);
  assert.equal(history.body.videos.length,1);
  context.method='PATCH';context.path='/api/streambay/channel';context.input={name:'Viewer Channel',bio:'My video home'};
  const edited=await handleStreamBayApi(context);
  assert.equal(edited.body.channel.name,'Viewer Channel');
  assert.equal(edited.body.channel.handle,viewer.username);
});

test('StreamBay enforces the same Minglora sign-in for account-only actions',async()=>{
  const context=makeContext();
  context.user=null;context.method='GET';context.path='/api/streambay/history';
  await assert.rejects(()=>handleStreamBayApi(context),error=>error.status===401);
});

test('StreamBay UI has six dedicated areas, Minglora session auth, and no second account store',async()=>{
  const [html,app,css,store,server]=await Promise.all([
    readFile(new URL('../../public/streambay/index.html',import.meta.url),'utf8'),
    readFile(new URL('../../public/streambay/app.js',import.meta.url),'utf8'),
    readFile(new URL('../../public/streambay/styles.css',import.meta.url),'utf8'),
    readFile(new URL('../../src/store.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/server.js',import.meta.url),'utf8')
  ]);
  for(const section of ['Home','Explore','Subscriptions','History','Your channel','Your videos'])assert.ok(html.includes(section),section+' navigation exists');
  assert.ok(app.includes("api('/api/auth/me')"));
  assert.ok(app.includes('Public discovery, channels and playback remain available without signing in.'));
  assert.ok(app.includes("['subscriptions','history','uploads','watch-later'].includes(state.route)"));
  assert.ok(!app.includes("if(!state.user){\n    $('#signInRequired').classList.remove('hidden');\n    $('#streambayContent').classList.add('hidden');\n    return;\n  }"));
  assert.ok(app.includes("api('/api/streambay/subscriptions')"));
  assert.ok(app.includes('data-subscription-channel'));
  assert.ok(html.includes('id="subscriptionChannels"'));
  assert.ok(!app.includes('streambay_token'));
  assert.ok(!app.includes('localStorage'));
  assert.ok(html.includes('/assets/icons/navigation-3d.svg'));
  assert.ok(css.includes('.sb-3d-icon'));
  assert.ok(store.includes("'streambayVideos'"));
  assert.ok(server.includes('handleStreamBayApi'));
});


test('StreamBay channel customization stores About details and attaches owned channel images',async()=>{
  const context=makeContext();context.user=owner;
  context.db.mediaAssets.push({id:'channel-avatar',ownerId:owner.id,slot:'post',status:'uploaded',mediaType:'image',mimeType:'image/webp',byteSize:1200,bucket:'images',path:'creator/channel.webp'});
  context.method='PATCH';context.path='/api/streambay/channel';
  context.input={name:'My Creator Channel',handle:'creator.channel',bio:'Short channel bio',about:'Full channel About information',location:'Kingston',links:['https://example.com'],avatarAssetId:'channel-avatar'};
  const result=await handleStreamBayApi(context);
  assert.equal(result.body.channel.name,'My Creator Channel');
  assert.equal(result.body.channel.handle,'creator.channel');
  assert.equal(result.body.channel.bio,'Short channel bio');
  assert.equal(result.body.channel.about,'Full channel About information');
  assert.equal(result.body.channel.location,'Kingston');
  assert.equal(result.body.channel.links[0].url,'https://example.com/');
  assert.equal(context.db.mediaAssets.find(item=>item.id==='channel-avatar').attachedTo,'streambay:channel:avatar');
  context.input={handle:'invalid handle'};
  await assert.rejects(()=>handleStreamBayApi(context),error=>error.status===400);
});

test('StreamBay supports custom thumbnails, Watch Later and private playlist controls',async()=>{
  const context=makeContext();context.user=owner;
  context.db.mediaAssets.push({id:'video-thumb',ownerId:owner.id,slot:'post',status:'uploaded',mediaType:'image',mimeType:'image/png',byteSize:1200,bucket:'images',path:'creator/thumb.png'});
  context.method='PATCH';context.path='/api/streambay/videos/video-1';context.input={thumbnailAssetId:'video-thumb'};
  let result=await handleStreamBayApi(context);
  assert.equal(result.body.video.thumbnailUrl,'https://media.example/creator/thumb.png');
  context.user=viewer;context.method='POST';context.path='/api/streambay/watch-later/video-1';
  result=await handleStreamBayApi(context);assert.equal(result.body.saved,true);
  context.method='GET';context.path='/api/streambay/watch-later';
  result=await handleStreamBayApi(context);assert.equal(result.body.videos.length,1);
  context.user=owner;context.method='POST';context.path='/api/streambay/playlists';context.input={title:'Private favourites',visibility:'private'};
  result=await handleStreamBayApi(context);const id=result.body.playlist.id;
  context.user=viewer;context.method='GET';context.path='/api/streambay/playlists/'+id;
  await assert.rejects(()=>handleStreamBayApi(context),error=>error.status===404);
  context.user=owner;context.method='POST';context.path='/api/streambay/playlists/'+id+'/videos';context.input={videoId:'video-1'};
  result=await handleStreamBayApi(context);assert.equal(result.body.videoCount,1);
});


test('StreamBay channel discovery searches creator names and handles',async()=>{
  const context=makeContext();context.db.streambayChannels.push({userId:owner.id,name:'Caribbean Learning',handle:'caribbean.creator'});
  context.method='GET';context.path='/api/streambay/channels';
  context.url=new URL('https://minglora.test/api/streambay/channels?q=caribbean');
  const result=await handleStreamBayApi(context);
  assert.equal(result.status,200);
  assert.equal(result.body.channels.length,1);
  assert.equal(result.body.channels[0].id,owner.id);
  assert.equal(result.body.channels[0].handle,'caribbean.creator');
  assert.equal(result.body.channels[0].videoCount,1);
  assert.equal(result.body.total,1);
});

test('StreamBay exposes a paginated subscriber list using public Minglora member profiles',async()=>{
  const context=makeContext();
  context.db.streambaySubscriptions.push({id:'sub-1',creatorId:owner.id,subscriberId:viewer.id,createdAt:'2026-11-01T10:00:00.000Z'});
  context.method='GET';context.path='/api/streambay/channels/'+owner.id+'/subscribers';
  context.url=new URL('https://minglora.test'+context.path+'?offset=0&limit=1');
  const result=await handleStreamBayApi(context);
  assert.equal(result.status,200);
  assert.equal(result.body.total,1);
  assert.equal(result.body.subscribers.length,1);
  assert.equal(result.body.subscribers[0].id,viewer.id);
  assert.equal(result.body.subscribers[0].username,viewer.username);
  assert.equal(result.body.hasMore,false);
});

test('StreamBay does not expose blocked members in a creator subscriber list',async()=>{
  const context=makeContext();
  context.db.streambaySubscriptions.push({id:'sub-1',creatorId:owner.id,subscriberId:viewer.id,createdAt:'2026-11-01T10:00:00.000Z'});
  context.user=null;
  context.blockedBetween=(a,b)=>(a===owner.id&&b===viewer.id)||(a===viewer.id&&b===owner.id);
  context.method='GET';context.path='/api/streambay/channels/'+owner.id+'/subscribers';
  context.url=new URL('https://minglora.test'+context.path);
  const result=await handleStreamBayApi(context);
  assert.equal(result.body.total,0);
  assert.equal(result.body.subscribers.length,0);
});

test('StreamBay channel pages use navigable Videos, About and Subscribers tabs and searchable creator cards',async()=>{
  const [app,html,css]=await Promise.all([
    readFile(new URL('../../public/streambay/app.js',import.meta.url),'utf8'),
    readFile(new URL('../../public/streambay/index.html',import.meta.url),'utf8'),
    readFile(new URL('../../public/streambay/styles.css',import.meta.url),'utf8')
  ]);
  assert.ok(app.includes("openChannel(decodeURIComponent(parts[1]||'me'),parts[2]||'videos')"));
  assert.ok(app.includes("'/subscribers?offset='"));
  assert.ok(app.includes("api('/api/streambay/channels?q="));
  assert.ok(app.includes("role=\"tablist\""));
  assert.ok(app.includes('aria-selected='));
  assert.ok(app.includes('Discover creators'));
  assert.ok(html.includes('id="creatorDiscovery"'));
  assert.ok(css.includes('.channel-identity{'));
  assert.ok(css.includes('.channel-tabs a.active:after'));
  assert.ok(css.includes('.subscriber-grid{'));
});
