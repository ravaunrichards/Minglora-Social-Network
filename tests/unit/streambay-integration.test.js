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
    streambayComments:[],streambaySubscriptions:[],streambayLikes:[],streambayHistory:[],streambayChannels:[]
  };
  let sequence=0;
  return {
    db, method:'GET', path:'/api/streambay/videos', url:new URL('https://minglora.test/api/streambay/videos'),
    input:{}, user:viewer, saveStore:async()=>{}, uid:()=>'id-'+(++sequence),
    now:()=> '2026-11-01T12:00:00.000Z',
    requireAuth:user=>{if(!user)throw Object.assign(new Error('Sign in to continue.'),{status:401});},
    safeUser:user=>user?{id:user.id,name:user.name,username:user.username,avatar:user.avatar||''}:null,
    resolveAssetUrl:async asset=>'https://media.example/'+asset.path,
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
  assert.ok(!app.includes('streambay_token'));
  assert.ok(!app.includes('localStorage'));
  assert.ok(html.includes('/assets/icons/navigation-3d.svg'));
  assert.ok(css.includes('.sb-3d-icon'));
  assert.ok(store.includes("'streambayVideos'"));
  assert.ok(server.includes('handleStreamBayApi'));
});
