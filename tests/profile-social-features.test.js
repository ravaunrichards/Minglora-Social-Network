import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const dataDir=path.join(os.tmpdir(),'minglora-profile-features-'+randomUUID());
let port=0;
let server=null;
async function reservePort(){
  const listener=net.createServer();
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const value=listener.address().port;await new Promise(resolve=>listener.close(resolve));return value;
}
async function startServer(){
  server=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'test',PERSISTENCE_DRIVER:'json',DATA_DIR:dataDir,SESSION_SECRET:'profile-feature-test-secret-with-sufficient-entropy',TENOR_API_KEY:''},stdio:'ignore'});
  for(let attempt=0;attempt<80;attempt+=1){try{const response=await fetch('http://127.0.0.1:'+port+'/api/health');if(response.status===200)return;}catch{}await delay(75);}
  throw new Error('Minglora test API did not become ready.');
}
async function stopServer(){
  if(!server)return;const child=server;server=null;if(child.exitCode!==null)return;
  await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},2500);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
}
async function request(cookie,url,options={}){
  const response=await fetch('http://127.0.0.1:'+port+url,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(options.headers||{})}});
  let body={};try{body=await response.json();}catch{}
  return {status:response.status,body,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie};
}
async function register(name,username,email){
  const result=await request('', '/api/auth/register',{method:'POST',body:JSON.stringify({name,username,email,password:'ProfileTestPass123!'})});
  assert.equal(result.status,201,JSON.stringify(result.body));return {id:result.body.user.id,cookie:result.cookie};
}

test('profile status, check-ins, events, Highlights, archives, activity and section settings work end-to-end',async t=>{
  fs.rmSync(dataDir,{recursive:true,force:true});port=await reservePort();await startServer();
  t.after(async()=>{await stopServer();fs.rmSync(dataDir,{recursive:true,force:true});});
  const alice=await register('Minglora Profile Owner','profileowner','profile-owner@example.test');
  const bob=await register('Minglora Profile Viewer','profileviewer','profile-viewer@example.test');

  const sections=await request(alice.cookie,'/api/profile-sections',{method:'PATCH',body:JSON.stringify({sections:{about:false,checkIns:false,events:true,highlights:true}})});
  assert.equal(sections.status,200,JSON.stringify(sections.body));assert.equal(sections.body.sections.about,false);assert.equal(sections.body.sections.checkIns,false);
  assert.equal((await request(alice.cookie,'/api/users/'+alice.id+'/profile-sections')).body.sections.about,false);

  const status=await request(alice.cookie,'/api/profile-status',{method:'POST',body:JSON.stringify({text:'Building on Minglora',mood:'Focused',audience:'followers',expiresInHours:24})});
  assert.equal(status.status,201,JSON.stringify(status.body));assert.equal(status.body.status.text,'Building on Minglora');
  assert.equal((await request(bob.cookie,'/api/users/'+alice.id+'/profile-status')).body.status,null);
  assert.equal((await request(alice.cookie,'/api/users/'+alice.id+'/profile-status')).body.status.text,'Building on Minglora');

  const checkIn=await request(alice.cookie,'/api/check-ins',{method:'POST',body:JSON.stringify({place:'Spanish Town',note:'Profile feature integration test',visibility:'followers'})});
  assert.equal(checkIn.status,201,JSON.stringify(checkIn.body));assert.equal((await request(bob.cookie,'/api/users/'+alice.id+'/check-ins')).body.checkIns.length,0);
  assert.equal((await request(bob.cookie,'/api/users/'+alice.id+'/follow',{method:'POST',body:'{}'})).status,200);
  assert.equal((await request(bob.cookie,'/api/users/'+alice.id+'/check-ins')).body.checkIns.length,1);

  const event=await request(alice.cookie,'/api/events',{method:'POST',body:JSON.stringify({title:'Minglora Community Night',description:'Profile API integration check',location:'Spanish Town',startAt:new Date(Date.now()+86400000).toISOString(),visibility:'public'})});
  assert.equal(event.status,201,JSON.stringify(event.body));assert.equal((await request(alice.cookie,'/api/users/'+alice.id+'/events')).body.events.length,1);
  assert.equal((await request(bob.cookie,'/api/events/'+event.body.event.id+'/rsvp',{method:'POST',body:JSON.stringify({status:'interested'})})).status,200);

  const story=await request(alice.cookie,'/api/stories',{method:'POST',body:JSON.stringify({text:'A saved Minglora profile story',audience:'public'})});
  assert.equal(story.status,201,JSON.stringify(story.body));
  const highlight=await request(alice.cookie,'/api/highlights',{method:'POST',body:JSON.stringify({title:'Community moments',storyIds:[story.body.story.id]})});
  assert.equal(highlight.status,201,JSON.stringify(highlight.body));
  assert.equal((await request(alice.cookie,'/api/users/'+alice.id+'/highlights')).body.highlights[0].title,'Community moments');

  const post=await request(alice.cookie,'/api/posts',{method:'POST',body:JSON.stringify({text:'This post will be archived and restored.'})});
  assert.equal(post.status,201,JSON.stringify(post.body));
  assert.equal((await request(alice.cookie,'/api/profile/archive',{method:'POST',body:JSON.stringify({postId:post.body.post.id})})).status,200);
  assert.equal((await request(alice.cookie,'/api/profile/archive')).body.posts.length,1);
  assert.equal((await request(alice.cookie,'/api/feed')).body.posts.some(item=>item.id===post.body.post.id),false);
  assert.equal((await request(alice.cookie,'/api/profile/archive/'+post.body.post.id,{method:'DELETE',body:'{}'})).status,200);
  assert.equal((await request(alice.cookie,'/api/feed')).body.posts.some(item=>item.id===post.body.post.id),true);

  const activity=await request(alice.cookie,'/api/users/'+alice.id+'/activity');
  assert.equal(activity.status,200);assert.ok(activity.body.activity.some(item=>item.action==='profile_status_updated'));
  assert.ok(activity.body.activity.some(item=>item.action==='check_in_created'));assert.ok(activity.body.activity.some(item=>item.action==='event_created'));

  assert.equal((await request(bob.cookie,'/api/users/'+alice.id+'/block',{method:'POST',body:'{}'})).status,200);
  const blockedRsvp=await request(bob.cookie,'/api/events/'+event.body.event.id+'/rsvp',{method:'POST',body:JSON.stringify({status:'going'})});
  assert.equal(blockedRsvp.status,404,'Blocked members cannot view or RSVP to a public event.');
  assert.equal((await request(bob.cookie,'/api/users/'+alice.id+'/profile-status')).status,404);

  await stopServer();
  const dbPath=path.join(dataDir,'db.json'),persisted=JSON.parse(fs.readFileSync(dbPath,'utf8'));
  const savedStory=persisted.stories.find(item=>item.id===story.body.story.id);assert.ok(savedStory);
  savedStory.expiresAt=new Date(Date.now()-1000).toISOString();fs.writeFileSync(dbPath,JSON.stringify(persisted,null,2));
  await startServer();
  const archive=await request(alice.cookie,'/api/users/'+alice.id+'/story-archive');
  assert.equal(archive.status,200,JSON.stringify(archive.body));
  assert.equal(archive.body.stories.some(item=>item.id===story.body.story.id),true,'expired Stories are retained in the private Story archive');
  const afterExpiry=await request(alice.cookie,'/api/users/'+alice.id+'/highlights');
  assert.equal(afterExpiry.body.highlights.some(item=>item.title==='Community moments'),true,'Highlights continue to resolve archived Stories');
});
