import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalAiBotWorker } from '../../backend/modules/personal-ai-bots/worker.js';

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
  leaseToken:'00000000-0000-4000-8000-000000000013'
};

function dependencies(overrides={}) {
  const calls={claims:0,heartbeats:0,completions:[],failures:[],provider:[]};
  const value={
    workerId,
    claimTasks:async()=>{calls.claims++;return [leasedTask];},
    heartbeatTask:async()=>{calls.heartbeats++;return true;},
    completeTask:async task=>{calls.completions.push(task);return true;},
    failTask:async task=>{calls.failures.push(task);return {ok:true};},
    providerAdapter:{provider:'test-provider',model:'test-model',generate:async request=>{
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
    providerAdapter:{generate:async()=>{throw Object.assign(new Error('Temporary provider outage.'),{code:'PROVIDER_TIMEOUT'});}}
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
    providerAdapter:{generate:async()=>''}
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
