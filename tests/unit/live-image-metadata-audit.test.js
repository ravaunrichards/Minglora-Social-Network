import test from "node:test";
import assert from "node:assert/strict";
import { inspectImageBuffer } from "../../scripts/audit-minglora-live-image-metadata.mjs";
function pngChunk(type,data){
  const header=Buffer.alloc(8);header.writeUInt32BE(data.length,0);header.write(type,4,4,"ascii");
  return Buffer.concat([header,data,Buffer.alloc(4)]);
}
function pngFixture({width=32,height=64,alpha=true,transparency=false}={}){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=alpha?6:2;
  const chunks=[pngChunk("IHDR",ihdr)];
  if(transparency)chunks.push(pngChunk("tRNS",Buffer.from([0])));
  chunks.push(pngChunk("IDAT",Buffer.from([0])),pngChunk("IEND",Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),...chunks]);
}
function jpegFixture({width=256,height=100}={}){
  return Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,(height>>8)&255,height&255,
    (width>>8)&255,width&255,0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00,0xff,0xd9]);
}
function gifFixture({width=16,height=8,transparency=true,animated=true}={}){
  const header=Buffer.from("GIF89a","ascii"),screen=Buffer.alloc(7);
  screen.writeUInt16LE(width,0);screen.writeUInt16LE(height,2);
  const blocks=[];
  if(transparency)blocks.push(Buffer.from([0x21,0xf9,0x04,0x01,0x00,0x00,0x00,0x00]));
  if(animated)blocks.push(Buffer.from("21ff0b4e45545343415045322e300301000000","hex"));
  const image=Buffer.from([0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00]);
  return Buffer.concat([header,screen,...blocks,image,Buffer.from([0x3b])]);
}
function webpFixture({width=640,height=480,alpha=true,animated=true}={}){
  const data=Buffer.alloc(10);data[0]=(alpha?0x10:0)|(animated?0x02:0);
  const w=width-1,h=height-1;data[4]=w&255;data[5]=(w>>8)&255;data[6]=(w>>16)&255;
  data[7]=h&255;data[8]=(h>>8)&255;data[9]=(h>>16)&255;
  const chunk=Buffer.alloc(18);chunk.write("VP8X",0,"ascii");chunk.writeUInt32LE(10,4);data.copy(chunk,8);
  const riff=Buffer.alloc(12);riff.write("RIFF",0,"ascii");riff.writeUInt32LE(22,4);riff.write("WEBP",8,"ascii");
  return Buffer.concat([riff,chunk]);
}
test("PNG metadata parser measures dimensions and declared alpha correctly",()=>{
  const result=inspectImageBuffer(pngFixture({width:900,height:600,alpha:true}));
  assert.equal(result.format,"PNG");assert.equal(result.width_px,900);assert.equal(result.height_px,600);
  assert.equal(result.orientation,"landscape");assert.equal(result.alpha_channel_present,true);
  assert.equal(result.transparency_metadata_present,false);
});
test("PNG transparency chunks are distinguished from alpha-channel color types",()=>{
  const result=inspectImageBuffer(pngFixture({alpha:false,transparency:true}));
  assert.equal(result.alpha_channel_present,false);assert.equal(result.transparency_metadata_present,true);
});
test("JPEG frame markers provide dimensions without inventing transparency",()=>{
  const result=inspectImageBuffer(jpegFixture({width:4032,height:3024}));
  assert.equal(result.format,"JPEG");assert.equal(result.width_px,4032);assert.equal(result.height_px,3024);
  assert.equal(result.alpha_channel_present,false);assert.equal(result.transparency_metadata_present,false);
});
test("GIF graphic-control and loop metadata are reported without asserting pixel transparency",()=>{
  const result=inspectImageBuffer(gifFixture());
  assert.equal(result.format,"GIF");assert.equal(result.width_px,16);assert.equal(result.height_px,8);
  assert.equal(result.transparency_metadata_present,true);assert.equal(result.animation_metadata_present,true);
  assert.equal(result.frames_detected,1);
});
test("WebP extended header reports canvas, alpha and animation flags",()=>{
  const result=inspectImageBuffer(webpFixture({width:1920,height:1080}));
  assert.equal(result.format,"WebP");assert.equal(result.width_px,1920);assert.equal(result.height_px,1080);
  assert.equal(result.alpha_channel_present,true);assert.equal(result.animation_metadata_present,true);
});
test("truncated or unsupported buffers fail instead of producing guessed metadata",()=>{
  assert.throws(()=>inspectImageBuffer(Buffer.from([0x89,0x50,0x4e,0x47])),/unsupported or unrecognized|invalid or truncated PNG/);
  assert.throws(()=>inspectImageBuffer(Buffer.from("not an image")),/unsupported or unrecognized/);
  assert.throws(()=>inspectImageBuffer(Buffer.from([0xff,0xd8,0xff])),/JPEG/);
});
