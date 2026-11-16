import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=3148;
const dataDir=path.join(os.tmpdir(),'minglora-video-remix-'+randomUUID());
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
      SESSION_SECRET:'video-remix-test-secret-with-sufficient-entropy-and-length',
      APP_ORIGIN:'http://127.0.0.1:'+port,TENOR_API_KEY:''
    },
    stdio:'ignore'
  });
  for(let attempt=0;attempt<60;attempt++){
    try{
      const health=await request('','/api/health');
      if(health.status===200)return;
    }catch{}
    await delay(100);
  }
  throw new Error('Minglora remix integration test server did not start.');
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
    body:JSON.stringify({name,username,email,password:'RemixPassword123!'})
  });
  assert.equal(result.status,201,JSON.stringify(result.body));
  const login=await fetch('http://127.0.0.1:'+port+'/api/auth/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password:'RemixPassword123!'})
  });
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0]||'';
  assert.ok(cookie);
  return {user:result.body.user,cookie};
}
function videoAsset(id,ownerId,status,url){
  return {id,ownerId,slot:'post',bucket:'test',path:'videos/'+id+'.mp4',mimeType:'video/mp4',mediaType:'video',byteSize:4096,status,url,createdAt:new Date().toISOString()};
}
function videoPost(id,ownerId,assetId){
  return {id,userId:ownerId,text:'Original creator video',mediaIds:[assetId],videoFormat:'reel',remixPolicy:'off',audience:'public',status:'published',createdAt:new Date().toISOString(),reactions:{},comments:[]};
}

test('video remix respects creator policy and preserves the source; collaboration requires mutual friendship and consent',async t=>{
  fs.rmSync(dataDir,{recursive:true,force:true});
  t.after(async()=>{
    await stopServer();
    fs.rmSync(dataDir,{recursive:true,force:true});
  });
  await startServer();
  const owner=await createAccount({name:'Original Creator',username:'originalcreator',email:'original-creator@example.test'});
  const friend=await createAccount({name:'Creator Friend',username:'creatorfriend',email:'creator-friend@example.test'});
  const remixer=await createAccount({name:'Video Remixer',username:'videoremixer',email:'video-remixer@example.test'});
  const stranger=await createAccount({name:'Outside Viewer',username:'outsideviewer',email:'outside-viewer@example.test'});

  const statePath=path.join(dataDir,'db.json');
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  state.mediaAssets||=[];
  state.posts||=[];
  state.follows||=[];
  state.mediaAssets.push(
    videoAsset('original-video',owner.user.id,'attached','https://media.example.test/original.mp4'),
    videoAsset('friend-remix-clip',friend.user.id,'uploaded','https://media.example.test/friend-remix.mp4'),
    videoAsset('remixer-clip',remixer.user.id,'uploaded','https://media.example.test/remixer.mp4')
  );
  state.posts.push(videoPost('original-video-post',owner.user.id,'original-video'));
  state.follows.push(
    {followerId:owner.user.id,followedId:friend.user.id},
    {followerId:friend.user.id,followedId:owner.user.id}
  );
  fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
  await stopServer();
  await startServer();

  const deniedRemix=await request(remixer.cookie,'/api/posts',{
    method:'POST',
    body:JSON.stringify({text:'My new edit',mediaIds:['remixer-clip'],videoFormat:'reel',remixOfPostId:'original-video-post'})
  });
  assert.equal(deniedRemix.status,403);
  let afterDenied=JSON.parse(fs.readFileSync(statePath,'utf8'));
  assert.equal(afterDenied.mediaAssets.find(asset=>asset.id==='remixer-clip').status,'uploaded');

  const nonOwnerSettings=await request(friend.cookie,'/api/posts/original-video-post/remix-settings',{
    method:'PATCH',body:JSON.stringify({policy:'everyone'})
  });
  assert.equal(nonOwnerSettings.status,403);
  const invalidPolicy=await request(owner.cookie,'/api/posts/original-video-post/remix-settings',{
    method:'PATCH',body:JSON.stringify({policy:'anyone'})
  });
  assert.equal(invalidPolicy.status,400);
  const allowRemix=await request(owner.cookie,'/api/posts/original-video-post/remix-settings',{
    method:'PATCH',body:JSON.stringify({policy:'everyone'})
  });
  assert.equal(allowRemix.status,200);
  assert.equal(allowRemix.body.remixPolicy,'everyone');

  const createdRemix=await request(remixer.cookie,'/api/posts',{
    method:'POST',
    body:JSON.stringify({text:'My original take',mediaIds:['remixer-clip'],videoFormat:'reel',remixOfPostId:'original-video-post'})
  });
  assert.equal(createdRemix.status,201,JSON.stringify(createdRemix.body));
  assert.equal(createdRemix.body.post.remixOfPostId,'original-video-post');
  assert.equal(createdRemix.body.post.remixSource.author.username,'originalcreator');
  const afterRemix=JSON.parse(fs.readFileSync(statePath,'utf8'));
  const originalAsset=afterRemix.mediaAssets.find(asset=>asset.id==='original-video');
  assert.equal(originalAsset.status,'attached');
  assert.equal(originalAsset.path,'videos/original-video.mp4');
  assert.equal(originalAsset.transcodedAssetId,undefined);
  assert.equal(afterRemix.mediaAssets.find(asset=>asset.id==='remixer-clip').status,'attached');

  const nonFriendInvite=await request(owner.cookie,'/api/posts/original-video-post/collaborators',{
    method:'POST',body:JSON.stringify({username:'outsideviewer'})
  });
  assert.equal(nonFriendInvite.status,403);
  const ownerInvite=await request(owner.cookie,'/api/posts/original-video-post/collaborators',{
    method:'POST',body:JSON.stringify({username:'@creatorfriend'})
  });
  assert.equal(ownerInvite.status,201,JSON.stringify(ownerInvite.body));
  const duplicateInvite=await request(owner.cookie,'/api/posts/original-video-post/collaborators',{
    method:'POST',body:JSON.stringify({username:'creatorfriend'})
  });
  assert.equal(duplicateInvite.status,200);
  assert.equal(duplicateInvite.body.alreadyInvited,true);

  const pending=await request(friend.cookie,'/api/video-collaborations/invitations');
  assert.equal(pending.status,200);
  assert.equal(pending.body.invitations.length,1);
  assert.equal(pending.body.invitations[0].postId,'original-video-post');

  const strangerResponse=await request(stranger.cookie,'/api/video-collaborations/invitations/'+encodeURIComponent(ownerInvite.body.inviteId)+'/respond',{
    method:'POST',body:JSON.stringify({response:'accept'})
  });
  assert.equal(strangerResponse.status,404);
  const accepted=await request(friend.cookie,'/api/video-collaborations/invitations/'+encodeURIComponent(ownerInvite.body.inviteId)+'/respond',{
    method:'POST',body:JSON.stringify({response:'accept'})
  });
  assert.equal(accepted.status,200);
  assert.equal(accepted.body.status,'accepted');
  const duplicateResponse=await request(friend.cookie,'/api/video-collaborations/invitations/'+encodeURIComponent(ownerInvite.body.inviteId)+'/respond',{
    method:'POST',body:JSON.stringify({response:'decline'})
  });
  assert.equal(duplicateResponse.status,409);
  const pendingAfterAccept=await request(friend.cookie,'/api/video-collaborations/invitations');
  assert.deepEqual(pendingAfterAccept.body.invitations,[]);
  const publicChannel=await request(friend.cookie,'/api/video-channels/'+encodeURIComponent(owner.user.id));
  assert.equal(publicChannel.status,200,JSON.stringify(publicChannel.body));
  assert.equal(publicChannel.body.channel.videos.find(video=>video.id==='original-video-post').collaborators[0].username,'creatorfriend');

  const finalState=JSON.parse(fs.readFileSync(statePath,'utf8'));
  assert.equal(finalState.videoCollaborationInvites[0].status,'accepted');
  assert.equal(finalState.videoCollaborationInvites[0].ownerId,owner.user.id);
  assert.equal(finalState.videoCollaborationInvites[0].collaboratorId,friend.user.id);
  assert.equal(finalState.mediaAssets.find(asset=>asset.id==='original-video').status,'attached');
});
