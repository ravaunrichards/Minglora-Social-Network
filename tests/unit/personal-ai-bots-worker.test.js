import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalAiBotWorker, PERSONAL_AI_BOT_WORKER_TASK_TYPES } from '../../backend/modules/personal-ai-bots/worker.js';

const workerId='minglora-worker-test:1';
const leasedTask={
  id:'00000000-0000-4000-8000-000000000011',
  botId:'00000000-0000-4000-8000-000000000012',
  taskType:'translation',
  instruction:'Translate this approved draft into Jamaican Patois.',
  highImpact:false,
  approvedBy:'5b998c21-86b5-4621-ab37-e0808a2657b1',
  approvedAt:'2026-11-09T10:00:00.000Z',
  workerId,
  leaseToken:'00000000-0000-4000-8000-000000000013',
  providerAssignmentId:'00000000-0000-4000-8000-000000000014',
  providerIdentifier:'example_provider',
  modelIdentifier:'example/model-v1'
};

function dependencies(overrides={}) {
  const calls={claims:0,heartbeats:0,completions:[],failures:[],provider:[]};
  const value={
    workerId,
    claimTasks:async()=>{calls.claims++;return [leasedTask];},
    heartbeatTask:async()=>{calls.heartbeats++;return true;},
    completeTask:async task=>{calls.completions.push(task);return true;},
    failTask:async task=>{calls.failures.push(task);return {ok:true};},
    providerAdapter:{provider:'test-provider',model:'test-model',providerIdentifier:'example_provider',modelIdentifier:'example/model-v1',generate:async request=>{
      calls.provider.push(request);
      return {text:'Reviewed draft output.'};
    }},
    logger:{error:()=>{}}
  };
  return {options:{...value,...overrides},calls};
}

test('worker stays disabled and does not claim work without a provider adapter',async()=>{
  const {options,calls}=dependencies({providerAdapter:null});
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.deepEqual(result,{status:'disabled',reason:'provider_adapter_not_configured',claimed:0});
  assert.equal(calls.claims,0);
});

test('worker claims only approved low-impact text tasks and stores a human-review draft',async()=>{
  const {options,calls}=dependencies();
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'completed');
  assert.equal(result.taskId,leasedTask.id);
  assert.equal(calls.heartbeats,1);
  assert.equal(calls.provider.length,1);
  assert.deepEqual(calls.provider[0].tools,[]);
  assert.equal(calls.provider[0].toolAccess,'disabled');
  assert.equal(calls.provider[0].externalActionsAllowed,false);
  assert.equal(calls.provider[0].responseMode,'draft');
  assert.equal(calls.completions.length,1);
  assert.equal(calls.completions[0].result.content,'Reviewed draft output.');
  assert.equal(calls.completions[0].result.outputType,'human_review_draft');
  assert.equal(calls.failures.length,0);
});

test('worker allowlist contains only four non-side-effecting text task types',()=>{
  assert.deepEqual([...PERSONAL_AI_BOT_WORKER_TASK_TYPES].sort(),[
    'analytics_report','assistant_request','moderation_review','translation'
  ]);
});

test('worker rejects social-action task types even when marked low-impact and approved',async()=>{
  for(const taskType of ['follow','unfollow','send_message','react','draft_post','share_media','join_group','event_participation']){
    const {options,calls}=dependencies({
      claimTasks:async()=>[{...leasedTask,taskType,highImpact:false}]
    });
    const worker=createPersonalAiBotWorker(options);
    const result=await worker.runOnce();
    assert.equal(result.status,'policy_blocked',taskType);
    assert.equal(calls.provider.length,0,taskType+' must never reach a provider');
    assert.equal(calls.completions.length,0,taskType+' must never be completed');
    assert.equal(calls.failures.length,1,taskType+' must be recorded as blocked');
    assert.equal(calls.failures[0].retryable,false,taskType+' must not be retried');
    assert.equal(calls.failures[0].errorCode,'TASK_POLICY_BLOCKED');
  }
});

test('worker permanently rejects high-impact or unapproved task payloads',async()=>{
  const {options,calls}=dependencies({
    claimTasks:async()=>[{...leasedTask,highImpact:true}]
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'policy_blocked');
  assert.equal(calls.provider.length,0);
  assert.equal(calls.failures.length,1);
  assert.equal(calls.failures[0].retryable,false);
  assert.equal(calls.failures[0].errorCode,'TASK_POLICY_BLOCKED');
});

test('worker does not call a provider after losing its lease heartbeat',async()=>{
  const {options,calls}=dependencies({heartbeatTask:async()=>false});
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'lease_lost');
  assert.equal(calls.provider.length,0);
  assert.equal(calls.completions.length,0);
  assert.equal(calls.failures.length,0);
});

test('provider errors are recorded as bounded retryable failures by default',async()=>{
  const {options,calls}=dependencies({
    providerAdapter:{providerIdentifier:'example_provider',modelIdentifier:'example/model-v1',generate:async()=>{throw Object.assign(new Error('Temporary provider outage.'),{code:'PROVIDER_TIMEOUT'});}}
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'failed');
  assert.equal(calls.failures.length,1);
  assert.equal(calls.failures[0].retryable,true);
  assert.equal(calls.failures[0].errorCode,'PROVIDER_TIMEOUT');
});

test('invalid provider output is recorded as a permanent failure',async()=>{
  const {options,calls}=dependencies({
    providerAdapter:{providerIdentifier:'example_provider',modelIdentifier:'example/model-v1',generate:async()=>''}
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'failed');
  assert.equal(calls.failures.length,1);
  assert.equal(calls.failures[0].retryable,false);
  assert.equal(calls.failures[0].errorCode,'AI_PROVIDER_OUTPUT_INVALID');
});

test('worker can be stopped before claiming new tasks',async()=>{
  const {options,calls}=dependencies();
  const worker=createPersonalAiBotWorker(options);
  worker.stop();
  const result=await worker.runOnce();
  assert.equal(result.status,'stopped');
  assert.equal(calls.claims,0);
});


test('worker resolves a provider adapter by the exact claimed assignment',async()=>{
  const {options,calls}=dependencies({
    providerAdapter:null,
    resolveProviderAdapter:async task=>{
      assert.equal(task.providerAssignmentId,leasedTask.providerAssignmentId);
      assert.equal(task.providerIdentifier,'example_provider');
      assert.equal(task.modelIdentifier,'example/model-v1');
      return {
        providerIdentifier:'example_provider',
        modelIdentifier:'example/model-v1',
        generate:async()=>({text:'Assignment-specific model draft.'})
      };
    }
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'completed');
  assert.equal(calls.completions[0].result.content,'Assignment-specific model draft.');
});

test('worker refuses a provider adapter for the wrong assigned model',async()=>{
  const {options,calls}=dependencies({
    providerAdapter:null,
    resolveProviderAdapter:async()=>({
      providerIdentifier:'another_provider',
      modelIdentifier:'another/model',
      generate:async()=>({text:'This must never run.'})
    })
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'failed');
  assert.equal(result.errorCode,'AI_PROVIDER_ASSIGNMENT_UNAVAILABLE');
  assert.equal(calls.provider.length,0);
  assert.equal(calls.completions.length,0);
  assert.equal(calls.failures.length,1);
  assert.equal(calls.failures[0].retryable,false);
});


test('worker renews its lease periodically for the full provider generation window',async()=>{
  const {options,calls}=dependencies({
    leaseSeconds:30,
    heartbeatIntervalMs:1000,
    providerAdapter:{
      providerIdentifier:'example_provider',
      modelIdentifier:'example/model-v1',
      generate:async()=>new Promise(resolve=>setTimeout(()=>resolve({text:'Long-running reviewed draft.'}),2300))
    }
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'completed');
  assert.ok(calls.heartbeats>=3,'initial heartbeat plus periodic renewals are required');
  assert.equal(calls.completions.length,1);
  assert.equal(calls.failures.length,0);
});

test('worker aborts provider generation and never completes after a periodic lease renewal fails',async()=>{
  const {options,calls}=dependencies({
    leaseSeconds:30,
    heartbeatIntervalMs:1000,
    heartbeatTask:async()=>{calls.heartbeats++;return calls.heartbeats===1;},
    providerAdapter:{
      providerIdentifier:'example_provider',
      modelIdentifier:'example/model-v1',
      generate:async(_request,{signal})=>new Promise((resolve,reject)=>{
        const onAbort=()=>reject(signal.reason||new Error('Provider generation aborted after lease loss.'));
        if(signal.aborted)onAbort();
        else signal.addEventListener('abort',onAbort,{once:true});
        setTimeout(()=>resolve({text:'This result must not be saved.'}),3000);
      })
    }
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'lease_lost');
  assert.equal(result.errorCode,'AI_TASK_LEASE_LOST');
  assert.ok(calls.heartbeats>=2);
  assert.equal(calls.completions.length,0);
  assert.equal(calls.failures.length,0);
});

test('worker reports an unrecorded failure when the failure RPC rejects lease ownership',async()=>{
  const {options,calls}=dependencies({
    providerAdapter:{
      providerIdentifier:'example_provider',
      modelIdentifier:'example/model-v1',
      generate:async()=>{throw Object.assign(new Error('Provider unavailable.'),{code:'PROVIDER_UNAVAILABLE'});}
    },
    failTask:async task=>{calls.failures.push(task);return {ok:false,reason:'lease_not_owned_or_expired'};}
  });
  const worker=createPersonalAiBotWorker(options);
  const result=await worker.runOnce();
  assert.equal(result.status,'failure_unrecorded');
  assert.equal(result.errorCode,'AI_TASK_FAILURE_NOT_RECORDED');
  assert.equal(calls.failures.length,1);
  assert.equal(calls.completions.length,0);
});

test('worker rejects heartbeat intervals that cannot safely renew a lease',()=>{
  const {options}=dependencies({leaseSeconds:30,heartbeatIntervalMs:15000});
  assert.throws(()=>createPersonalAiBotWorker(options),/less than half the lease duration/);
});
