import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=3147;
const dataDir=path.join(os.tmpdir(),'minglora-video-channels-'+randomUUID());
let server;

async function request(cookie,url,options={}){
  const response=await fetch('http://127.0.0.1:'+port+url,{
    ...options,
    headers:{
      ...(options.body?{'Content-Type':'application/json'}:{}),
      ...(cookie?{Cookie:cookie}:{}),
      ...(options.headers||{})
    }
  });
  return {status:response.status,body:await response.json().catch(()=>({}))};
}
async function startServer(){
  server=spawn(process.execPath,['src/server.js'],{
    cwd:root,
    env:{
      ...process.env,PORT:String(port),NODE_ENV:'test',AUTH_PROVIDER:'legacy',
      PERSISTENCE_DRIVER:'json',DATA_DIR:dataDir,
      SESSION_SECRET:'video-channel-test-secret-with-sufficient-entropy-and-length',
      APP_ORIGIN:'http://127.0.0.1:'+port,TENOR_API_KEY:''
    },
    stdio:'ignore'
  });
  let health;
  for(let attempt=0;attempt<60;attempt++){
    try{
      health=await request('','/api/health');
      if(health.status===200)return;
    }catch{}
    await delay(100);
  }
  throw new Error('Minglora test server did not start.');
}
async function stopServer(){
  if(!server||server.exitCode!==null)return;
  await new Promise(resolve=>{
    server.once('exit',resolve);
    server.kill('SIGTERM');
  });
}
async function createAccount({name,username,email}){
  const result=await request('','/api/auth/register',{
    method:'POST',
    body:JSON.stringify({name,username,email,password:'ChannelPassword123!'})
  });
  assert.equal(result.status,201,JSON.stringify(result.body));
  const login=await fetch('http://127.0.0.1:'+port+'/api/auth/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password:'ChannelPassword123!'})
  });
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0]||'';
  assert.ok(cookie);
  return {user:result.body.user,cookie};
}
function videoAsset(id,ownerId,url){
  return {id,ownerId,slot:'post',bucket:'test',path:'videos/'+id+'.mp4',mimeType:'video/mp4',mediaType:'video',byteSize:4096,status:'attached',url,createdAt:new Date().toISOString()};
}
function videoPost(id,ownerId,assetId,audience='public'){
  return {id,userId:ownerId,text:'Real channel upload '+id,mediaIds:[assetId],audience,status:'published',createdAt:new Date().toISOString(),reactions:{},comments:[]};
}

test('creator channels support real videos, privacy, subscriptions and cross-device persistence',async t=>{
  fs.rmSync(dataDir,{recursive:true,force:true});
  t.after(async()=>{
    await stopServer();
    fs.rmSync(dataDir,{recursive:true,force:true});
  });
  await startServer();

  const publicOwner=await createAccount({name:'Public Video Creator',username:'publiccreator',email:'public-channel@example.test'});
  const unlistedOwner=await createAccount({name:'Unlisted Video Creator',username:'unlistedcreator',email:'unlisted-channel@example.test'});
  const privateOwner=await createAccount({name:'Private Video Creator',username:'privatecreator',email:'private-channel@example.test'});
  const viewer=await createAccount({name:'Channel Viewer',username:'channelviewer',email:'channel-viewer@example.test'});

  const publicChannel=await request(publicOwner.cookie,'/api/video-channels/me',{
    method:'PATCH',body:JSON.stringify({title:'Public Creator Channel',description:'Public video releases',visibility:'public'})
  });
  assert.equal(publicChannel.status,200,JSON.stringify(publicChannel.body));
  const unlistedChannel=await request(unlistedOwner.cookie,'/api/video-channels/me',{
    method:'PATCH',body:JSON.stringify({title:'Unlisted Creator Channel',description:'Share by link',visibility:'unlisted'})
  });
  assert.equal(unlistedChannel.status,200);
  const privateChannel=await request(privateOwner.cookie,'/api/video-channels/me',{
    method:'PATCH',body:JSON.stringify({title:'Private Creator Channel',visibility:'private'})
  });
  assert.equal(privateChannel.status,200);

  const invalidChannel=await request(publicOwner.cookie,'/api/video-channels/me',{
    method:'PATCH',body:JSON.stringify({title:'',visibility:'public'})
  });
  assert.equal(invalidChannel.status,400);
  const selfSubscription=await request(publicOwner.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id)+'/subscribe',{method:'POST'});
  assert.equal(selfSubscription.status,400);

  const statePath=path.join(dataDir,'db.json');
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  state.mediaAssets.push(
    videoAsset('public-video-1',publicOwner.user.id,'https://media.example.test/public-video-1.mp4'),
    videoAsset('private-video-1',publicOwner.user.id,'https://media.example.test/private-video-1.mp4'),
    videoAsset('unlisted-video-1',unlistedOwner.user.id,'https://media.example.test/unlisted-video-1.mp4'),
    videoAsset('private-channel-video-1',privateOwner.user.id,'https://media.example.test/private-channel-video-1.mp4')
  );
  state.posts.push(
    videoPost('public-post-1',publicOwner.user.id,'public-video-1','public'),
    videoPost('private-post-1',publicOwner.user.id,'private-video-1','private'),
    videoPost('unlisted-post-1',unlistedOwner.user.id,'unlisted-video-1','public'),
    videoPost('private-channel-post-1',privateOwner.user.id,'private-channel-video-1','public')
  );
  fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
  await stopServer();
  await startServer();

  // A subscription is stored independently from profile follows and survives a second process restart.
  const subscribed=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id)+'/subscribe',{method:'POST'});
  assert.equal(subscribed.status,201,JSON.stringify(subscribed.body));
  const duplicate=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id)+'/subscribe',{method:'POST'});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.body.alreadySubscribed,true);
  const stateAfterSubscribe=JSON.parse(fs.readFileSync(statePath,'utf8'));
  assert.deepEqual(stateAfterSubscribe.follows,[]);
  assert.deepEqual(stateAfterSubscribe.creatorSubscriptions,[]);

  await stopServer();
  await startServer();

  const directory=await request(viewer.cookie,'/api/video-channels');
  assert.equal(directory.status,200);
  assert.deepEqual(directory.body.channels.map(channel=>channel.ownerId),[publicOwner.user.id]);
  assert.equal(directory.body.channels[0].title,'Public Creator Channel');
  assert.equal(directory.body.channels[0].isSubscribed,true);
  assert.equal(directory.body.channels[0].videoCount,1);

  const search=await request(viewer.cookie,'/api/video-channels?q=Public%20Creator');
  assert.equal(search.body.channels.length,1);
  assert.equal(search.body.channels[0].ownerId,publicOwner.user.id);

  const detail=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id));
  assert.equal(detail.status,200);
  assert.equal(detail.body.channel.videos.length,1);
  assert.equal(detail.body.channel.videos[0].id,'public-post-1');
  assert.equal(detail.body.channel.subscriberCount,1);

  const unlistedDirect=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(unlistedOwner.user.id));
  assert.equal(unlistedDirect.status,200);
  assert.equal(unlistedDirect.body.channel.videos.length,1);
  assert.equal((await request(viewer.cookie,'/api/video-channels')).body.channels.some(channel=>channel.ownerId===unlistedOwner.user.id),false);

  const privateDirect=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(privateOwner.user.id));
  assert.equal(privateDirect.status,404);
  assert.equal((await request(viewer.cookie,'/api/video-channels')).body.channels.some(channel=>channel.ownerId===privateOwner.user.id),false);

  const subscriptions=await request(viewer.cookie,'/api/video-channels/subscriptions');
  assert.equal(subscriptions.status,200);
  assert.deepEqual(subscriptions.body.channels.map(channel=>channel.ownerId),[publicOwner.user.id]);
  assert.equal(subscriptions.body.videos.length,1);
  assert.equal(subscriptions.body.videos[0].id,'public-post-1');
  assert.equal(subscriptions.body.videos[0].channel.title,'Public Creator Channel');

  const channelUpdate=await request(publicOwner.cookie,'/api/video-channels/me/posts',{
    method:'POST',body:JSON.stringify({title:'Creator update',body:'New release is available.'})
  });
  assert.equal(channelUpdate.status,201,JSON.stringify(channelUpdate.body));
  const updateId=channelUpdate.body.post.id;
  const subscriberAnnouncements=await request(viewer.cookie,'/api/video-channels/subscriptions');
  assert.equal(subscriberAnnouncements.status,200);
  assert.equal(subscriberAnnouncements.body.announcements.length,1);
  assert.equal(subscriberAnnouncements.body.announcements[0].id,updateId);
  assert.equal(subscriberAnnouncements.body.announcements[0].body,'New release is available.');

  const nonOwnerEdit=await request(viewer.cookie,'/api/video-channel-posts/'+encodeURIComponent(updateId),{
    method:'PATCH',body:JSON.stringify({body:'Unauthorized edit'})
  });
  assert.equal(nonOwnerEdit.status,404);
  const channelUpdateEdit=await request(publicOwner.cookie,'/api/video-channel-posts/'+encodeURIComponent(updateId),{
    method:'PATCH',body:JSON.stringify({title:'Updated creator update',body:'Edited announcement.'})
  });
  assert.equal(channelUpdateEdit.status,200);
  const editedAnnouncement=await request(viewer.cookie,'/api/video-channels/subscriptions');
  assert.equal(editedAnnouncement.body.announcements[0].title,'Updated creator update');
  assert.equal(editedAnnouncement.body.announcements[0].body,'Edited announcement.');

  await stopServer();
  await startServer();
  const persistedAnnouncement=await request(viewer.cookie,'/api/video-channels/subscriptions');
  assert.equal(persistedAnnouncement.body.announcements[0].id,updateId);
  assert.equal(persistedAnnouncement.body.announcements[0].body,'Edited announcement.');

  const deletedUpdate=await request(publicOwner.cookie,'/api/video-channel-posts/'+encodeURIComponent(updateId),{method:'DELETE'});
  assert.equal(deletedUpdate.status,200);
  const afterDelete=await request(viewer.cookie,'/api/video-channels/subscriptions');
  assert.equal(afterDelete.body.announcements.some(item=>item.id===updateId),false);

  const channelEdit=await request(publicOwner.cookie,'/api/video-channels/me',{
    method:'PATCH',body:JSON.stringify({title:'Updated Public Channel',description:'Saved on Minglora'})
  });
  assert.equal(channelEdit.status,200);
  const updated=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id));
  assert.equal(updated.body.channel.title,'Updated Public Channel');

  const unsubscribed=await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id)+'/subscribe',{method:'DELETE'});
  assert.equal(unsubscribed.status,200);
  assert.deepEqual((await request(viewer.cookie,'/api/video-channels/subscriptions')).body.channels,[]);

  // Blocking the creator immediately hides the channel, its videos and subscription listing.
  const blocked=await request(viewer.cookie,'/api/users/'+encodeURIComponent(publicOwner.user.id)+'/block',{method:'POST'});
  assert.equal(blocked.status,200);
  assert.equal((await request(viewer.cookie,'/api/video-channels/'+encodeURIComponent(publicOwner.user.id))).status,404);
  assert.equal((await request(viewer.cookie,'/api/video-channels')).body.channels.length,0);
});
