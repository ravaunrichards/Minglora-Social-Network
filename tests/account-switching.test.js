import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const root=path.resolve(new URL('..',import.meta.url).pathname);

async function unusedPort(){
  const listener=net.createServer();
  await new Promise((resolve,reject)=>listener.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  return port;
}

function deviceClient(baseUrl){
  const jar=new Map();
  return async function request(route,options={}){
    const headers=new Headers(options.headers||{});
    if(jar.size)headers.set('Cookie',[...jar].map(([name,value])=>name+'='+value).join('; '));
    if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    const response=await fetch(baseUrl+route,{...options,headers});
    const setCookies=typeof response.headers.getSetCookie==='function'
      ?response.headers.getSetCookie()
      :[response.headers.get('set-cookie')].filter(Boolean);
    for(const header of setCookies){
      const first=String(header).split(';',1)[0];
      const separator=first.indexOf('=');
      if(separator<1)continue;
      const name=first.slice(0,separator),value=first.slice(separator+1);
      if(/(?:^|;)\s*Max-Age=0(?:;|$)/i.test(header))jar.delete(name);
      else jar.set(name,value);
    }
    let body={};
    try{body=await response.json();}catch{}
    return {status:response.status,body,headers:response.headers};
  };
}

async function register(client,{name,username,email,password}){
  const result=await client('/api/auth/register',{
    method:'POST',
    body:JSON.stringify({name,username,email,password})
  });
  assert.equal(result.status,201,JSON.stringify(result.body));
  assert.ok(result.body.user?.id);
  return result.body.user;
}

test('Minglora switches between saved accounts without revoking other device sessions',async t=>{
  const port=await unusedPort();
  const dataDir=path.join(os.tmpdir(),'minglora-account-switch-'+randomUUID());
  fs.rmSync(dataDir,{recursive:true,force:true});
  const server=spawn(process.execPath,['src/server.js'],{
    cwd:root,
    env:{
      ...process.env,
      PORT:String(port),
      NODE_ENV:'test',
      AUTH_PROVIDER:'legacy',
      PERSISTENCE_DRIVER:'json',
      DATA_DIR:dataDir,
      SESSION_SECRET:'account-switch-test-secret-with-at-least-thirty-two-characters',
      APP_ORIGIN:'http://127.0.0.1:'+port,
      TENOR_API_KEY:''
    },
    stdio:'ignore'
  });
  const baseUrl='http://127.0.0.1:'+port;
  t.after(()=>{
    server.kill('SIGTERM');
    fs.rmSync(dataDir,{recursive:true,force:true});
  });

  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    try{
      const response=await fetch(baseUrl+'/api/health');
      if(response.ok){ready=true;break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true,'Minglora API should start for isolated account-switch tests');

  const firstDevice=deviceClient(baseUrl);
  const secondDevice=deviceClient(baseUrl);
  const first=await register(firstDevice,{
    name:'Account One',username:'switch_account_one',email:'switch-one@example.test',password:'FirstTestPassword123!'
  });
  const second=await register(secondDevice,{
    name:'Account Two',username:'switch_account_two',email:'switch-two@example.test',password:'SecondTestPassword123!'
  });

  const firstDeviceAccounts=await firstDevice('/api/auth/accounts');
  assert.equal(firstDeviceAccounts.status,200);
  assert.deepEqual(firstDeviceAccounts.body.accounts.map(item=>item.user.id),[first.id]);

  const addSecond=await firstDevice('/api/auth/login',{
    method:'POST',
    body:JSON.stringify({email:'switch-two@example.test',password:'SecondTestPassword123!'})
  });
  assert.equal(addSecond.status,200,JSON.stringify(addSecond.body));
  assert.equal(addSecond.body.user.id,second.id);

  const savedAccounts=await firstDevice('/api/auth/accounts');
  assert.equal(savedAccounts.status,200);
  assert.equal(savedAccounts.body.accounts.length,2);
  const secondOnFirstDevice=savedAccounts.body.accounts.find(item=>item.user.id===second.id);
  const firstOnFirstDevice=savedAccounts.body.accounts.find(item=>item.user.id===first.id);
  assert.ok(secondOnFirstDevice?.sessionId);
  assert.ok(firstOnFirstDevice?.sessionId);
  assert.equal(secondOnFirstDevice.active,true);
  assert.equal(firstOnFirstDevice.active,false);

  const switchToFirst=await firstDevice('/api/auth/switch',{
    method:'POST',body:JSON.stringify({sessionId:firstOnFirstDevice.sessionId})
  });
  assert.equal(switchToFirst.status,200,JSON.stringify(switchToFirst.body));
  assert.equal((await firstDevice('/api/auth/me')).body.user.id,first.id);

  const switchToSecond=await firstDevice('/api/auth/switch',{
    method:'POST',body:JSON.stringify({sessionId:secondOnFirstDevice.sessionId})
  });
  assert.equal(switchToSecond.status,200,JSON.stringify(switchToSecond.body));
  assert.equal((await firstDevice('/api/auth/me')).body.user.id,second.id);

  const secondDeviceAccounts=await secondDevice('/api/auth/accounts');
  assert.equal(secondDeviceAccounts.status,200);
  assert.deepEqual(secondDeviceAccounts.body.accounts.map(item=>item.user.id),[second.id],
    'saved accounts must stay isolated to the browser/device that added them');

  const switchBack=await firstDevice('/api/auth/switch',{
    method:'POST',body:JSON.stringify({sessionId:firstOnFirstDevice.sessionId})
  });
  assert.equal(switchBack.status,200);
  const removeSavedSecond=await firstDevice('/api/auth/accounts/remove',{
    method:'POST',body:JSON.stringify({sessionId:secondOnFirstDevice.sessionId})
  });
  assert.equal(removeSavedSecond.status,200);
  assert.deepEqual((await firstDevice('/api/auth/accounts')).body.accounts.map(item=>item.user.id),[first.id]);

  assert.equal((await secondDevice('/api/auth/me')).body.user.id,second.id,
    'removing a saved account on one device must not sign it out on another device');

  const logoutAll=await firstDevice('/api/auth/logout-all',{method:'POST',body:'{}'});
  assert.equal(logoutAll.status,200);
  assert.equal((await firstDevice('/api/auth/me')).body.user,null);
  assert.equal((await secondDevice('/api/auth/me')).body.user.id,second.id,
    'device-wide sign-out must not revoke sessions on other devices');
});
