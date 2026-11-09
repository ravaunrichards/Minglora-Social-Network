import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPersonalAiBotWorker } from '../backend/modules/personal-ai-bots/worker.js';

const OWNER_ID = '5b998c21-86b5-4621-ab37-e0808a2657b1';
const RETRYABLE_HTTP = new Set([408,425,429,500,502,503,504,520,522,524]);
const wait = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));

async function gatewayRequest(action,extra={}) {
  const baseUrl=String(process.env.SUPABASE_STATE_API_URL||'').trim().replace(/\/+$/,'');
  const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'').trim();
  const stateApiKey=String(process.env.SUPABASE_STATE_API_KEY||'').trim();
  if(!baseUrl||!publishableKey||!stateApiKey) {
    throw Object.assign(new Error('The Minglora Supabase runtime gateway is not configured.'),{code:'AI_WORKER_GATEWAY_NOT_CONFIGURED',retryable:false});
  }
  for(let attempt=1;attempt<=3;attempt++){
    let response;
    try{
      response=await fetch(baseUrl,{
        method:'POST',
        headers:{
          apikey:publishableKey,
          'x-minglora-api-key':stateApiKey,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({action,actorUserId:OWNER_ID,...extra}),
        signal:AbortSignal.timeout(15000)
      });
    }catch(error){
      if(attempt<3){await wait(attempt*350);continue;}
      throw Object.assign(new Error('Could not reach the Minglora runtime gateway.'),{code:'AI_WORKER_GATEWAY_UNAVAILABLE',cause:error});
    }
    const payload=await response.json().catch(()=>({}));
    if(response.ok)return payload;
    if(RETRYABLE_HTTP.has(response.status)&&attempt<3){await wait(attempt*350);continue;}
    throw Object.assign(new Error(String(payload.error||'The Minglora runtime gateway rejected the worker request.').slice(0,240)),{
      code:String(payload.code||'AI_WORKER_GATEWAY_REJECTED'),
      status:response.status,
      retryable:RETRYABLE_HTTP.has(response.status)
    });
  }
  throw new Error('The Minglora runtime gateway retry policy was exhausted.');
}

async function loadProviderAdapter() {
  const moduleName=String(process.env.MINGLORA_AI_BOT_PROVIDER_MODULE||'').trim();
  if(!moduleName)throw new Error('MINGLORA_AI_BOT_PROVIDER_MODULE must point to a verified server-side provider adapter.');
  const absolutePath=path.isAbsolute(moduleName)?moduleName:path.resolve(process.cwd(),moduleName);
  const loaded=await import(pathToFileURL(absolutePath).href);
  const adapter=typeof loaded.createProviderAdapter==='function'
    ?await loaded.createProviderAdapter()
    :(loaded.default||loaded.providerAdapter||loaded);
  if(!adapter||typeof adapter.generate!=='function') {
    throw new Error('The configured AI provider module must export a generate() method.');
  }
  return adapter;
}

async function main() {
  if(String(process.env.MINGLORA_AI_BOT_WORKER_ENABLED||'').trim().toLowerCase()!=='true') {
    console.info('[Minglora AI Bot Worker] Disabled. Set MINGLORA_AI_BOT_WORKER_ENABLED=true only after release approval.');
    return;
  }
  if(String(process.env.PERSISTENCE_DRIVER||'').trim().toLowerCase()!=='supabase') {
    throw new Error('The AI task worker requires PERSISTENCE_DRIVER=supabase.');
  }

  const providerAdapter=await loadProviderAdapter();
  const workerId=String(process.env.MINGLORA_AI_BOT_WORKER_ID||('minglora-ai-'+os.hostname()+':'+process.pid)).slice(0,80);
  const leaseSeconds=Math.min(300,Math.max(30,Number(process.env.MINGLORA_AI_BOT_LEASE_SECONDS||180)));
  const worker=createPersonalAiBotWorker({
    workerId,leaseSeconds,providerAdapter,
    claimTasks:async args=>{
      const result=await gatewayRequest('ai_bot_task_claim',args);
      return result.tasks||[];
    },
    heartbeatTask:async args=>{
      const result=await gatewayRequest('ai_bot_task_heartbeat',{
        taskId:args.taskId,workerId:args.workerId,leaseToken:args.leaseToken,leaseSeconds:args.leaseSeconds
      });
      return result.ok===true;
    },
    completeTask:async args=>{
      const result=await gatewayRequest('ai_bot_task_complete',args);
      return result.ok===true;
    },
    failTask:async args=>{
      return gatewayRequest('ai_bot_task_fail',args);
    }
  });

  let stopping=false;
  const stop=()=>{
    if(stopping)return;
    stopping=true;
    worker.stop();
    console.info('[Minglora AI Bot Worker] Shutdown requested.');
  };
  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);

  const idlePollMs=Math.min(30000,Math.max(1000,Number(process.env.MINGLORA_AI_BOT_POLL_MS||2500)));
  console.info('[Minglora AI Bot Worker] Started in draft-only mode.',{workerId,leaseSeconds});
  while(!stopping){
    const result=await worker.runOnce();
    if(result.status==='failed'||result.status==='lease_invalid'||result.status==='lease_lost'){
      console.warn('[Minglora AI Bot Worker] Task attempt did not complete.',{
        status:result.status,errorCode:result.errorCode||null
      });
    }else if(result.status==='completed'){
      console.info('[Minglora AI Bot Worker] Draft generated for administrator review.',{taskId:result.taskId});
    }
    if(result.status==='idle')await wait(idlePollMs);
    else if(result.status!=='completed')await wait(Math.min(10000,idlePollMs*2));
  }
}

main().catch(error=>{
  console.error('[Minglora AI Bot Worker] Startup or gateway failure.',{
    code:String(error?.code||'AI_WORKER_STARTUP_FAILED'),
    message:String(error?.message||error).slice(0,200)
  });
  process.exitCode=1;
});
