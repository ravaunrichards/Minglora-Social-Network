import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionAuthManager, getAuthTokenExpiresAt } from '../../src/session-auth.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('coalesces concurrent refreshes so one rotating refresh token is consumed once', async () => {
  let refreshCalls=0,saves=0;
  const session={id:'session-1',authSealed:'sealed-old',authExpiresAt:new Date(Date.now()-1000).toISOString()};
  const manager=createSessionAuthManager({
    openSession:()=>({access_token:'old-access-token-xxxxxxxxxxxx',refresh_token:'old-refresh-token-xxxxxxxx'}),
    sealSession:tokens=>'sealed:'+tokens.access_token+':'+tokens.refresh_token,
    refreshSession:async refreshToken=>{
      refreshCalls++;assert.equal(refreshToken,'old-refresh-token-xxxxxxxx');
      await wait(15);
      return {access_token:'new-access-token-xxxxxxxxxxxx',refresh_token:'new-refresh-token-xxxxxxxx',expires_in:3600};
    },
    save:async()=>{saves++;}
  });
  const [first,second,third]=await Promise.all([manager(session),manager(session),manager(session)]);
  assert.equal(refreshCalls,1);
  assert.equal(saves,1);
  assert.equal(first.access_token,'new-access-token-xxxxxxxxxxxx');
  assert.equal(second.access_token,first.access_token);
  assert.equal(third.refresh_token,'new-refresh-token-xxxxxxxx');
  assert.match(session.authSealed,/new-access-token/);
});

test('invalid or already-used refresh tokens invalidate only that application session', async () => {
  let saves=0;
  const session={id:'session-2',authSealed:'sealed',authExpiresAt:new Date(Date.now()-1000).toISOString()};
  const manager=createSessionAuthManager({
    openSession:()=>({access_token:'old-access-token-xxxxxxxxxxxx',refresh_token:'reused-refresh-token-xxxx'}),
    sealSession:()=>'sealed-next',
    refreshSession:async()=>{throw Object.assign(new Error('Invalid Refresh Token: Already Used'),{status:400,code:'refresh_token_already_used'});},
    save:async()=>{saves++;}
  });
  assert.equal(await manager(session),null);
  assert.equal(session.authSealed,null);
  assert.equal(session.authExpiresAt,null);
  assert.ok(session.authInvalidatedAt);
  assert.equal(saves,1);
});

test('a temporary provider outage does not erase the stored session', async () => {
  const session={id:'session-3',authSealed:'sealed',authExpiresAt:new Date(Date.now()-1000).toISOString()};
  const manager=createSessionAuthManager({
    openSession:()=>({access_token:'old-access-token-xxxxxxxxxxxx',refresh_token:'refresh-token-xxxxxxxxxxxx'}),
    sealSession:()=>'sealed-next',
    refreshSession:async()=>{throw Object.assign(new Error('Could not reach Supabase Auth.'),{status:503});},
    save:async()=>{}
  });
  await assert.rejects(manager(session),/Could not reach Supabase Auth/);
  assert.equal(session.authSealed,'sealed');
  assert.equal(session.authInvalidatedAt,undefined);
});

test('uses the earlier explicit/JWT token expiry rather than a longer expires_in value',()=>{
  const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+900})).toString('base64url');
  const token='header.'+payload+'.signature';
  const expiry=getAuthTokenExpiresAt({access_token:token,expires_in:3600});
  assert.ok(expiry<=Date.now()+901000);
  assert.ok(expiry>=Date.now()+890000);
});
