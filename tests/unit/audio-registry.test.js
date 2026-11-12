import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_CATEGORIES,AUDIO_EVENTS,ACCEPTED_RECORDING_TYPES,
  validateAudioAssetMetadata,isProductionAudioEligible,validateAudioAssignment
} from "../../backend/modules/sounds/registry.js";

const validPlatformAsset = () => ({
  title:"Caribbean bird dawn recording",
  description:"Original outdoor bird recording.",
  scope:"platform",
  categoryKey:"environmental_recordings",
  originalFilename:"environmental_recordings_bird_dawn_v001.wav",
  fileFormat:"wav",
  originType:"wildlife_recording",
  authenticityStatus:"verified_authentic",
  reviewStatus:"approved",
  sourceWebsite:"Macaulay Library",
  originalDownloadPage:"https://example.org/recordings/123",
  licenseName:"CC BY 4.0",
  licenseUrl:"https://creativecommons.org/licenses/by/4.0/",
  attributionText:"Recorded by the original contributor.",
  downloadDate:"2026-11-12",
  byteSize:32000,
  durationMs:12000,
  sampleRateHz:44100,
  bitRateBps:1411000,
  channelCount:2,
  sha256:"a".repeat(64),
  commercialUseAllowed:true,
  redistributionAllowed:true,
  attributionRequired:true,
  licenseVerified:true,
  rightsConfirmed:true
});

test("audio taxonomy has unique categories and event keys with valid category references",()=>{
  assert.equal(new Set(AUDIO_CATEGORIES.map(x=>x.key)).size,AUDIO_CATEGORIES.length);
  assert.equal(new Set(AUDIO_EVENTS.map(x=>x.key)).size,AUDIO_EVENTS.length);
  const categories=new Set(AUDIO_CATEGORIES.map(x=>x.key));
  for(const event of AUDIO_EVENTS)assert.ok(categories.has(event.categoryKey),event.key);
  assert.ok(AUDIO_EVENTS.some(x=>x.key==="call.incoming_voice"));
  assert.ok(AUDIO_EVENTS.some(x=>x.key==="meetwave.invitation"));
  assert.ok(AUDIO_EVENTS.some(x=>x.key==="live.started"));
  assert.ok(AUDIO_EVENTS.some(x=>x.key==="message.voice_received"));
  assert.ok(AUDIO_EVENTS.some(x=>x.key==="ai.response_received"));
});

test("the platform accepts only authentic recorded origin types",()=>{
  assert.ok(ACCEPTED_RECORDING_TYPES.includes("wildlife_recording")===false);
  assert.ok(ACCEPTED_RECORDING_TYPES.includes("environmental_recording"));
  for(const originType of ["synthetic","synthesized","procedural","ai_generated","text_to_speech","oscillator","robotic_voice","unknown"]){
    const result=validateAudioAssetMetadata({...validPlatformAsset(),originType});
    assert.equal(result.valid,false,originType);
  }
});

test("a platform recording requires complete source, verified licence, rights and checksum metadata",()=>{
  const result=validateAudioAssetMetadata(validPlatformAsset());
  assert.equal(result.valid,true,result.errors.join(" "));
  assert.equal(result.value.sha256,"a".repeat(64));
  assert.equal(result.value.commercialUseAllowed,true);
  assert.equal(result.value.redistributionAllowed,true);
  for(const patch of [
    {originalDownloadPage:""},
    {licenseUrl:""},
    {licenseVerified:false},
    {commercialUseAllowed:false},
    {redistributionAllowed:false},
    {attributionText:""},
    {downloadDate:""},
    {sha256:"not-a-checksum"}
  ])assert.equal(validateAudioAssetMetadata({...validPlatformAsset(),...patch}).valid,false);
});

test("filename, category/event mapping, file format and technical metadata are validated",()=>{
  assert.equal(validateAudioAssetMetadata({...validPlatformAsset(),originalFilename:"sound1.wav"}).valid,false);
  assert.equal(validateAudioAssetMetadata({...validPlatformAsset(),fileFormat:"mp4"}).valid,false);
  assert.equal(validateAudioAssetMetadata({...validPlatformAsset(),categoryKey:"calls",eventKey:"message.incoming"}).valid,false);
  assert.equal(validateAudioAssetMetadata({...validPlatformAsset(),durationMs:0}).valid,false);
  assert.equal(validateAudioAssetMetadata({...validPlatformAsset(),channelCount:12}).valid,false);
});

test("recordings are not production eligible until authenticity, licensing and approval gates all pass",()=>{
  const asset=validPlatformAsset();
  assert.equal(isProductionAudioEligible(asset),true);
  for(const patch of [
    {reviewStatus:"pending_review"},
    {authenticityStatus:"unverified"},
    {licenseVerified:false},
    {commercialUseAllowed:false},
    {redistributionAllowed:false},
    {attributionText:""}
  ])assert.equal(isProductionAudioEligible({...asset,...patch}),false);
  assert.equal(isProductionAudioEligible({...asset,originType:"procedural"}),true===false);
});

test("audio event assignments must reference an active registered event and a valid asset id",()=>{
  assert.equal(validateAudioAssignment({eventKey:"call.incoming_voice",assetId:"asset-1"}).valid,true);
  assert.equal(validateAudioAssignment({eventKey:"marketplace.order_update",assetId:"asset-1"}).valid,false);
  assert.equal(validateAudioAssignment({eventKey:"unknown.event",assetId:"asset-1"}).valid,false);
  assert.equal(validateAudioAssignment({eventKey:"live.started",assetId:""}).valid,false);
  assert.equal(validateAudioAssignment({eventKey:"live.started",assetId:"asset-1",volume:1.2}).valid,false);
});
