import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

async function createEngine(fetchImpl=async()=>({ok:true,json:async()=>({sound:{id:"a1",title:"Bird recording",url:"https://audio.example/signed.ogg",volume:0.8,loop:false,playbackSpeed:1,expiresIn:300}})})){
  const played=[];
  const paused=[];
  class FakeAudio{
    constructor(url){this.src=url;this.volume=1;this.loop=false;this.playbackRate=1;this.listeners={};this.paused=false;played.push(this);}
    addEventListener(type,fn){this.listeners[type]=fn;}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;paused.push(this);}
    load(){}
    removeAttribute(){}
  }
  const window={addEventListener(){},dispatchEvent(){}};
  const document={visibilityState:"visible"};
  const sandbox={window,document,Audio:FakeAudio,fetch:fetchImpl,encodeURIComponent,Map,Set,Date,Number,String,Math,Promise,JSON,Error};
  const source=await readFile(new URL("../../public/universal-audio-engine.js",import.meta.url),"utf8");
  vm.runInNewContext(source,sandbox,{filename:"universal-audio-engine.js"});
  return {engine:window.MingloraAudioEngine,played,paused};
}

test("universal engine validates event keys and resolves only secure signed URLs",async()=>{
  let calls=0;
  const setup=await createEngine(async url=>{
    calls++;
    assert.equal(url,"/api/audio/events/call.incoming_voice");
    return {ok:true,json:async()=>({sound:{id:"1",title:"Call",url:"https://audio.example/call.ogg",volume:0.7,expiresIn:300}})};
  });
  assert.equal(await setup.engine.playEvent("not-an-event"),false);
  assert.equal(calls,0);
  assert.equal(await setup.engine.playEvent("call.incoming_voice"),true);
  assert.equal(calls,1);
  assert.equal(setup.played[0].volume,0.7);
});

test("user mute and category volume are respected before playback",async()=>{
  let calls=0;
  const setup=await createEngine(async()=>{calls++;return {ok:true,json:async()=>({sound:{url:"https://audio.example/a.ogg",volume:1,expiresIn:300}})};});
  setup.engine.setPreferences({muted:true});
  assert.equal(await setup.engine.playEvent("message.incoming"),false);
  assert.equal(calls,0);
  setup.engine.setPreferences({muted:false,categoryVolumes:{notification:0}});
  assert.equal(await setup.engine.playEvent("message.incoming"),false);
  assert.equal(calls,1);
  assert.equal(setup.played.length,0);
});

test("signed audio resolution is cached and repeated active events are deduplicated",async()=>{
  let calls=0;
  const setup=await createEngine(async()=>{calls++;return {ok:true,json:async()=>({sound:{url:"https://audio.example/a.ogg",volume:1,expiresIn:300}})};});
  assert.equal(await setup.engine.playEvent("message.incoming"),true);
  assert.equal(await setup.engine.playEvent("message.incoming"),false);
  assert.equal(calls,1);
  assert.equal(setup.played.length,1);
});

test("higher-priority calls safely preempt notification playback",async()=>{
  const setup=await createEngine();
  assert.equal(await setup.engine.playEvent("message.incoming"),true);
  assert.equal(await setup.engine.playEvent("call.incoming_voice"),true);
  assert.equal(setup.paused.length,1);
  assert.equal(setup.engine.getState().activeEvents[0],"call.incoming_voice");
});
