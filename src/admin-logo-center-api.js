import crypto from "node:crypto";

const BRAND_MIME_EXTENSIONS = Object.freeze({
  "image/svg+xml":"svg",
  "image/png":"png",
  "image/apng":"png",
  "image/jpeg":"jpg",
  "image/webp":"webp",
  "image/gif":"gif",
  "image/vnd.microsoft.icon":"ico",
  "image/x-icon":"ico",
  "application/json":"json",
  "video/mp4":"mp4",
  "video/webm":"webm"
});
const BRAND_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const BRAND_ACTIONS = new Set([
  "category_create","collection_create","asset_update","asset_status","favorite_toggle",
  "asset_approve","assignment_set","assignment_publish","assignment_rollback",
  "schedule_create","schedule_cancel","identity_update","version_restore"
]);

export async function handleAdminLogoCenterApi(context) {
  const {
    method, path:requestPath, url, input, user, req, res, json, isSameOriginApiWrite,
    hasActiveBrandMfaSession, AUTH_PROVIDER, isSupabasePersistence, requestSupabaseState
  } = context;
  const respond = (...args) => { json(...args); return true; };

  if (requestPath === "/api/brand/manifest" && method === "GET") {
    try {
      if (AUTH_PROVIDER !== "supabase" || !isSupabasePersistence()) {
        return respond(res,200,{placements:[],updatedAt:null},{"Cache-Control":"no-store"});
      }
      const manifest=await requestSupabaseState("brand_public_manifest");
      if (manifest?.skipped) return respond(res,200,{placements:[],updatedAt:null},{"Cache-Control":"no-store"});
      return respond(res,200,manifest,{"Cache-Control":"no-store"});
    } catch {
      return respond(res,503,{error:"The published Minglora brand manifest is temporarily unavailable."},{"Cache-Control":"no-store"});
    }
  }

  const root="/api/admin/logo-center";
  const isRoot=requestPath===root;
  const isAction=requestPath===root+"/action";
  const isPrepare=requestPath===root+"/upload/prepare";
  const isComplete=requestPath===root+"/upload/complete";
  const assetUrlMatch=requestPath.match(/^\/api\/admin\/logo-center\/assets\/([0-9a-f-]{36})\/preview$/i);
  if (!(isRoot||isAction||isPrepare||isComplete||assetUrlMatch)) return false;
  if (!user) return respond(res,401,{error:"Sign in to access the Minglora Logo Center."});
  if (typeof hasActiveBrandMfaSession!=="function" || !hasActiveBrandMfaSession(user,req)) {
    return respond(res,403,{error:"The Logo Center requires a signed-in, MFA-verified Minglora session."});
  }
  if (AUTH_PROVIDER !== "supabase" || !isSupabasePersistence()) {
    return respond(res,503,{error:"The Logo Center requires Minglora's connected Supabase database and Storage."});
  }
  if (method !== "GET" && !isSameOriginApiWrite(req)) {
    return respond(res,403,{error:"This Logo Center change must be submitted from Minglora."});
  }

  const handleFailure = error => respond(res,Number(error?.status)||503,{
    error:String(error?.message||"The Logo Center request could not be completed.").slice(0,240)
  });

  try {
    if (isRoot && method === "GET") {
      const result=await requestSupabaseState("admin_brand_command",{
        actorUserId:user.id,mfaVerified:true,brandAction:"list",
        payload:{
          search:String(url.searchParams.get("search")||"").trim().slice(0,120),
          categoryId:String(url.searchParams.get("categoryId")||"").slice(0,36),
          collectionId:String(url.searchParams.get("collectionId")||"").slice(0,36)
        }
      });
      if(result?.skipped) return respond(res,503,{error:"The Logo Center requires durable Supabase persistence."});
      return respond(res,200,result);
    }

    if (assetUrlMatch && method === "GET") {
      const result=await requestSupabaseState("admin_brand_asset_url",{
        actorUserId:user.id,mfaVerified:true,payload:{assetId:assetUrlMatch[1]}
      });
      if(result?.skipped) return respond(res,503,{error:"The Logo Center requires durable Supabase persistence."});
      return respond(res,200,result);
    }

    if (isAction && method === "POST") {
      const brandAction=String(input?.brandAction||"").trim().toLowerCase();
      if(!BRAND_ACTIONS.has(brandAction))return respond(res,400,{error:"Choose a supported Logo Center action."});
      const payload=input?.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload:{};
      const result=await requestSupabaseState("admin_brand_command",{
        actorUserId:user.id,mfaVerified:true,brandAction,payload
      });
      if(result?.skipped) return respond(res,503,{error:"The Logo Center requires durable Supabase persistence."});
      return respond(res,200,result);
    }

    if (isPrepare && method === "POST") {
      const mimeType=String(input?.mimeType||"").toLowerCase();
      const byteSize=Number(input?.byteSize||0);
      const fileName=String(input?.fileName||"").trim().replace(/[\\/\u0000-\u001f]/g,"_").slice(0,255);
      const title=String(input?.title||"").trim().slice(0,120);
      if(!BRAND_MIME_EXTENSIONS[mimeType]||!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>BRAND_MAX_UPLOAD_BYTES) {
        return respond(res,400,{error:"Choose SVG, PNG, APNG, JPG, WebP, GIF, ICO, Lottie JSON, MP4 or WebM up to 50 MB."});
      }
      if(!title||!fileName)return respond(res,400,{error:"Enter a logo title and choose a file."});
      const payload={
        assetId:String(input?.assetId||""),
        versionId:crypto.randomUUID(),
        title,
        description:String(input?.description||"").slice(0,2000),
        categoryId:String(input?.categoryId||""),
        collectionId:String(input?.collectionId||""),
        originalName:fileName,
        changeNote:String(input?.changeNote||"").slice(0,500),
        mimeType,byteSize,fileFormat:BRAND_MIME_EXTENSIONS[mimeType]
      };
      const prepared=await requestSupabaseState("admin_brand_upload_prepare",{
        actorUserId:user.id,mfaVerified:true,payload
      });
      if(prepared?.skipped)return respond(res,503,{error:"The Logo Center requires durable Supabase persistence."});
      const publicApiKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||"").trim();
      if(!publicApiKey)return respond(res,503,{error:"The public Supabase upload key is not configured on Minglora."});
      return respond(res,201,{...prepared,apiKey:publicApiKey});
    }

    if (isComplete && method === "POST") {
      const assetId=String(input?.assetId||"");
      const versionId=String(input?.versionId||"");
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if(!uuid.test(assetId)||!uuid.test(versionId))return respond(res,400,{error:"A valid logo asset and version reference are required."});
      const result=await requestSupabaseState("admin_brand_upload_complete",{
        actorUserId:user.id,mfaVerified:true,payload:{
          assetId,versionId,
          width:Number(input?.width||0),
          height:Number(input?.height||0),
          durationMs:Number(input?.durationMs||0)
        }
      });
      if(result?.skipped)return respond(res,503,{error:"The Logo Center requires durable Supabase persistence."});
      return respond(res,200,result);
    }

    return respond(res,405,{error:"This Logo Center method is not supported."});
  } catch(error) {
    return handleFailure(error);
  }
}
