import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=3137;
const dbPath=path.join(root,'data','db.json');
let server;
let cookie='';
async function request(url, options={}) {const res=await fetch(`http://127.0.0.1:${port}${url}`,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(options.headers||{})}});const sc=res.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let body={};try{body=await res.json()}catch{}return {status:res.status,body};}
test('API supports health, authentication, feed, posting, reactions, and groups',async t=>{
  fs.rmSync(dbPath,{force:true});
  server=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,PORT:String(port),SESSION_SECRET:'test-secret-with-enough-entropy'},stdio:'ignore'});
  t.after(()=>{server?.kill('SIGTERM');fs.rmSync(dbPath,{force:true});});
  let health;for(let i=0;i<40;i++){try{health=await request('/api/health');if(health.status===200)break}catch{}await delay(100)}
  assert.equal(health.status,200);assert.equal(health.body.ok,true);
  let login=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'demo@example.com',password:'DemoPass123!'})});
  assert.equal(login.status,200);assert.equal(login.body.user.username,'alexmorgan');
  let feed=await request('/api/feed');assert.equal(feed.status,200);assert.ok(feed.body.posts.length>=1);
  let post=await request('/api/posts',{method:'POST',body:JSON.stringify({text:'Test post from automated suite'})});assert.equal(post.status,201);assert.equal(post.body.post.text,'Test post from automated suite');
  let reaction=await request(`/api/posts/${post.body.post.id}/reactions`,{method:'POST',body:JSON.stringify({reaction:'like'})});assert.equal(reaction.status,200);assert.equal(reaction.body.post.myReaction,'like');
  let comment=await request(`/api/posts/${post.body.post.id}/comments`,{method:'POST',body:JSON.stringify({text:'Nice update'})});assert.equal(comment.status,201);assert.equal(comment.body.comment.text,'Nice update');
  let group=await request('/api/groups',{method:'POST',body:JSON.stringify({name:'Test Community',description:'A test group'})});assert.equal(group.status,201);assert.equal(group.body.group.name,'Test Community');
  const loggedOut=await request('/api/auth/logout',{method:'POST',body:'{}'});assert.equal(loggedOut.status,200);
  const protectedRoute=await request('/api/feed');assert.equal(protectedRoute.status,401);
});
