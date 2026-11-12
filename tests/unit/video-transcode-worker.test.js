import test from "node:test";
import assert from "node:assert/strict";
import {readWorkerConfig,validateStorageUrl,buildFfmpegArgs} from "../../backend/workers/video/worker.js";
const env={SUPABASE_URL:"https://minglora.supabase.co",SUPABASE_STATE_API_URL:"https://minglora.supabase.co/functions/v1/minglora-runtime-state",SUPABASE_PUBLISHABLE_KEY:"pub",MINGLORA_VIDEO_WORKER_API_KEY:"x".repeat(48)};
test("worker requires private Minglora Edge gateway configuration",()=>{
 assert.equal(readWorkerConfig(env).pollMs,5000);
 assert.throws(()=>readWorkerConfig({...env,MINGLORA_VIDEO_WORKER_API_KEY:""}),/MINGLORA_VIDEO_WORKER_API_KEY/);
 assert.throws(()=>readWorkerConfig({...env,SUPABASE_STATE_API_URL:"http://elsewhere"}),/HTTPS runtime gateway/);
});
test("worker only accepts short-lived signed Storage URLs from its own project",()=>{
 const base=new URL(env.SUPABASE_URL);
 assert.equal(validateStorageUrl("https://minglora.supabase.co/storage/v1/object/sign/b/a?token=x",base).hostname,"minglora.supabase.co");
 assert.equal(validateStorageUrl("https://minglora.supabase.co/storage/v1/object/upload/sign/b/a?token=x",base,"upload").hostname,"minglora.supabase.co");
 assert.throws(()=>validateStorageUrl("https://other.example/storage/v1/object/sign/b/a?token=x",base),/outside the configured/);
 assert.throws(()=>validateStorageUrl("https://minglora.supabase.co/storage/v1/object/sign/b/a",base),/short-lived signed/);
});
test("FFmpeg produces an isolated, bounded 720p H.264/AAC derivative",()=>{
 const args=buildFfmpegArgs("/tmp/source.bin","/tmp/720p.mp4");
 for(const item of ["libx264","aac","+faststart","-t"])assert.ok(args.includes(item));
 assert.equal(args.at(-1),"/tmp/720p.mp4");
});
