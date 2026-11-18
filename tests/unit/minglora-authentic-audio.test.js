import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  AUTHENTIC_AUDIO_CATEGORIES,
  buildAuthenticSoundStudioManifest,
  detectAudioFormat,
  validateAuthenticAudioAsset,
  verifyAuthenticAudioFile
} from "../../backend/modules/sounds/authentic-audio.js";

function wavFixture() {
  const bytes=Buffer.alloc(46);
  bytes.write("RIFF",0,"ascii");
  bytes.writeUInt32LE(38,4);
  bytes.write("WAVE",8,"ascii");
  bytes.write("fmt ",12,"ascii");
  bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);
  bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(22050,24);
  bytes.writeUInt32LE(44100,28);
  bytes.writeUInt16LE(2,32);
  bytes.writeUInt16LE(16,34);
  bytes.write("data",36,"ascii");
  bytes.writeUInt32LE(2,40);
  bytes.writeInt16LE(0,44);
  return bytes;
}

function createApprovedFixture(rootDir,overrides={}) {
  const assetPath="public/assets/sound-studio/assets/fixture.wav";
  const absolute=path.join(rootDir,assetPath);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  const bytes=wavFixture();
  fs.writeFileSync(absolute,bytes);
  const sha256=crypto.createHash("sha256").update(bytes).digest("hex");
  return {
    id:"fixture-voice-01",
    name:"Field-recorded bell",
    originalFilename:"fixture.wav",
    originalDownloadPage:"https://audio.example.test/downloads/field-bell",
    sourceName:"Example field recording archive",
    fileFormat:"wav",
    recordingDescription:"A human-operated field recorder captured a real hand-struck bell outdoors.",
    licenseName:"Example commercial and redistribution license",
    licenseUrl:"https://audio.example.test/licenses/commercial-streaming",
    attributionRequired:false,
    attributionText:"",
    commercialUseAllowed:true,
    redistributionAllowed:true,
    downloadDate:"2026-11-18",
    sha256,
    assetPath,
    publicUrl:"/assets/sound-studio/assets/fixture.wav",
    recordingMethod:"field_recording",
    authenticityVerified:true,
    authenticityReviewedAt:"2026-11-18T02:00:00.000Z",
    authenticityReviewNotes:"A reviewer listened to the complete source and confirmed the real bell recording and recorder noise.",
    playbackTested:true,
    playbackTestedAt:"2026-11-18T02:01:00.000Z",
    callType:"voice",
    category:"phone_ringtones",
    durationMs:1800,
    status:"approved",
    aiGenerated:false,
    robotic:false,
    synthetic:false,
    procedural:false,
    oscillator:false,
    generationMethod:"field_recording",
    ...overrides
  };
}

test("the supplied source directory has 80 candidate listings and 17 requested audio types",()=>{
  const data=JSON.parse(fs.readFileSync(new URL("../../public/assets/audio-resource-directory.json",import.meta.url),"utf8"));
  assert.equal(data.sourceCount,80);
  assert.equal(data.groups.length,7);
  assert.equal(data.groups.reduce((total,group)=>total+group.sources.length,0),80);
  assert.equal(data.requiredAudioTypes.length,17);
  assert.ok(data.groups.flatMap(group=>group.sources).every(source=>source.reviewStatus==="candidate_source_only"));
});

test("the curated asset registry starts empty and does not imply any downloaded or installed audio",()=>{
  const data=JSON.parse(fs.readFileSync(new URL("../../data/minglora-authentic-audio-library.json",import.meta.url),"utf8"));
  assert.deepEqual(data.assets,[]);
  assert.equal(data.status.approved,0);
  assert.equal(data.status.pendingReview,0);
  assert.equal(data.status.rejected,0);
});

test("valid source, license, provenance, playback and checksum metadata are required for approval",()=>{
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"minglora-authentic-audio-"));
  try {
    const asset=createApprovedFixture(rootDir);
    assert.equal(detectAudioFormat(fs.readFileSync(path.join(rootDir,asset.assetPath))),"wav");
    assert.deepEqual(validateAuthenticAudioAsset(asset),{valid:true,errors:[]});
    const verified=verifyAuthenticAudioFile(asset,{rootDir});
    assert.equal(verified.valid,true);
    assert.equal(verified.sha256,asset.sha256);
    assert.equal(verified.detectedFormat,"wav");
  } finally {
    fs.rmSync(rootDir,{recursive:true,force:true});
  }
});

test("missing, changed, synthetic or non-commercial recordings cannot pass the approval gate",()=>{
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"minglora-authentic-audio-reject-"));
  try {
    const asset=createApprovedFixture(rootDir);
    assert.equal(validateAuthenticAudioAsset({...asset,commercialUseAllowed:false}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,redistributionAllowed:false}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,aiGenerated:true}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,robotic:true}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,synthetic:true}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,procedural:true}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,oscillator:true}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,playbackTested:false}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,authenticityVerified:false}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,licenseName:"CC BY-NC"}).valid,false);
    assert.equal(validateAuthenticAudioAsset({...asset,assetPath:"public/../../secrets.wav"}).valid,false);
    const changedBytes=wavFixture();
    changedBytes[44]=1;
    fs.writeFileSync(path.join(rootDir,asset.assetPath),changedBytes);
    assert.equal(verifyAuthenticAudioFile(asset,{rootDir}).valid,false);
    fs.rmSync(path.join(rootDir,asset.assetPath));
    assert.equal(verifyAuthenticAudioFile(asset,{rootDir}).valid,false);
  } finally {
    fs.rmSync(rootDir,{recursive:true,force:true});
  }
});

test("only approved assets are returned to the active voice, video and notification manifest",()=>{
  const voice={id:"v-01",name:"Real call ring",callType:"voice",category:"phone_ringtones",status:"approved",authenticRecording:true,acceptanceStatus:"approved",commercialUseAllowed:true,redistributionAllowed:true,sha256:"a".repeat(64),publicUrl:"/assets/a.wav",durationMs:1200,licenseName:"Commercial license",licenseUrl:"https://example.test/license",attributionRequired:false,recordingMethod:"field_recording"};
  const video={...voice,id:"vv-01",name:"Real video ring",callType:"video",category:"video_call_ringtones"};
  const notice={...voice,id:"n-01",name:"Real notification",callType:"notification",category:"notifications"};
  const pending={...voice,id:"pending-01",status:"pending_review"};
  const manifest=buildAuthenticSoundStudioManifest([voice,video,notice,pending]);
  assert.deepEqual(manifest.counts,{voiceRingtones:1,videoRingtones:1,notifications:1,total:3});
  assert.equal(manifest.voiceRingtones[0].id,"v-01");
  assert.equal(manifest.videoRingtones[0].id,"vv-01");
  assert.equal(manifest.notifications[0].id,"n-01");
  assert.equal(manifest.voiceRingtones.some(item=>item.id==="pending-01"),false);
});

test("the authenticity validator uses only the supported collection categories",()=>{
  assert.ok(AUTHENTIC_AUDIO_CATEGORIES.includes("jamaican_caribbean"));
  assert.ok(AUTHENTIC_AUDIO_CATEGORIES.includes("traditional_instruments"));
  assert.ok(AUTHENTIC_AUDIO_CATEGORIES.includes("gift_effects"));
  assert.equal(AUTHENTIC_AUDIO_CATEGORIES.length,17);
});
