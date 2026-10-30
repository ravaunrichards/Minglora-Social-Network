import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const adminKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = SUPABASE_URL && adminKey
  ? createClient(SUPABASE_URL, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  : null;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!admin) return json(503, { error: "Supabase runtime is not configured." });

  const supplied = req.headers.get("x-minglora-api-key") || "";
  if (!supplied || supplied.length < 40) return json(401, { error: "Unauthorized." });

  const { data: credential, error: credentialError } = await admin
    .from("minglora_runtime_api_secrets")
    .select("secret_sha256")
    .eq("name", "render_runtime")
    .maybeSingle();

  if (credentialError || !credential?.secret_sha256) {
    return json(503, { error: "Runtime authorization is unavailable." });
  }
  const suppliedHash = await sha256(supplied);
  if (!constantTimeEqual(suppliedHash, credential.secret_sha256)) {
    return json(401, { error: "Unauthorized." });
  }

  const length = Number(req.headers.get("content-length") || 0);
  const maxBodyBytes = 12 * 1024 * 1024;
  if (length > maxBodyBytes) return json(413, { error: "Request is too large." });
  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    const rawBytes = new TextEncoder().encode(raw).byteLength;
    if (rawBytes > maxBodyBytes) return json(413, { error: "Request is too large." });
    input = JSON.parse(raw);
    if (input?.action !== "media_upload" && rawBytes > 1_000_000) {
      return json(413, { error: "Request is too large." });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return json(400, { error: "Invalid request." });
    }
  } catch {
    return json(400, { error: "Invalid JSON request." });
  }

  const action = input.action;
  if (!["load", "save", "health", "media_upload", "media_sign", "media_upload_prepare", "media_upload_complete"].includes(String(action))) {
    return json(400, { error: "Unsupported action." });
  }

  if (action === "media_upload_prepare") {
    const ownerId=String(input.ownerId||"");
    const slot=String(input.slot||"");
    const mimeType=String(input.mimeType||"").toLowerCase();
    const byteSize=Number(input.byteSize||0);
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const image={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"};
    const post={...image,"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","model/gltf-binary":"glb"};
    const story={...image,"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"};
    const allowed=slot==="avatar"||slot==="cover"?image:slot==="post"?post:slot==="story"?story:{};
    const bucket=slot==="avatar"?"minglora-avatars":slot==="cover"?"minglora-covers":slot==="post"?"minglora-post-media":slot==="story"?"minglora-stories":"";
    const maxBytes=slot==="avatar"?10*1024*1024:slot==="cover"?20*1024*1024:slot==="story"?200*1024*1024:slot==="post"?500*1024*1024:0;
    if(!uuidPattern.test(ownerId)||!bucket||!allowed[mimeType]||!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>maxBytes){
      return json(400,{error:"The selected file type or size is not allowed for this media area."});
    }
    const mediaType=mimeType.startsWith("image/")?"image":mimeType.startsWith("video/")?"video":mimeType.startsWith("audio/")?"audio":"model3d";
    const objectPath=`${ownerId}/${crypto.randomUUID()}.${allowed[mimeType]}`;
    const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(objectPath,{upsert:false});
    if(error||!data?.token)return json(502,{error:"Minglora could not prepare a secure upload."});
    const supabaseHost=new URL(SUPABASE_URL);
    const projectRef=supabaseHost.hostname.split(".")[0];
    const endpoint=`${supabaseHost.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
    return json(201,{bucket,path:objectPath,mimeType,mediaType,byteSize,token:data.token,endpoint});
  }

  if (action === "media_upload_complete") {
    const ownerId=String(input.ownerId||"");
    const bucket=String(input.bucket||"");
    const objectPath=String(input.path||"");
    const mimeType=String(input.mimeType||"").toLowerCase();
    const byteSize=Number(input.byteSize||0);
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const bucketSlots:Record<string,string[]>={
      "minglora-avatars":["image/jpeg","image/png","image/webp","image/avif"],
      "minglora-covers":["image/jpeg","image/png","image/webp","image/avif"],
      "minglora-post-media":["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime","audio/mpeg","audio/mp4","audio/ogg","audio/webm","model/gltf-binary"],
      "minglora-stories":["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime"]
    };
    const folder=objectPath.slice(0,objectPath.lastIndexOf("/"));
    const objectName=objectPath.slice(objectPath.lastIndexOf("/")+1);
    if(!uuidPattern.test(ownerId)||!bucketSlots[bucket]?.includes(mimeType)||folder!==ownerId||!objectName||objectName.includes("..")||!Number.isSafeInteger(byteSize)||byteSize<1){
      return json(400,{error:"Invalid media completion reference."});
    }
    const {data:objects,error:listError}=await admin.storage.from(bucket).list(folder,{search:objectName,limit:10});
    const found=(objects||[]).find((item:any)=>item.name===objectName);
    if(listError||!found)return json(409,{error:"The upload is not complete. Please retry the upload."});
    const meta=found.metadata||{};
    const storedSize=Number(meta.size??meta.contentLength??byteSize);
    const storedType=String(meta.mimetype||meta.contentType||mimeType).toLowerCase();
    if(storedSize!==byteSize||storedType!==mimeType)return json(409,{error:"The uploaded file did not match the expected size or type."});
    const mediaType=mimeType.startsWith("image/")?"image":mimeType.startsWith("video/")?"video":mimeType.startsWith("audio/")?"audio":"model3d";
    const result:Record<string,unknown>={bucket,path:objectPath,mimeType,mediaType,byteSize};
    if(bucket==="minglora-avatars"||bucket==="minglora-covers"){
      const {data}=admin.storage.from(bucket).getPublicUrl(objectPath);result.url=data.publicUrl;
    }else{
      const {data,error}=await admin.storage.from(bucket).createSignedUrl(objectPath,3600);
      if(error||!data?.signedUrl)return json(502,{error:"The upload completed but Minglora could not prepare a preview."});
      result.signedUrl=data.signedUrl;
    }
    return json(200,result);
  }

  if (action === "media_upload") {
    const ownerId = String(input.ownerId || "");
    const slot = String(input.slot || "");
    const mimeType = String(input.mimeType || "").toLowerCase();
    const base64 = String(input.base64 || "");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const imageExtensions: Record<string,string> = {
      "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"
    };
    const postExtensions: Record<string,string> = {
      ...imageExtensions,
      "video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","audio/mpeg":"mp3","audio/mp4":"m4a",
      "audio/ogg":"ogg","audio/webm":"webm","model/gltf-binary":"glb"
    };
    const storyExtensions: Record<string,string> = {
      ...imageExtensions,"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"
    };
    const extensions = slot === "avatar" || slot === "cover" ? imageExtensions
      : slot === "post" ? postExtensions : slot === "story" ? storyExtensions : {};
    const bucket = slot === "avatar" ? "minglora-avatars"
      : slot === "cover" ? "minglora-covers"
      : slot === "post" ? "minglora-post-media"
      : slot === "story" ? "minglora-stories" : "";
    const maxBytes = 8 * 1024 * 1024;
    if (!uuidPattern.test(ownerId) || !bucket || !extensions[mimeType] ||
        !base64 || base64.length > Math.ceil(maxBytes * 4 / 3) + 8 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return json(400, { error: "Choose a supported image, video, audio or GLB file." });
    }
    let binary: string;
    try { binary = atob(base64); } catch {
      return json(400, { error: "The selected file could not be decoded." });
    }
    if (!binary.length || binary.length > maxBytes) {
      return json(413, { error: "Each media file must be 8 MB or smaller." });
    }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const hasPrefix = (prefix: number[]) => prefix.every((value,index)=>bytes[index]===value);
    const ascii = (start:number,end:number) => String.fromCharCode(...bytes.slice(start,end));
    const imageValid =
      (mimeType==="image/jpeg"&&hasPrefix([0xff,0xd8,0xff])) ||
      (mimeType==="image/png"&&hasPrefix([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) ||
      (mimeType==="image/webp"&&ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP") ||
      (mimeType==="image/avif"&&ascii(4,8)==="ftyp"&&["avif","avis","mif1"].includes(ascii(8,12)));
    const mediaValid =
      (["video/mp4","video/quicktime"].includes(mimeType)&&ascii(4,8)==="ftyp") ||
      (mimeType==="video/webm"&&hasPrefix([0x1a,0x45,0xdf,0xa3])) ||
      (mimeType==="audio/mpeg"&&ascii(0,3)==="ID3") ||
      (mimeType==="audio/mp4"&&ascii(4,8)==="ftyp") ||
      (mimeType==="audio/ogg"&&ascii(0,4)==="OggS") ||
      (mimeType==="audio/webm"&&hasPrefix([0x1a,0x45,0xdf,0xa3])) ||
      (mimeType==="model/gltf-binary"&&ascii(0,4)==="glTF");
    if (!imageValid && !mediaValid) {
      return json(415, { error: "The file contents do not match the selected media type." });
    }
    const objectPath = `${ownerId}/${crypto.randomUUID()}.${extensions[mimeType]}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(objectPath,bytes,{
      contentType:mimeType,cacheControl:"3600",upsert:false
    });
    if(uploadError)return json(502,{error:"Minglora could not store the selected media."});
    const mediaType=mimeType.startsWith("image/")?"image":mimeType.startsWith("video/")?"video":mimeType.startsWith("audio/")?"audio":"model3d";
    const result: Record<string,unknown> = {
      bucket,path:objectPath,mimeType,mediaType,byteSize:bytes.byteLength
    };
    if(bucket==="minglora-avatars"||bucket==="minglora-covers"){
      const {data}=admin.storage.from(bucket).getPublicUrl(objectPath);
      result.url=data.publicUrl;
    } else {
      const {data,error}=await admin.storage.from(bucket).createSignedUrl(objectPath,3600);
      if(error)return json(502,{error:"The uploaded media could not be prepared for viewing."});
      result.signedUrl=data.signedUrl;
    }
    return json(201,result);
  }

  if (action === "media_sign") {
    const ownerId=String(input.ownerId||"");
    const bucket=String(input.bucket||"");
    const objectPath=String(input.path||"");
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!uuidPattern.test(ownerId)||!["minglora-post-media","minglora-stories","minglora-avatars","minglora-covers"].includes(bucket)||!objectPath.startsWith(ownerId+"/")||objectPath.includes("..")){
      return json(400,{error:"Invalid media reference."});
    }
    if(bucket==="minglora-avatars"||bucket==="minglora-covers"){
      const {data}=admin.storage.from(bucket).getPublicUrl(objectPath);
      return json(200,{url:data.publicUrl});
    }
    const {data,error}=await admin.storage.from(bucket).createSignedUrl(objectPath,3600);
    if(error||!data?.signedUrl)return json(404,{error:"Media is unavailable."});
    return json(200,{url:data.signedUrl});
  }

  if (action === "load" || action === "health") {
    const { data, error } = await admin
      .from("minglora_runtime_state")
      .select(action === "load" ? "state,revision" : "revision")
      .eq("state_key", "primary")
      .maybeSingle();

    if (error || !data) return json(503, { error: "Supabase application state is unavailable." });
    return action === "load"
      ? json(200, { state: data.state, revision: data.revision })
      : json(200, { ok: true, revision: data.revision });
  }

  const state = input.state;
  const expectedRevision = Number(input.expectedRevision);
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return json(400, { error: "Invalid state payload or revision." });
  }

  const { data, error } = await admin
    .from("minglora_runtime_state")
    .update({
      state,
      revision: expectedRevision + 1,
      updated_at: new Date().toISOString()
    })
    .eq("state_key", "primary")
    .eq("revision", expectedRevision)
    .select("revision")
    .maybeSingle();

  if (error) return json(503, { error: "Supabase could not save application state." });
  if (!data) return json(409, { error: "State revision conflict; reload before saving." });
  return json(200, { ok: true, revision: data.revision });
});
