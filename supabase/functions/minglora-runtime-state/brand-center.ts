const BRAND_BUCKET = "minglora-brand-assets";
const BRAND_MIME_EXTENSIONS: Record<string,string> = {
  "image/svg+xml":"svg",
  "image/apng":"png",
  "image/png":"png",
  "image/jpeg":"jpg",
  "image/webp":"webp",
  "image/gif":"gif",
  "image/vnd.microsoft.icon":"ico",
  "image/x-icon":"ico",
  "application/json":"json",
  "video/mp4":"mp4",
  "video/webm":"webm"
};

const brandJson = (status:number, body:Record<string,unknown>) => new Response(
  JSON.stringify(body),
  {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}
);

const brandErrorStatus = (error:any) => {
  const code=String(error?.code||"");
  return code==="42501"?403:code==="P0002"?404:
    ["22023","22P02","23514","23505"].includes(code)?400:503;
};

async function brandRpc(admin:any,actorUserId:string,action:string,payload:Record<string,unknown>={}) {
  const {data,error}=await admin.rpc("minglora_admin_brand_command",{
    p_actor_user_id:actorUserId,p_mfa_verified:true,p_action:action,p_payload:payload
  });
  if(error)throw error;
  return data;
}

async function signBrandPath(admin:any,path:string,expiresIn=600) {
  const {data,error}=await admin.storage.from(BRAND_BUCKET).createSignedUrl(path,expiresIn);
  if(error||!data?.signedUrl)throw Object.assign(new Error("Minglora could not create a private logo preview."),{status:502});
  return data.signedUrl;
}

function isBrandSignatureValid(mimeType:string,bytes:Uint8Array) {
  const starts=(values:number[])=>values.every((v,i)=>bytes[i]===v);
  const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  if(mimeType==="image/png"||mimeType==="image/apng")return starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if(mimeType==="image/jpeg")return starts([0xff,0xd8,0xff]);
  if(mimeType==="image/webp")return ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP";
  if(mimeType==="image/gif")return ["GIF87a","GIF89a"].includes(ascii(0,6));
  if(mimeType==="image/vnd.microsoft.icon"||mimeType==="image/x-icon")return starts([0,0,1,0]);
  if(mimeType==="video/mp4")return ascii(4,8)==="ftyp";
  if(mimeType==="video/webm")return starts([0x1a,0x45,0xdf,0xa3]);
  if(mimeType==="image/svg+xml") {
    const source=new TextDecoder().decode(bytes).replace(/^\uFEFF/,"").trimStart();
    return /^(?:<\?xml[\s\S]*?\?>\s*)?<svg(?:\s|>)/i.test(source)
      && !/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(source);
  }
  return false;
}

export async function handleBrandRuntimeAction(action:string,input:Record<string,any>,admin:any):Promise<Response|null> {
  if(!action.startsWith("admin_brand_") && action!=="brand_public_manifest")return null;

  if(action==="brand_public_manifest") {
    try {
      const {data,error}=await admin.rpc("minglora_brand_public_manifest");
      if(error)throw error;
      const placements=Array.isArray(data?.placements)?data.placements:[];
      const safe=await Promise.all(placements.map(async (item:any)=>{
        try {
          return {
            placementKey:String(item.placementKey||""),
            assetId:String(item.assetId||""),
            versionId:String(item.versionId||""),
            title:String(item.title||""),
            mimeType:String(item.mimeType||""),
            url:await signBrandPath(admin,String(item.storagePath||""),3600)
          };
        } catch { return null; }
      }));
      return brandJson(200,{placements:safe.filter(Boolean),updatedAt:data?.updatedAt||null});
    } catch(error) {
      return brandJson(503,{error:"The published Minglora brand manifest is temporarily unavailable."});
    }
  }

  const actorUserId=String(input.actorUserId||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)||input.mfaVerified!==true) {
    return brandJson(403,{error:"A signed-in, MFA-verified Minglora administrator session is required."});
  }
  if(!admin)return brandJson(503,{error:"Minglora brand storage is not configured."});

  if(action==="admin_brand_upload_prepare") {
    const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload:{};
    const mimeType=String(payload.mimeType||"").toLowerCase();
    const byteSize=Number(payload.byteSize||0);
    if(!BRAND_MIME_EXTENSIONS[mimeType]||!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>52428800) {
      return brandJson(400,{error:"Choose an approved logo format up to 50 MB."});
    }
    const {data:bucket,error:bucketError}=await admin.storage.getBucket(BRAND_BUCKET);
    if(bucketError||!bucket||bucket.public!==false) {
      return brandJson(503,{error:"The dedicated brand asset bucket is missing or not private. No upload was started."});
    }
    try {
      const prepared=await brandRpc(admin,actorUserId,"upload_prepare",{
        ...payload,fileFormat:BRAND_MIME_EXTENSIONS[mimeType]
      });
      const {data:upload,error}=await admin.storage.from(BRAND_BUCKET).createSignedUploadUrl(String(prepared.path),{upsert:false});
      if(error||!upload?.signedUrl||!upload?.token) {
        return brandJson(502,{error:"Minglora could not prepare a one-time logo upload."});
      }
      return brandJson(201,{
        assetId:prepared.assetId,versionId:prepared.versionId,versionNumber:prepared.versionNumber,
        bucket:BRAND_BUCKET,path:prepared.path,signedUrl:upload.signedUrl,token:upload.token,
        mimeType,byteSize
      });
    } catch(error) {
      return brandJson(brandErrorStatus(error),{error:String(error?.message||"Logo upload could not be prepared.").slice(0,240)});
    }
  }

  if(action==="admin_brand_upload_complete") {
    const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload:{};
    const assetId=String(payload.assetId||"");
    const versionId=String(payload.versionId||"");
    try {
      const session=await brandRpc(admin,actorUserId,"upload_session_get",{assetId,versionId});
      const path=String(session.path||"");
      const folder=path.slice(0,path.lastIndexOf("/"));
      const objectName=path.slice(path.lastIndexOf("/")+1);
      if(!path.startsWith("owner/"+actorUserId+"/")||!objectName||objectName.includes("..")) {
        return brandJson(400,{error:"Invalid logo upload reference."});
      }
      const {data:objects,error:listError}=await admin.storage.from(BRAND_BUCKET).list(folder,{search:objectName,limit:5});
      const found=(objects||[]).find((item:any)=>item.name===objectName);
      if(listError||!found)return brandJson(409,{error:"The logo upload has not completed in private Storage."});
      const meta=found.metadata||{};
      const actualSize=Number(meta.size??meta.contentLength??session.byteSize);
      const actualType=String(meta.mimetype??meta.contentType??session.mimeType).toLowerCase();
      if(actualSize!==Number(session.byteSize)||actualType!==String(session.mimeType).toLowerCase()) {
        return brandJson(409,{error:"The uploaded logo's size or content type does not match its prepared upload."});
      }
      const {data:probe,error:probeError}=await admin.storage.from(BRAND_BUCKET).createSignedUrl(path,90);
      if(probeError||!probe?.signedUrl)return brandJson(502,{error:"Minglora could not inspect the uploaded logo."});
      let signatureResponse:Response;
      try { signatureResponse=await fetch(probe.signedUrl,{headers:{Range:"bytes=0-4095"}}); }
      catch { return brandJson(502,{error:"Minglora could not inspect the uploaded logo contents."}); }
      if(signatureResponse.status!==206) {
        await signatureResponse.body?.cancel();
        return brandJson(502,{error:"Private Storage did not return a bounded logo signature check."});
      }
      const prefix=new Uint8Array(await signatureResponse.arrayBuffer());
      if(session.mimeType==="application/json") {
        const {data:fullUrl,error:fullUrlError}=await admin.storage.from(BRAND_BUCKET).createSignedUrl(path,90);
        if(fullUrlError||!fullUrl?.signedUrl)return brandJson(502,{error:"Minglora could not validate the Lottie JSON file."});
        const response=await fetch(fullUrl.signedUrl);
        if(!response.ok||Number(response.headers.get("content-length")||0)>52428800)return brandJson(502,{error:"The Lottie file could not be safely read."});
        const body=await response.text();
        let animation:any=null;
        try { animation=JSON.parse(body); } catch {}
        if(!animation||typeof animation!=="object"||!Array.isArray(animation.layers)||typeof animation.v!=="string") {
          return brandJson(415,{error:"The JSON file is not a valid Lottie animation."});
        }
      } else if(!isBrandSignatureValid(String(session.mimeType),prefix)) {
        return brandJson(415,{error:"The uploaded file contents do not match the selected logo format. The private original was retained for review."});
      }
      const width=Number(payload.width||0);
      const height=Number(payload.height||0);
      const durationMs=Number(payload.durationMs||0);
      const result=await brandRpc(admin,actorUserId,"upload_complete",{
        assetId,versionId,
        width:Number.isSafeInteger(width)&&width>0&&width<=50000?width:null,
        height:Number.isSafeInteger(height)&&height>0&&height<=50000?height:null,
        durationMs:Number.isSafeInteger(durationMs)&&durationMs>=0?durationMs:null
      });
      const previewUrl=await signBrandPath(admin,path,600);
      return brandJson(200,{...result,previewUrl});
    } catch(error) {
      return brandJson(brandErrorStatus(error),{error:String(error?.message||"Logo upload verification failed.").slice(0,240)});
    }
  }

  if(action==="admin_brand_asset_url") {
    const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload:{};
    try {
      const reference=await brandRpc(admin,actorUserId,"asset_url",payload);
      return brandJson(200,{url:await signBrandPath(admin,String(reference.path||""),600)});
    } catch(error) {
      return brandJson(brandErrorStatus(error),{error:String(error?.message||"Logo preview is unavailable.").slice(0,240)});
    }
  }

  if(action==="admin_brand_command") {
    const brandAction=String(input.brandAction||"").trim().toLowerCase();
    const allowed=new Set([
      "list","category_create","collection_create","asset_update","asset_status","favorite_toggle",
      "asset_approve","assignment_set","assignment_publish","assignment_rollback",
      "schedule_create","schedule_cancel","identity_update","asset_url","version_restore"
    ]);
    if(!allowed.has(brandAction))return brandJson(400,{error:"Choose a supported Logo Center action."});
    const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload:{};
    try {
      if(["assignment_set","assignment_publish","assignment_rollback"].includes(brandAction)) {
        const assignmentAction=brandAction==="assignment_set"?"prepare":brandAction==="assignment_publish"?"publish":"rollback";
        const {data,error}=await admin.rpc("minglora_brand_assignment_command",{
          p_actor_user_id:actorUserId,p_mfa_verified:true,p_action:assignmentAction,p_payload:payload
        });
        if(error)throw error;
        return brandJson(200,data&&typeof data==="object"?data:{ok:true});
      }
      if(brandAction==="schedule_create") {
        const {data,error}=await admin.rpc("minglora_brand_logo_schedule_create",{
          p_actor_user_id:actorUserId,p_mfa_verified:true,p_payload:payload
        });
        if(error)throw error;
        return brandJson(200,data&&typeof data==="object"?data:{ok:true});
      }
      if(brandAction==="version_restore") {
        const {data,error}=await admin.rpc("minglora_brand_logo_restore_version",{
          p_actor_user_id:actorUserId,p_mfa_verified:true,p_asset_id:String(payload.assetId||""),p_version_id:String(payload.versionId||"")
        });
        if(error)throw error;
        return brandJson(200,data&&typeof data==="object"?data:{ok:true});
      }
      const result=await brandRpc(admin,actorUserId,brandAction,payload);
      if(brandAction==="list") {
        const assets=Array.isArray(result?.assets)?result.assets:[];
        const versions=Array.isArray(result?.versions)?result.versions:[];
        const signedAssets=await Promise.all(assets.map(async (item:any)=>{
          let previewUrl=null;
          try { previewUrl=await signBrandPath(admin,String(item.storage_path||""),600); } catch {}
          const copy={...item,previewUrl};
          delete copy.storage_path;
          delete copy.storage_bucket;
          return copy;
        }));
        const signedVersions=await Promise.all(versions.map(async (item:any)=>{
          let previewUrl=null;
          try { previewUrl=await signBrandPath(admin,String(item.storage_path||""),600); } catch {}
          const copy={...item,previewUrl};
          delete copy.storage_path;
          delete copy.storage_bucket;
          return copy;
        }));
        return brandJson(200,{...result,assets:signedAssets,versions:signedVersions});
      }
      if(brandAction==="asset_url") {
        return brandJson(200,{url:await signBrandPath(admin,String(result.path||""),600)});
      }
      return brandJson(200,result&&typeof result==="object"?result:{ok:true});
    } catch(error) {
      return brandJson(brandErrorStatus(error),{error:String(error?.message||"Logo Center action failed.").slice(0,240)});
    }
  }

  return brandJson(400,{error:"Unsupported Minglora brand runtime action."});
}
