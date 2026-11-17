import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseProviderFallback, resolveAssignedProviderRoute } from '../../backend/modules/ai-network/provider-execution.js';

const id='11111111-1111-4111-8111-111111111111';
const assignmentId='22222222-2222-4222-8222-222222222222';
const accountId='33333333-3333-4333-8333-333333333333';
const modelId='44444444-4444-4444-8444-444444444444';
const fallbackId='55555555-5555-4555-8555-555555555555';

function fixture(overrides={}) {
  return {
    rows:[{
      identity:{identity_id:id},
      assignment:{
        assignment_id:assignmentId,identity_id:id,provider_account_id:accountId,
        model_id:modelId,fallback_model_id:fallbackId,routing_priority:10,
        assigned_capabilities:['text'],assignment_status:'active',provider_health_status:'healthy'
      },
      provider_account:{provider_account_id:accountId,provider_name:'openai',account_type:'managed',status:'configured',health_status:'healthy'}
    }],
    models:[
      {model_id:modelId,provider_name:'openai',model_identifier:'gpt-test-primary',model_name:'Primary',text_capability:true,is_active:true},
      {model_id:fallbackId,provider_name:'openai',model_identifier:'gpt-test-fallback',model_name:'Fallback',text_capability:true,is_active:true}
    ],
    ...overrides
  };
}

test('resolves an active, healthy, text-capable persisted OpenAI assignment',()=>{
  const f=fixture();
  const result=resolveAssignedProviderRoute(id,f.rows,f.models);
  assert.equal(result.ok,true);
  assert.equal(result.primary.model,'gpt-test-primary');
  assert.equal(result.fallback.model,'gpt-test-fallback');
  assert.equal(result.assignmentId,assignmentId);
});

test('does not resolve another AI identity assignment',()=>{
  const f=fixture();
  assert.equal(resolveAssignedProviderRoute('66666666-6666-4666-8666-666666666666',f.rows,f.models).reason,'active_assignment_missing');
});

test('rejects user-managed provider account references for platform server credentials',()=>{
  const f=fixture();
  f.rows[0].provider_account.account_type='user';
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'provider_account_not_managed');
});

test('requires active assignment and provider plus account health',()=>{
  const f=fixture();
  f.rows[0].assignment.assignment_status='pending';
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'active_assignment_missing');
  f.rows[0].assignment.assignment_status='active';
  f.rows[0].provider_account.health_status='unavailable';
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'provider_not_healthy');
});

test('requires explicit text capability in both model and identity assignment',()=>{
  const f=fixture();
  f.rows[0].assignment.assigned_capabilities=['image'];
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'text_capability_not_assigned');
  f.rows[0].assignment.assigned_capabilities=['text'];
  f.models[0].text_capability=false;
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'text_capability_not_assigned');
});

test('rejects model/account provider mismatch and unimplemented provider adapters',()=>{
  const f=fixture();
  f.rows[0].provider_account.provider_name='anthropic';
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'provider_account_mismatch');
  f.rows[0].provider_account.provider_name='openai';
  f.models[0].provider_name='anthropic';
  f.rows[0].provider_account.provider_name='anthropic';
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).reason,'provider_adapter_not_available');
});

test('fallback must be active text-capable model from the same implemented provider',()=>{
  const f=fixture();
  f.models[1].provider_name='anthropic';
  assert.equal(resolveAssignedProviderRoute(id,f.rows,f.models).fallback,null);
});

test('provider fallback excludes moderation, missing credential and validation failures',()=>{
  for (const code of ['timeout','network_error','provider_error','model_unavailable','rate_limited','incomplete_generation','invalid_generation']) {
    assert.equal(canUseProviderFallback({code}),true,code);
  }
  for (const code of ['moderation_blocked','moderation_unavailable','missing_credentials','invalid_endpoint','invalid_message']) {
    assert.equal(canUseProviderFallback({code}),false,code);
  }
});
