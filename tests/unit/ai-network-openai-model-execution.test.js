import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOpenAIModelExecution } from '../../backend/modules/ai-network/openai-bot-chat.js';
import { probeOpenAIProvider } from '../../backend/modules/ai-network/openai-provider-probe.js';

function response(payload, status=200) {
  return { ok:status>=200 && status<300, status, json:async()=>payload };
}

test('OpenAI assignment smoke test performs moderated, non-stored, tool-free inference',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    const payload=JSON.parse(options.body);
    calls.push({url,options,payload});
    if(url.endsWith('/moderations')) return response({model:'omni-moderation-latest',results:[{flagged:false}]});
    if(url.endsWith('/responses')) return response({
      id:'resp_smoke_test',model:'gpt-assigned-model',status:'completed',
      output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'MINGLORA_PROVIDER_READY'}]}],
      usage:{input_tokens:5,output_tokens:2,total_tokens:7}
    });
    throw new Error('Unexpected endpoint');
  };
  const result=await verifyOpenAIModelExecution({
    model:'gpt-assigned-model',
    env:{OPENAI_API_KEY:'test-secret',OPENAI_BASE_URL:'https://api.openai.com/v1',MINGLORA_AI_PROVIDER:'anthropic'},
    fetchImpl
  });
  assert.equal(result.probeStatus,'inference_verified');
  assert.equal(result.healthStatus,'healthy');
  assert.equal(result.usage.total_tokens,7);
  assert.equal(calls.length,3);
  assert.ok(calls[0].url.endsWith('/moderations'));
  assert.ok(calls[1].url.endsWith('/responses'));
  assert.ok(calls[2].url.endsWith('/moderations'));
  assert.equal(calls[1].payload.model,'gpt-assigned-model');
  assert.equal(calls[1].payload.store,false);
  assert.deepEqual(calls[1].payload.tools,[]);
  assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer test-secret'));
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('assigned OpenAI model probe uses OpenAI-specific credentials, not another provider generic key',async()=>{
  let requestSeen=null;
  const result=await probeOpenAIProvider({
    model:'gpt-assigned-model',
    env:{MINGLORA_AI_PROVIDER:'anthropic',MINGLORA_AI_API_KEY:'anthropic-test-key',OPENAI_API_KEY:'openai-test-key'},
    fetchImpl:async(url,options)=>{
      requestSeen={url,options};
      return response({id:'gpt-assigned-model'});
    }
  });
  assert.equal(result.connected,true);
  assert.equal(requestSeen.options.headers.Authorization,'Bearer openai-test-key');
  assert.ok(requestSeen.url.endsWith('/models/gpt-assigned-model'));
});

test('assigned OpenAI model probe will not send a different provider generic key',async()=>{
  let calls=0;
  const result=await probeOpenAIProvider({
    model:'gpt-assigned-model',
    env:{MINGLORA_AI_PROVIDER:'anthropic',MINGLORA_AI_API_KEY:'anthropic-test-key'},
    fetchImpl:async()=>{calls+=1;return response({id:'should-not-be-called'});}
  });
  assert.equal(result.status,'missing_credentials');
  assert.equal(calls,0);
});

test('smoke test refuses to call OpenAI without a private server credential',async()=>{
  let calls=0;
  await assert.rejects(
    verifyOpenAIModelExecution({model:'gpt-assigned-model',env:{},fetchImpl:async()=>{calls+=1;}}),
    error=>error.code==='missing_credentials'
  );
  assert.equal(calls,0);
});

test('assigned OpenAI model never reuses the legacy key for a different selected provider',async()=>{
  let calls=0;
  await assert.rejects(
    verifyOpenAIModelExecution({
      model:'gpt-assigned-model',
      env:{MINGLORA_AI_PROVIDER:'anthropic',MINGLORA_AI_API_KEY:'anthropic-test-key'},
      fetchImpl:async()=>{calls+=1;}
    }),
    error=>error.code==='missing_credentials'
  );
  assert.equal(calls,0);
});

test('input moderation failure prevents the smoke-test inference call',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,payload:JSON.parse(options.body)});
    return response({model:'omni-moderation-latest',results:[{flagged:true}]});
  };
  await assert.rejects(
    verifyOpenAIModelExecution({
      model:'gpt-assigned-model',
      env:{OPENAI_API_KEY:'test-secret',OPENAI_BASE_URL:'https://api.openai.com/v1'},
      fetchImpl
    }),
    error=>error.code==='moderation_blocked'
  );
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.endsWith('/moderations'));
});

test('output moderation failure does not return a verified execution status',async()=>{
  let moderationCount=0;
  const fetchImpl=async(url,options)=>{
    if(url.endsWith('/moderations')) {
      moderationCount+=1;
      return response({model:'omni-moderation-latest',results:[{flagged:moderationCount===2}]});
    }
    return response({
      id:'resp_smoke_test',model:'gpt-assigned-model',status:'completed',
      output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'MINGLORA_PROVIDER_READY'}]}],
      usage:{input_tokens:5,output_tokens:2,total_tokens:7}
    });
  };
  await assert.rejects(
    verifyOpenAIModelExecution({
      model:'gpt-assigned-model',
      env:{OPENAI_API_KEY:'test-secret',OPENAI_BASE_URL:'https://api.openai.com/v1'},
      fetchImpl
    }),
    error=>error.code==='moderation_blocked'
  );
  assert.equal(moderationCount,2);
});
