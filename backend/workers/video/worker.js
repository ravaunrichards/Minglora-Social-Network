import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {createReadStream,createWriteStream} from "node:fs";
import {mkdtemp,rm,stat} from "node:fs/promises";
import {Readable,Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {pathToFileURL} from "node:url";

const MAX_BYTES=500*1024*1024, MAX_DURATION_MS=3600000;
export function readWorkerConfig(env=process.env){
 const required=["SUPABASE_URL","SUPABASE_STATE_API_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_STATE_API_KEY"];
 const missing=required.filter(key=>!String(env[key]||"").trim());
 if(missing.length)throw new Error("Missing worker configuration: "+missing.join(", "));
 const supabaseUrl=new URL(env.SUPABASE_URL),stateApiUrl=new URL(env.SUPABASE_STATE_API_URL);
 if(supabaseUrl.protocol!=="https:"||stateApiUrl.protocol!=="https:"||supabaseUrl.hostname!==stateApiUrl.hostname||
  !stateApiUrl.pathname.endsWith("/functions/v1/minglora-runtime-state"))
  throw new Error("Worker Supabase URLs must use the Minglora HTTPS runtime gateway on the same project host.");
 return {supabaseUrl,stateApiUrl,publishableKey:String(env.SUPABASE_PUBLISHABLE_KEY).trim(),
  stateApiKey:String(env.SUPABASE_STATE_API_KEY).trim(),ffmpegPath:env.FFMPEG_PATH||"ffmpeg",
  ffprobePath:env.FFPROBE_PATH||"ffprobe",pollMs:Math.max(1000,Math.min(30000,Number(env.VIDEO_WORKER_POLL_MS)||5000)),
  tempDirectory:env.VIDEO_WORKER_TEMP_DIR||os.tmpdir()};
}
export function validateStorageUrl(value,supabaseUrl,kind="download"){
 const url=new URL(value),base=supabaseUrl instanceof URL?supabaseUrl:new URL(supabaseUrl);
 if(url.protocol!=="https:"||url.hostname!==base.hostname||url.port)throw new Error("Storage URL is outside the configured Minglora Supabase project.");
 const expected=kind==="upload"?"/storage/v1/object/upload/sign/":"/storage/v1/object/sign/";
 if(!url.pathname.includes(expected)||!url.searchParams.has("token"))throw new Error("Storage URL is not a valid short-lived signed "+kind+" URL.");
 return url;
}
export function buildFfmpegArgs(input,output){return [
 "-nostdin","-hide_banner","-loglevel","error","-i",input,"-map","0:v:0","-map","0:a?",
 "-vf","scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
 "-c:v","libx264","-preset","veryfast","-crf","25","-maxrate","2500k","-bufsize","5000k","-pix_fmt","yuv420p",
 "-c:a","aac","-b:a","128k","-ac","2","-map_metadata","-1","-movflags","+faststart",
 "-max_muxing_queue_size","1024","-t","3600","-y",output
];}
async function runBinary(binary,args,timeoutMs){
 const child=spawn(binary,args,{stdio:["ignore","pipe","pipe"]});let stdout="",stderr="",timedOut=false;
 child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
 child.stdout.on("data",chunk=>{if(stdout.length<12000)stdout+=chunk;});
 child.stderr.on("data",chunk=>{if(stderr.length<12000)stderr+=chunk;});
 const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},timeoutMs);
 try{
  const [code,signal]=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(c,s)=>resolve([c,s]));});
  if(timedOut)throw new Error("Media processor exceeded its time limit.");
  if(code!==0)throw new Error("Media processor exited ("+(signal||code)+"): "+stderr.slice(-1200));
  return stdout;
 }finally{clearTimeout(timer);}
}
async function downloadSource(url,destination,config,fetchImpl){
 validateStorageUrl(url,config.supabaseUrl,"download");
 const response=await fetchImpl(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok||!response.body)throw new Error("Original video download failed ("+response.status+").");
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)throw new Error("Original video exceeds 500 MB.");
 let bytes=0;const limit=new Transform({transform(chunk,enc,cb){bytes+=chunk.length;cb(bytes>MAX_BYTES?new Error("Original video exceeds 500 MB."):null,bytes>MAX_BYTES?undefined:chunk);}});
 await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(destination,{flags:"wx"}));
 if(!bytes)throw new Error("Original video download was empty.");return bytes;
}
async function probeDuration(file,config){
 const seconds=Number((await runBinary(config.ffprobePath,["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file],30000)).trim());
 const ms=Math.round(seconds*1000);if(!Number.isFinite(seconds)||ms<1000||ms>MAX_DURATION_MS)throw new Error("Video duration must be between 1 second and 60 minutes.");return ms;
}
async function uploadRendition(url,file,config,fetchImpl){
 validateStorageUrl(url,config.supabaseUrl,"upload");const info=await stat(file);
 if(!info.isFile()||info.size<1||info.size>MAX_BYTES)throw new Error("Encoded rendition is empty or exceeds 500 MB.");
 const response=await fetchImpl(url,{method:"PUT",headers:{"Content-Type":"video/mp4","x-upsert":"true","Cache-Control":"3600"},
  body:Readable.toWeb(createReadStream(file)),duplex:"half",signal:AbortSignal.timeout(300000)});
 const message=await response.text().catch(()=>"");if(!response.ok)throw new Error("Rendition upload failed ("+response.status+"): "+message.slice(0,300));return info.size;
}
async function gateway(action,payload,config,fetchImpl){
 const response=await fetchImpl(config.stateApiUrl,{method:"POST",headers:{apikey:config.publishableKey,
  "x-minglora-api-key":config.stateApiKey,"content-type":"application/json"},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(String(data.error||"Minglora video gateway failed ("+response.status+")."));return data;
}
export async function processVideoJob(job,config,fetchImpl=fetch){
 if(!job?.id||!job?.lock_token||!job?.source_url||!job?.upload_url||!job?.source_path||!job?.output_path)throw new Error("Claimed video job is incomplete.");
 const dir=await mkdtemp(path.join(config.tempDirectory,"minglora-video-")),source=path.join(dir,"source.bin"),output=path.join(dir,"720p.mp4");
 try{
  const sourceBytes=await downloadSource(job.source_url,source,config,fetchImpl),durationMs=await probeDuration(source,config);
  await runBinary(config.ffmpegPath,buildFfmpegArgs(source,output),10*60*1000);
  const outputBytes=await uploadRendition(job.upload_url,output,config,fetchImpl);
  await gateway("video_transcode_complete",{jobId:job.id,lockToken:job.lock_token,outputByteSize:outputBytes,durationMs},config,fetchImpl);
  return {jobId:job.id,sourceBytes,outputBytes,durationMs};
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function main(){
 const config=readWorkerConfig();let stopping=false;
 process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
 process.stdout.write("[Minglora video worker] Started; concurrency=1.\n");
 while(!stopping){
  try{
   const claim=await gateway("video_transcode_claim",{},config,fetch);const job=claim.job;
   if(!job){await new Promise(r=>setTimeout(r,config.pollMs));continue;}
   try{
    const result=await processVideoJob(job,config,fetch);
    process.stdout.write("[Minglora video worker] Completed "+result.jobId+" ("+result.outputBytes+" bytes).\n");
   }catch(error){
    try{await gateway("video_transcode_fail",{jobId:job.id,lockToken:job.lock_token,error:String(error?.message||error).slice(0,500)},config,fetch);}catch{}
    process.stderr.write("[Minglora video worker] Job "+job.id+" failed: "+String(error?.message||error).slice(0,400)+"\n");
   }
  }catch(error){process.stderr.write("[Minglora video worker] Poll failed: "+String(error?.message||error).slice(0,300)+"\n");await new Promise(r=>setTimeout(r,config.pollMs));}
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(error=>{process.stderr.write("[Minglora video worker] Startup failed: "+String(error?.message||error)+"\n");process.exitCode=1;});
}
