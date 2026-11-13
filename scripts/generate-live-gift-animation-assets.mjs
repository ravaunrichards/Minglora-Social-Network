import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const SOURCE=path.join(ROOT,"assets/animations/gifts/animation-catalog.json");
const DIR=path.join(ROOT,"public/assets/animations/gifts/presets");
const INDEX=path.join(ROOT,"public/assets/animations/gifts/preset-index.json");
const OWNER="Minglora LIVE gift animation asset generator";
const IDS=["celebration-burst","cosmic-orbit","creature-entrance","delight-pop","gift-reveal","glam-spin","grand-entry","heart-pulse","horizon-sweep","nature-rise","petal-bloom","pixel-burst","power-impact","royal-shimmer","soundwave-ripple","spark-float","warm-wave"];
const check=process.argv.includes("--check");
function fail(message){throw new Error("[Minglora gift animations] "+message);}
function build(){
  const src=JSON.parse(fs.readFileSync(SOURCE,"utf8"));
  if(src.schema_version!==1||src.format!=="web-animations-keyframes"||!Array.isArray(src.presets))fail("invalid source catalogue schema.");
  const seen=new Set(),files=[];
  for(const p of src.presets){
    if(!p||!/^[a-z0-9-]{2,48}$/.test(String(p.id||""))||seen.has(p.id))fail("invalid or duplicate preset id.");
    seen.add(p.id);
    if(!p.label||!p.description||!Number.isInteger(p.duration_ms)||p.duration_ms<900||p.duration_ms>8000)fail("invalid preset metadata: "+p.id);
    if(!Array.isArray(p.category_targets)||!p.category_targets.length||!Array.isArray(p.keyframes)||p.keyframes.length<3)fail("missing targets/keyframes: "+p.id);
    let prior=-1;
    for(const f of p.keyframes){
      if(!Number.isFinite(f.offset)||f.offset<=prior||f.offset<0||f.offset>1||!Number.isFinite(f.opacity)||f.opacity<0||f.opacity>1)fail("invalid keyframe values: "+p.id);
      if(typeof f.transform!=="string"||f.transform.length>240||/url\\s*\\(/i.test(f.transform))fail("unsafe transform: "+p.id);
      if(typeof f.filter!=="string"||f.filter.length>120||/url\\s*\\(/i.test(f.filter))fail("unsafe filter: "+p.id);
      prior=f.offset;
    }
    if(p.keyframes[0].offset!==0||p.keyframes.at(-1).offset!==1)fail("keyframe range must span 0 to 1: "+p.id);
    if(p.reduced_motion?.respect_prefers_reduced_motion!==true||p.reduced_motion?.autoplay!==false)fail("reduced-motion metadata missing: "+p.id);
    files.push({path:path.join(DIR,p.id+".json"),content:JSON.stringify({schema_version:1,generator:OWNER,...p},null,2)+"\\n"});
  }
  if(JSON.stringify([...seen].sort())!==JSON.stringify(IDS))fail("supported preset IDs changed unexpectedly.");
  const index={schema_version:1,generator:OWNER,format:"web-animations-keyframes",preset_count:files.length,presets:src.presets.map(p=>({id:p.id,url:"/assets/animations/gifts/presets/"+p.id+".json",label:p.label,duration_ms:p.duration_ms,easing:p.easing}))};
  files.push({path:INDEX,content:JSON.stringify(index,null,2)+"\\n"});
  return files;
}
function main(){
  const files=build();
  if(check){
    for(const f of files){if(!fs.existsSync(f.path))fail("missing file: "+path.relative(ROOT,f.path));if(fs.readFileSync(f.path,"utf8")!==f.content)fail("stale file: "+path.relative(ROOT,f.path));}
    process.stdout.write("[Minglora gift animations] verified "+(files.length-1)+" individual presets.\\n");return;
  }
  for(const f of files)if(fs.existsSync(f.path)){
    let old;try{old=JSON.parse(fs.readFileSync(f.path,"utf8"));}catch{fail("refusing to replace non-JSON file: "+f.path);}
    if(old.generator!==OWNER)fail("refusing to replace file owned by another generator: "+f.path);
  }
  for(const f of files){fs.mkdirSync(path.dirname(f.path),{recursive:true});const tmp=f.path+".tmp-"+process.pid;fs.writeFileSync(tmp,f.content,{encoding:"utf8",flag:"w"});fs.renameSync(tmp,f.path);}
  process.stdout.write("[Minglora gift animations] generated "+(files.length-1)+" individual presets.\\n");
}
main();
