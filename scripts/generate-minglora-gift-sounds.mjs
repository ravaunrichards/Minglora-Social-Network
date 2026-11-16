import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"public","assets","gift-sounds");
const rate=44100,channels=2,bits=16,tau=Math.PI*2;
const gifts=[
 {code:"rose-4ieccm",name:"Rose",slug:"rose",seconds:1.55,seed:101,notes:[440,554.37,659.25,880],step:.22,amp:.078,timbre:[1,.32,.12],noise:.026,noiseMode:"high",pan:-.25},
 {code:"hibiscus-5-mgl",name:"Hibiscus",slug:"hibiscus",seconds:1.75,seed:211,notes:[392,493.88,659.25,783.99,987.77],step:.17,amp:.068,timbre:[1,.22,.08],noise:.021,noiseMode:"high",pan:.28},
 {code:"djembe-master-1v3jzkm",name:"Djembe Master",slug:"djembe-master",seconds:1.42,seed:307,notes:[122,175,118,204,94],step:.27,amp:.17,timbre:[1,.28,.1],noise:.19,noiseMode:"band",pan:0},
 {code:"palm-breeze-gknyt0",name:"Palm Breeze",slug:"palm-breeze",seconds:1.7,seed:401,notes:[659.25,880,1174.66,987.77],step:.3,amp:.05,timbre:[1,.28,.1],noise:.082,noiseMode:"band",pan:-.35},
 {code:"gamer-otter-100-mgl",name:"Gamer Otter",slug:"gamer-otter",seconds:1.35,seed:503,notes:[523.25,659.25,783.99,1046.5,783.99,659.25],step:.15,amp:.088,timbre:[1,.18,.06],noise:.012,noiseMode:"high",pan:0},
 {code:"live-island-rmn3mc",name:"LIVE Island",slug:"live-island",seconds:1.9,seed:601,notes:[392,493.88,587.33,783.99,659.25],step:.23,amp:.047,timbre:[1,.2,.06],noise:.14,noiseMode:"band",pan:-.4},
 {code:"crystal-crown-1itryeu",name:"Crystal Crown",slug:"crystal-crown",seconds:1.8,seed:701,notes:[523.25,659.25,783.99,1046.5,1318.51,1567.98],step:.16,amp:.06,timbre:[1,.42,.16,.05],noise:.024,noiseMode:"high",pan:.2},
 {code:"phoenix-wep6uk",name:"Phoenix",slug:"phoenix",seconds:1.9,seed:809,notes:[220,293.66,392,523.25,659.25],step:.19,amp:.063,timbre:[1,.24,.06],noise:.16,noiseMode:"band",pan:.1},
 {code:"beach-maracas-1exxoag",name:"Beach Maracas",slug:"beach-maracas",seconds:1.55,seed:907,notes:[261.63,392,523.25,659.25],step:.27,amp:.045,timbre:[1,.12],noise:.17,noiseMode:"high",pan:0},
 {code:"royal-lions-scepter-15000-mgl",name:"Royal Lions Scepter",slug:"royal-lions-scepter",seconds:1.85,seed:1009,notes:[196,293.66,392,587.33,783.99],step:.17,amp:.052,timbre:[1,.32,.12],noise:.10,noiseMode:"low",pan:0},
 {code:"baseball-orcdx9",name:"Baseball",slug:"baseball",seconds:1.25,seed:1103,notes:[392,493.88,587.33,783.99],step:.17,amp:.044,timbre:[1,.2],noise:.23,noiseMode:"band",pan:0}
];
function synth(g){
 const count=Math.ceil(rate*g.seconds),left=new Float32Array(count),right=new Float32Array(count);
 const pan=(p)=>{p=Math.max(-1,Math.min(1,p));return [Math.cos((p+1)*Math.PI/4),Math.sin((p+1)*Math.PI/4)];};
 function tone(start,duration,frequency,amplitude,position,tail=2){
  const first=Math.floor(start*rate),last=Math.min(count,Math.ceil((start+duration)*rate)),[l,r]=pan(position);
  let phase=(g.seed%991)/991*tau;
  for(let i=first;i<last;i++){
   const t=(i-first)/rate,progress=t/duration,hz=frequency*(1+.025*progress);
   phase+=tau*hz/rate;
   const env=Math.min(1,t/.008)*Math.min(1,Math.max(0,(duration-t)/Math.min(.45,duration*.62)))*Math.exp(-tail*t);
   let value=0;g.timbre.forEach((h,n)=>{value+=Math.sin(phase*(n+1))*h;});
   value*=amplitude*env;left[i]+=value*l;right[i]+=value*r;
  }
 }
 function noise(start,duration,amplitude,position,seed,mode){
  const first=Math.floor(start*rate),last=Math.min(count,Math.ceil((start+duration)*rate)),[l,r]=pan(position);
  let state=seed>>>0,low=0,band=0;
  for(let i=first;i<last;i++){
   state=(Math.imul(state,1664525)+1013904223)>>>0;
   const raw=state/2147483648-1;low+=.11*(raw-low);const high=raw-low;band+=.34*(high-band);
   const sample=mode==="high"?high:mode==="low"?low:band,t=(i-first)/rate;
   const env=Math.min(1,t/.003)*Math.min(1,Math.max(0,(duration-t)/.15))*Math.exp(-2.4*t);
   const value=sample*amplitude*env;left[i]+=value*l;right[i]+=value*r;
  }
 }
 if(g.slug==="djembe-master"){
  [0,.27,.52,.84].forEach((start,i)=>{tone(start,.24,122-i*4,.23-i*.02,(i%2?-.12:.12),15);noise(start,.19,.19-i*.02,i%2?.12:-.12,g.seed+i*31,"band");tone(start+.02,.12,260+i*13,.065,i%2?.2:-.2,19);});
 } else if(g.slug==="baseball"){
  tone(0,.28,138,.2,.06,12);noise(.015,.22,.24,-.08,g.seed,"band");
 } else if(g.slug==="beach-maracas"){
  [0,.17,.35,.54,.77,.99].forEach((start,i)=>noise(start,.17,.16-i*.012,i%2?.35:-.35,g.seed+i*23,"high"));
 } else if(g.slug==="palm-breeze"||g.slug==="live-island"){
  noise(.02,g.seconds-.18,g.noise,g.pan,g.seed,"band");
 } else if(g.slug==="phoenix"){
  noise(0,1.62,g.noise,g.pan,g.seed,"band");tone(.14,1.26,130,.052,0,.9);
 } else if(g.slug==="royal-lions-scepter"){
  noise(.02,.98,g.noise,-.2,g.seed,"low");tone(0,.55,94,.15,0,5);
 } else noise(.16,Math.min(g.seconds-.2,1.2),g.noise,g.pan,g.seed,g.noiseMode);
 g.notes.forEach((hz,i)=>{const start=(g.slug==="rose"?.08:.05)+i*g.step;const duration=Math.min(g.seconds-start-.04,g.slug==="gamer-otter"?.2:g.slug==="djembe-master"?.22:.74);if(duration>.04)tone(start,duration,hz,g.amp/(1+i*.1),g.pan+(i-(g.notes.length-1)/2)*.13,g.slug==="gamer-otter"?7:2.1);});
 const dryL=left.slice(),dryR=right.slice();
 for(const tap of [{delay:.047,gain:.10,cross:.22},{delay:.083,gain:.07,cross:.38},{delay:.137,gain:.045,cross:.15}]){
  const offset=Math.round(tap.delay*rate);
  for(let i=offset;i<count;i++){left[i]+=dryL[i-offset]*tap.gain*(1-tap.cross)+dryR[i-offset]*tap.gain*tap.cross;right[i]+=dryR[i-offset]*tap.gain*(1-tap.cross)+dryL[i-offset]*tap.gain*tap.cross;}
 }
 let peak=0;for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
 const gain=peak?Math.min(1.8,.88/peak):1,curve=Math.tanh(1.1);
 for(let i=0;i<count;i++){left[i]=Math.tanh(left[i]*gain*1.1)/curve;right[i]=Math.tanh(right[i]*gain*1.1)/curve;}
 return {left,right};
}
function wav(buffer){
 const frames=buffer.left.length,dataBytes=frames*channels*(bits/8),out=Buffer.alloc(44+dataBytes);
 out.write("RIFF",0);out.writeUInt32LE(36+dataBytes,4);out.write("WAVE",8);out.write("fmt ",12);
 out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(channels,22);out.writeUInt32LE(rate,24);
 out.writeUInt32LE(rate*channels*(bits/8),28);out.writeUInt16LE(channels*(bits/8),32);out.writeUInt16LE(bits,34);out.write("data",36);out.writeUInt32LE(dataBytes,40);
 let offset=44;for(let i=0;i<frames;i++)for(const channel of [buffer.left,buffer.right]){out.writeInt16LE(Math.round(Math.max(-.999969,Math.min(.999969,channel[i]))*32767),offset);offset+=2;}
 return out;
}
fs.mkdirSync(path.join(output,"gifts"),{recursive:true});
const records=gifts.map(g=>{
 const data=wav(synth(g)),filename=g.slug+".wav",file=path.join(output,"gifts",filename);fs.writeFileSync(file,data);
 const sha256=crypto.createHash("sha256").update(data).digest("hex");
 return {asset_id:"gift-sound-"+g.slug,gift_code:g.code,gift_name:g.name,filename:"gifts/"+filename,url:"/assets/gift-sounds/gifts/"+filename+"?v="+sha256.slice(0,12),format:"WAV",encoding:"PCM_S16LE",sample_rate_hz:rate,channels,bits_per_sample:bits,duration_ms:Math.round((data.length-44)/(rate*channels*(bits/8))*1000),bytes:data.length,sha256,license:"Original Minglora procedural composition; no third-party recordings or samples.",review_status:"generated-review-required",source:"scripts/generate-minglora-gift-sounds.mjs"};
});
const manifest={schema_version:1,generated_at:new Date().toISOString(),source:"Original gift-specific Minglora procedural compositions generated by this repository script.",format:{container:"WAV",codec:"PCM signed 16-bit little-endian",sample_rate_hz:rate,channels,bits_per_sample:bits},count:records.length,gifts:records};
fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Generated "+records.length+" original LIVE gift WAV cues at 44.1 kHz stereo.");
