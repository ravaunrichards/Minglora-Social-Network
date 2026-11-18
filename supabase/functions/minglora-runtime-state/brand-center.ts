const OWNER_ID = "5b998c21-86b5-4621-ab37-e0808a2657b1";
const BUCKET = "minglora-brand-assets";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string,string> = {
  "image/svg+xml":"svg",
  "image/png":"png",
  "image/webp":"webp",
  "image/jpeg":"jpg",
  "image/gif":"gif",
  "image/apng":"png",
  "image/x-icon":"ico",
  "image/vnd.microsoft.icon":"ico",
  "application/json":"json",
  "video/mp4":"mp4",
  "video/webm":"webm"
};
const ASSET_TYPES = new Set([
  "profile_branding","cover_image","application_icon","favicon","website_banner","promotional_banner",
  "background","wallpaper","loading_animation","watermark","social_graphic","advertisement_template",
  "notification_graphic","email_graphic","live_graphic","meetwave_graphic","sticker","illustration",
  "brand_icon","seasonal_graphic","event_graphic","video_overlay","graphic_template","other"
]);
const LOCATIONS = new Set([
  "website_header","website_footer","mobile_application","desktop_application","tablet_application",
  "admin_dashboard","login_page","registration_page","password_recovery_page","loading_screen","splash_screen",
  "browser_favicon","notifications","email_templates","live_streaming","meetwave","video_watermarks",
  "image_watermarks","post_share_previews","social_sharing_cards","installation_icons","error_pages",
  "maintenance_pages","promotional_pages"
]);
const BRAND_ACTIONS = new Set([
  "list","create_category","update_category","create_collection","update_collection",
  "update_logo","archive_logo","restore_logo","restore_logo_version","favorite_toggle",
  "request_publish","decide_approval","publish","rollback","schedule_logo","cancel_schedule",
  "update_identity","archive_asset","restore_asset","request_asset_publish","publish_asset"
]);
const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
  });

function actorAllowed(input: Record<string,unknown>) {
  return String(input.actorUserId || "") === OWNER_ID && input.mfaVerified === true;
}
function cleanText(value: unknown, max: number, fallback = "") {
  return String(value ?? fallback).trim().slice(0,max);
}
function safeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item,32).toLowerCase())
    .filter(item => /^[a-z0-9 _-]{1,32}$/.test(item)))].slice(0,20);
}
function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
function sizeLimit(mime: string) {
  if (mime === "application/json") return MAX_JSON_BYTES;
  if (mime.startsWith("video/")) return MAX_VIDEO_BYTES;
  return MAX_IMAGE_BYTES;
}
function fileExtension(name: string) {
  const result = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return result?.[1] || "";
}
function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start,Math.min(bytes.length,start+length)));
}
function containsAscii(bytes: Uint8Array, text: string) {
  const wanted = new TextEncoder().encode(text);
  for (let index=0; index<=bytes.length-wanted.length; index++) {
    let match=true;
    for (let offset=0; offset<wanted.length; offset++) {
      if (bytes[index+offset]!==wanted[offset]) { match=false; break; }
    }
    if (match) return true;
  }
  return false;
}
function extensionMatches(name: string, mime: string) {
  const ext=fileExtension(name);
  const accepted:Record<string,string[]> = {
    "image/jpeg":["jpg","jpeg"],"image/apng":["png","apng"],
    "image/x-icon":["ico"],"image/vnd.microsoft.icon":["ico"]
  };
  return (accepted[mime]||[MIME_EXTENSIONS[mime]]).includes(ext);
}
function parsePngSize(bytes: Uint8Array) {
  if (bytes.length < 24) return { width:null,height:null };
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return { width:view.getUint32(16),height:view.getUint32(20) };
}
function parseJpegSize(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset+1];
    const length = (bytes[offset+2] << 8) | bytes[offset+3];
    if (!Number.isFinite(length) || length < 2) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return { height:(bytes[offset+5] << 8) | bytes[offset+6], width:(bytes[offset+7] << 8) | bytes[offset+8] };
    }
    offset += length + 2;
  }
  return { width:null,height:null };
}
async function validateFile(blob: Blob, mimeType: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.length || bytes.length > sizeLimit(mimeType)) throw new Error("The uploaded file is empty or exceeds the format's size limit.");
  let valid = false;
  let width: number|null = null;
  let height: number|null = null;
  if (mimeType === "image/png" || mimeType === "image/apng") {
    valid = bytes.length >= 24 && bytes[0]===0x89 && readAscii(bytes,1,3)==="PNG" &&
      readAscii(bytes,12,4)==="IHDR";
    if (valid && mimeType === "image/apng") {
      valid = containsAscii(bytes,"acTL");
    }
    if (valid) ({width,height}=parsePngSize(bytes));
  } else if (mimeType === "image/jpeg") {
    valid = bytes.length > 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
    if (valid) ({width,height}=parseJpegSize(bytes));
  } else if (mimeType === "image/webp") {
    valid = bytes.length > 16 && readAscii(bytes,0,4)==="RIFF" && readAscii(bytes,8,4)==="WEBP";
  } else if (mimeType === "image/gif") {
    valid = ["GIF87a","GIF89a"].includes(readAscii(bytes,0,6));
  } else if (mimeType === "image/x-icon" || mimeType === "image/vnd.microsoft.icon") {
    valid = bytes.length >= 22 && bytes[0]===0 && bytes[1]===0 && bytes[2]===1 && bytes[3]===0;
  } else if (mimeType === "image/svg+xml") {
    const source = new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    valid = /<svg(?:\s|>)/i.test(source) &&
      !/<\s*(script|foreignObject|iframe|object|embed)\b/i.test(source) &&
      !/\son[a-z]+\s*=/i.test(source) &&
      !/(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:|javascript:)/i.test(source) &&
      !/<!DOCTYPE|<!ENTITY/i.test(source);
    if (!valid) throw new Error("SVG files must be well-formed artwork without scripts, event handlers, external references or document declarations.");
  } else if (mimeType === "application/json") {
    try {
      const parsed = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
      valid = Boolean(parsed && typeof parsed==="object" && !Array.isArray(parsed) &&
        Array.isArray(parsed.layers) && Number.isFinite(Number(parsed.fr)) &&
        Number.isFinite(Number(parsed.op)) && Number.isFinite(Number(parsed.w)) && Number.isFinite(Number(parsed.h)));
      if (valid) { width=Number(parsed.w); height=Number(parsed.h); }
    } catch { valid = false; }
    if (!valid) throw new Error("JSON uploads must be valid Lottie animation files.");
  } else if (mimeType === "video/mp4") {
    valid = bytes.length >= 12 && readAscii(bytes,4,4)==="ftyp";
  } else if (mimeType === "video/webm") {
    valid = bytes.length >= 4 && bytes[0]===0x1a && bytes[1]===0x45 && bytes[2]===0xdf && bytes[3]===0xa3;
  }
  if (!valid) throw new Error("The file contents do not match the selected supported file format.");
  if (width !== null && height !== null &&
      (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 30000 || height > 30000)) {
    throw new Error("The image dimensions are outside the supported range.");
  }
  const digest = await crypto.subtle.digest("SHA-256",bytes);
  const sha256 = Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join("");
  return { bytes:bytes.byteLength,width,height,sha256 };
}
async function ensurePrivateBucket(admin: any) {
  const {data:found} = await admin.storage.getBucket(BUCKET);
  if (!found) {
    const {error:createError} = await admin.storage.createBucket(BUCKET,{
      public:false,fileSizeLimit:MAX_VIDEO_BYTES,allowedMimeTypes:Object.keys(MIME_EXTENSIONS)
    });
    if (createError) {
      const {data:afterCreate,error:verifyError} = await admin.storage.getBucket(BUCKET);
      if (verifyError || !afterCreate || afterCreate.public !== false) throw new Error("The private Minglora brand bucket could not be created safely.");
    }
  }
  const {data:bucket,error} = await admin.storage.getBucket(BUCKET);
  const allowed = Array.isArray(bucket?.allowed_mime_types) ? bucket.allowed_mime_types : [];
  if (error || !bucket || bucket.public !== false ||
      Number(bucket.file_size_limit) < MAX_VIDEO_BYTES ||
      Object.keys(MIME_EXTENSIONS).some(mime => !allowed.includes(mime))) {
    throw new Error("The brand bucket must be private and permit only the configured format and size limits.");
  }
}
async function recordActivity(admin: any, actor: string, action: string, entityType: string, entityId: string|null, metadata: Record<string,unknown> = {}) {
  const {error} = await admin.from("brand_logo_activity_logs").insert({
    actor_user_id:actor,action,entity_type:entityType,entity_id:entityId,metadata
  });
  if (error) console.warn("[Minglora Brand Center] Audit entry was not written.",String(error.message||"").slice(0,140));
}
async function signedUrl(admin: any, path: string) {
  const {data,error} = await admin.storage.from(BUCKET).createSignedUrl(path,1800);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
async function brandList(admin: any, actor: string) {
  const queries = await Promise.all([
    admin.from("brand_logos").select("*,category:brand_logo_categories(id,category_key,display_name),collection:brand_logo_collections(id,collection_key,name)").order("updated_at",{ascending:false}),
    admin.from("brand_logo_versions").select("*").order("version_number",{ascending:false}),
    admin.from("brand_asset_library").select("*,category:brand_logo_categories(id,category_key,display_name),collection:brand_logo_collections(id,collection_key,name)").order("updated_at",{ascending:false}),
    admin.from("brand_asset_versions").select("*").order("version_number",{ascending:false}),
    admin.from("brand_logo_categories").select("*").eq("is_active",true).order("sort_order"),
    admin.from("brand_logo_collections").select("*").order("created_at"),
    admin.from("brand_logo_assignments").select("*").order("location_key"),
    admin.from("brand_logo_favorites").select("id,logo_id,asset_id").eq("user_id",actor),
    admin.from("brand_logo_schedules").select("*").order("scheduled_for",{ascending:false}).limit(100),
    admin.from("brand_logo_activity_logs").select("*").order("created_at",{ascending:false}).limit(100),
    admin.from("brand_identity_settings").select("*").order("setting_key"),
    admin.from("brand_deployment_history").select("*").order("created_at",{ascending:false}).limit(100),
    admin.from("brand_approval_records").select("*").order("created_at",{ascending:false}).limit(100)
  ]);
  const labels = ["logos","logoVersions","assets","assetVersions","categories","collections","assignments","favorites","schedules","activity","identity","deployments","approvals"];
  for (let index=0; index<queries.length; index++) {
    if (queries[index].error) return {error:queries[index].error};
  }
  const result: Record<string,any> = {};
  labels.forEach((key,index)=>result[key]=queries[index].data||[]);
  const versionSigning: Array<Promise<void>> = [];
  for (const logo of result.logos) {
    const version = result.logoVersions.find((row:any)=>row.id===logo.active_version_id);
    logo.preview_url = version ? await signedUrl(admin,version.storage_path) : null;
  }
  for (const asset of result.assets) {
    const version = result.assetVersions.find((row:any)=>row.id===asset.active_version_id);
    asset.preview_url = version ? await signedUrl(admin,version.storage_path) : null;
  }
  result.storage = {
    bucket:BUCKET,
    bytes:result.logoVersions.reduce((sum:number,row:any)=>sum+Number(row.byte_size||0),0)+
      result.assetVersions.reduce((sum:number,row:any)=>sum+Number(row.byte_size||0),0),
    logoCount:result.logos.length,
    assetCount:result.assets.length
  };
  return result;
}
async function uploadPrepare(admin: any,input: Record<string,unknown>) {
  const actor = String(input.actorUserId||"");
  const mime = String(input.mimeType||"").toLowerCase();
  const name = cleanText(input.fileName,200);
  const size = Number(input.byteSize||0);
  const kind = String(input.assetKind||"logo");
  if (!MIME_EXTENSIONS[mime] || !Number.isSafeInteger(size) || size < 1 || size > sizeLimit(mime) ||
      !name || !["logo","asset"].includes(kind) || !extensionMatches(name,mime)) {
    return {error:{message:"Choose a supported file with a matching extension and a valid size for its format."}};
  }
  if (mime==="application/json" && kind!=="asset") return {error:{message:"Lottie JSON files are supported as brand assets, not static logos."}};
  await ensurePrivateBucket(admin);
  const folder = kind==="logo" ? "logos" : "assets";
  const path = actor+"/"+folder+"/"+crypto.randomUUID()+"."+MIME_EXTENSIONS[mime];
  const {data,error} = await admin.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
  if (error || !data?.signedUrl || !data?.token) return {error:{message:"Minglora could not create a private upload authorization."}};
  return {bucket:BUCKET,path,signedUrl:data.signedUrl,token:data.token,expiresInSeconds:7200};
}
async function uploadComplete(admin: any,input: Record<string,unknown>) {
  const actor = String(input.actorUserId||"");
  const kind = String(input.assetKind||"logo");
  const path = String(input.path||"");
  const mime = String(input.mimeType||"").toLowerCase();
  const fileName = cleanText(input.fileName,200);
  const extension = MIME_EXTENSIONS[mime];
  if (!["logo","asset"].includes(kind) || !extension || !path.startsWith(actor+"/"+(kind==="logo"?"logos/":"assets/")) ||
      !path.endsWith("."+extension) || !fileName || !extensionMatches(fileName,mime)) {
    return {error:{message:"The upload reference is not valid for this administrator and file type."}};
  }
  const {data:bucket,error:bucketError} = await admin.storage.getBucket(BUCKET);
  if (bucketError || !bucket || bucket.public !== false) return {error:{message:"The brand asset bucket is not private; upload finalization was blocked."}};
  const {data:blob,error:downloadError} = await admin.storage.from(BUCKET).download(path);
  if (downloadError || !blob) return {error:{message:"The uploaded brand file could not be verified in private storage."}};
  const validation = await validateFile(blob,mime);
  if (validation.bytes !== Number(input.byteSize||0)) return {error:{message:"The uploaded file size does not match its signed upload request."}};

  const note = cleanText(input.changeNote,500);
  if (kind==="logo") {
    const existingId = String(input.logoId||"");
    let logo:any;
    if (existingId) {
      if (!isUuid(existingId)) return {error:{message:"Choose a valid existing logo."}};
      const found = await admin.from("brand_logos").select("*").eq("id",existingId).maybeSingle();
      if (found.error || !found.data || found.data.status==="archived") return {error:{message:"The selected logo cannot receive a new version."}};
      logo = found.data;
    } else {
      const name = cleanText(input.name,120);
      const categoryId = String(input.categoryId||"");
      const collectionId = input.collectionId ? String(input.collectionId) : null;
      if (!name || !isUuid(categoryId) || (collectionId && !isUuid(collectionId))) return {error:{message:"Enter a logo name and choose a valid category."}};
      const category = await admin.from("brand_logo_categories").select("id,asset_scope").eq("id",categoryId).eq("is_active",true).maybeSingle();
      if (category.error || !category.data || !["logo","both"].includes(category.data.asset_scope)) return {error:{message:"Choose a logo category."}};
      if (collectionId) {
        const collection = await admin.from("brand_logo_collections").select("id,is_archived").eq("id",collectionId).maybeSingle();
        if (collection.error || !collection.data || collection.data.is_archived) return {error:{message:"Choose an active brand collection."}};
      }
      const inserted = await admin.from("brand_logos").insert({
        name,description:cleanText(input.description,1000),category_id:categoryId,collection_id:collectionId,
        status:"draft",tags:safeTags(input.tags),created_by:actor,updated_by:actor
      }).select("*").single();
      if (inserted.error || !inserted.data) return {error:{message:"The logo record could not be created."}};
      logo=inserted.data;
    }
    const last = await admin.from("brand_logo_versions").select("version_number").eq("logo_id",logo.id).order("version_number",{ascending:false}).limit(1).maybeSingle();
    const versionNumber = Number(last.data?.version_number||0)+1;
    const version = await admin.from("brand_logo_versions").insert({
      logo_id:logo.id,version_number:versionNumber,storage_path:path,original_file_name:fileName,mime_type:mime,
      byte_size:validation.bytes,width:validation.width,height:validation.height,sha256:validation.sha256,
      version_kind:existingId?"modified":"original",change_note:note,created_by:actor
    }).select("*").single();
    if (version.error || !version.data) return {error:{message:"The immutable logo version could not be saved."}};
    const update = await admin.from("brand_logos").update({
      active_version_id:version.data.id,status:"draft",updated_by:actor,updated_at:new Date().toISOString()
    }).eq("id",logo.id).select("*").single();
    if (update.error) return {error:{message:"The logo was uploaded but its version pointer could not be updated. The immutable file remains recoverable."}};
    await recordActivity(admin,actor,existingId?"logo.version_uploaded":"logo.uploaded","logo",logo.id,{versionNumber,mimeType:mime,byteSize:validation.bytes});
    return {ok:true,logo:update.data,version:version.data,previewUrl:await signedUrl(admin,path)};
  }

  const existingId = String(input.assetId||"");
  let asset:any;
  if (existingId) {
    if (!isUuid(existingId)) return {error:{message:"Choose a valid existing brand asset."}};
    const found = await admin.from("brand_asset_library").select("*").eq("id",existingId).maybeSingle();
    if (found.error || !found.data || found.data.status==="archived") return {error:{message:"The selected brand asset cannot receive a new version."}};
    asset=found.data;
  } else {
    const name = cleanText(input.name,120);
    const assetType = String(input.assetType||"other");
    const categoryId = String(input.categoryId||"");
    const collectionId = input.collectionId ? String(input.collectionId) : null;
    if (!name || !ASSET_TYPES.has(assetType) || !isUuid(categoryId) || (collectionId && !isUuid(collectionId))) {
      return {error:{message:"Enter an asset name, asset type and valid category."}};
    }
    const category = await admin.from("brand_logo_categories").select("id,asset_scope").eq("id",categoryId).eq("is_active",true).maybeSingle();
    if (category.error || !category.data || !["asset","both"].includes(category.data.asset_scope)) return {error:{message:"Choose an asset category."}};
    if (collectionId) {
      const collection = await admin.from("brand_logo_collections").select("id,is_archived").eq("id",collectionId).maybeSingle();
      if (collection.error || !collection.data || collection.data.is_archived) return {error:{message:"Choose an active brand collection."}};
    }
    const inserted = await admin.from("brand_asset_library").insert({
      name,description:cleanText(input.description,1000),asset_type:assetType,category_id:categoryId,
      collection_id:collectionId,status:"draft",tags:safeTags(input.tags),created_by:actor,updated_by:actor
    }).select("*").single();
    if (inserted.error || !inserted.data) return {error:{message:"The brand asset record could not be created."}};
    asset=inserted.data;
  }
  const last = await admin.from("brand_asset_versions").select("version_number").eq("asset_id",asset.id).order("version_number",{ascending:false}).limit(1).maybeSingle();
  const versionNumber = Number(last.data?.version_number||0)+1;
  const version = await admin.from("brand_asset_versions").insert({
    asset_id:asset.id,version_number:versionNumber,storage_path:path,original_file_name:fileName,mime_type:mime,
    byte_size:validation.bytes,width:validation.width,height:validation.height,sha256:validation.sha256,
    version_kind:existingId?"modified":"original",change_note:note,created_by:actor
  }).select("*").single();
  if (version.error || !version.data) return {error:{message:"The immutable asset version could not be saved."}};
  const update = await admin.from("brand_asset_library").update({
    active_version_id:version.data.id,status:"draft",updated_by:actor,updated_at:new Date().toISOString()
  }).eq("id",asset.id).select("*").single();
  if (update.error) return {error:{message:"The asset was uploaded but its version pointer could not be updated. The immutable file remains recoverable."}};
  await recordActivity(admin,actor,existingId?"asset.version_uploaded":"asset.uploaded","asset",asset.id,{versionNumber,mimeType:mime,byteSize:validation.bytes});
  return {ok:true,asset:update.data,version:version.data,previewUrl:await signedUrl(admin,path)};
}
async function brandCommand(admin: any, input: Record<string,unknown>) {
  const actor=String(input.actorUserId||"");
  const action=String(input.brandAction||"list").toLowerCase();
  const payload=input.payload && typeof input.payload==="object" && !Array.isArray(input.payload)
    ? input.payload as Record<string,unknown> : {};
  if (!BRAND_ACTIONS.has(action)) return {error:{message:"Choose a supported Logo Center action."}};
  const id = cleanText(payload.id,80);
  const reason = cleanText(payload.reason,1000);
  const log = async(a:string,t:string,entity:string|null,metadata:Record<string,unknown>={}) =>
    recordActivity(admin,actor,a,t,entity,metadata);

  if (action==="list") return await brandList(admin,actor);

  if (action==="create_category" || action==="update_category") {
    const name=cleanText(payload.name,100);
    const key=cleanText(payload.key,80).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const scope=String(payload.assetScope||"logo");
    if (name.length<2 || key.length<2 || !["logo","asset","both"].includes(scope)) return {error:{message:"Enter a category name and a valid category scope."}};
    if (action==="create_category") {
      const result=await admin.from("brand_logo_categories").insert({
        category_key:key,display_name:name,asset_scope:scope,is_system:false,sort_order:900,created_by:actor
      }).select("*").single();
      if (result.error) return {error:{message:"The category could not be saved. Check whether its name already exists."}};
      await log("category.created","category",result.data.id,{key});
      return {ok:true,category:result.data};
    }
    if (!isUuid(id)) return {error:{message:"Choose a valid category."}};
    const result=await admin.from("brand_logo_categories").update({
      display_name:name,asset_scope:scope,updated_at:new Date().toISOString()
    }).eq("id",id).eq("is_system",false).select("*").single();
    if (result.error || !result.data) return {error:{message:"System categories are protected; custom category update failed."}};
    await log("category.updated","category",id,{name,scope});
    return {ok:true,category:result.data};
  }

  if (action==="create_collection" || action==="update_collection") {
    const name=cleanText(payload.name,120);
    const description=cleanText(payload.description,1000);
    const key=cleanText(payload.key||name,80).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const type=String(payload.collectionType||"general");
    if (name.length<2 || key.length<2 || !["logo","asset","archive","general"].includes(type)) return {error:{message:"Enter a collection name and a supported collection type."}};
    if (action==="create_collection") {
      const result=await admin.from("brand_logo_collections").insert({
        collection_key:key,name,description,collection_type:type,created_by:actor
      }).select("*").single();
      if (result.error) return {error:{message:"The collection could not be saved. Check whether its key already exists."}};
      await log("collection.created","collection",result.data.id,{key});
      return {ok:true,collection:result.data};
    }
    if (!isUuid(id)) return {error:{message:"Choose a valid collection."}};
    const result=await admin.from("brand_logo_collections").update({name,description,collection_type:type})
      .eq("id",id).eq("is_system",false).select("*").single();
    if (result.error || !result.data) return {error:{message:"System collections are protected; collection update failed."}};
    await log("collection.updated","collection",id,{name});
    return {ok:true,collection:result.data};
  }

  if (action==="update_logo") {
    if (!isUuid(id)) return {error:{message:"Choose a valid logo."}};
    const patch:Record<string,unknown>={updated_by:actor,updated_at:new Date().toISOString()};
    if (payload.name!==undefined) patch.name=cleanText(payload.name,120);
    if (payload.description!==undefined) patch.description=cleanText(payload.description,1000);
    if (payload.categoryId!==undefined) patch.category_id=isUuid(payload.categoryId)?payload.categoryId:null;
    if (payload.collectionId!==undefined) patch.collection_id=isUuid(payload.collectionId)?payload.collectionId:null;
    if (payload.tags!==undefined) patch.tags=safeTags(payload.tags);
    if (String(patch.name||"").length===1) return {error:{message:"A logo name must contain at least two characters."}};
    const result=await admin.from("brand_logos").update(patch).eq("id",id).select("*").single();
    if (result.error || !result.data) return {error:{message:"The logo metadata could not be updated."}};
    await log("logo.updated","logo",id,{fields:Object.keys(patch)});
    return {ok:true,logo:result.data};
  }

  if (action==="archive_logo" || action==="restore_logo") {
    if (!isUuid(id)) return {error:{message:"Choose a valid logo."}};
    if (action==="archive_logo") {
      const active=await admin.from("brand_logo_assignments").select("id").eq("logo_id",id).eq("is_active",true).limit(1);
      if (active.error || active.data?.length) return {error:{message:"Remove this logo from its active application placements before archiving it."}};
    }
    const status=action==="archive_logo"?"archived":"draft";
    const result=await admin.from("brand_logos").update({status,updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
    if (result.error || !result.data) return {error:{message:"The logo could not be archived or restored."}};
    await log(action==="archive_logo"?"logo.archived":"logo.restored","logo",id,{status});
    return {ok:true,logo:result.data};
  }

  if (action==="restore_logo_version") {
    const versionId=String(payload.versionId||"");
    if (!isUuid(id)||!isUuid(versionId)) return {error:{message:"Choose a valid logo and version."}};
    const version=await admin.from("brand_logo_versions").select("id,logo_id").eq("id",versionId).eq("logo_id",id).maybeSingle();
    if (version.error||!version.data) return {error:{message:"That version does not belong to the selected logo."}};
    const result=await admin.from("brand_logos").update({active_version_id:versionId,status:"draft",updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
    if (result.error||!result.data) return {error:{message:"The previous version could not be restored."}};
    await log("logo.version_restored","logo",id,{versionId});
    return {ok:true,logo:result.data};
  }

  if (action==="archive_asset" || action==="restore_asset") {
    if (!isUuid(id)) return {error:{message:"Choose a valid brand asset."}};
    if (action==="archive_asset") {
      const active=await admin.from("brand_logo_assignments").select("id").eq("asset_id",id).eq("is_active",true).limit(1);
      if (active.error || active.data?.length) return {error:{message:"Remove this brand asset from its active application placements before archiving it."}};
    }
    const status=action==="archive_asset"?"archived":"draft";
    const result=await admin.from("brand_asset_library").update({status,updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
    if (result.error||!result.data) return {error:{message:"The brand asset could not be archived or restored."}};
    await log(action==="archive_asset"?"asset.archived":"asset.restored","asset",id,{status});
    return {ok:true,asset:result.data};
  }

  if (action==="favorite_toggle") {
    const objectType=String(payload.objectType||"logo");
    const objectId=String(payload.objectId||"");
    if (!isUuid(objectId)||!["logo","asset"].includes(objectType)) return {error:{message:"Choose a valid logo or asset."}};
    const field=objectType==="logo"?"logo_id":"asset_id";
    const found=await admin.from("brand_logo_favorites").select("id").eq("user_id",actor).eq(field,objectId).maybeSingle();
    if (found.error) return {error:{message:"Favorite status could not be checked."}};
    if (found.data) {
      const removed=await admin.from("brand_logo_favorites").delete().eq("id",found.data.id);
      if (removed.error) return {error:{message:"Favorite could not be removed."}};
      await log("favorite.removed",objectType,objectId);
      return {ok:true,favorited:false};
    }
    const inserted=await admin.from("brand_logo_favorites").insert({user_id:actor,[field]:objectId});
    if (inserted.error) return {error:{message:"Favorite could not be saved."}};
    await log("favorite.added",objectType,objectId);
    return {ok:true,favorited:true};
  }

  if (action==="request_publish" || action==="request_asset_publish") {
    const objectType=action==="request_publish"?"logo":"asset";
    const objectId=String(payload.objectId||"");
    const locations=Array.isArray(payload.locations)?[...new Set(payload.locations.map(x=>String(x)))] : [];
    if (!isUuid(objectId)||!locations.length||locations.length>24||locations.some(x=>!LOCATIONS.has(x))) {
      return {error:{message:"Select an item and one or more supported application locations."}};
    }
    const table=objectType==="logo"?"brand_logos":"brand_asset_library";
    const found=await admin.from(table).select("id,status,active_version_id").eq("id",objectId).maybeSingle();
    if (found.error||!found.data||!found.data.active_version_id||found.data.status==="archived") return {error:{message:"Choose an active, versioned item before requesting publication."}};
    const pending=await admin.from("brand_approval_records").insert({
      object_type:objectType,object_id:objectId,request_type:"publish",status:"pending",
      metadata:{locations,versionId:found.data.active_version_id,globalReplacement:payload.globalReplacement===true},
      requested_by:actor
    }).select("*").single();
    if (pending.error||!pending.data) return {error:{message:"The publication approval request could not be recorded."}};
    await admin.from(table).update({status:"pending_approval",updated_by:actor,updated_at:new Date().toISOString()}).eq("id",objectId);
    await log("publication.requested",objectType,objectId,{approvalId:pending.data.id,locations});
    return {ok:true,approval:pending.data};
  }

  if (action==="decide_approval") {
    const approvalId=String(payload.approvalId||"");
    const decision=String(payload.decision||"");
    const note=cleanText(payload.note,1000);
    if (!isUuid(approvalId)||!["approved","rejected"].includes(decision)||note.length<5) return {error:{message:"Choose an approval decision and record a reason of at least five characters."}};
    const request=await admin.from("brand_approval_records").select("*").eq("id",approvalId).eq("status","pending").maybeSingle();
    if (request.error||!request.data) return {error:{message:"The approval request is no longer pending."}};
    const updated=await admin.from("brand_approval_records").update({
      status:decision,decided_by:actor,decision_note:note,decided_at:new Date().toISOString()
    }).eq("id",approvalId).eq("status","pending").select("*").single();
    if (updated.error||!updated.data) return {error:{message:"The approval decision could not be recorded."}};
    if (request.data.object_type==="logo"&&request.data.object_id) {
      await admin.from("brand_logos").update({status:decision==="approved"?"approved":"draft",updated_by:actor,updated_at:new Date().toISOString()}).eq("id",request.data.object_id);
    }
    if (request.data.object_type==="asset"&&request.data.object_id) {
      await admin.from("brand_asset_library").update({status:decision==="approved"?"approved":"draft",updated_by:actor,updated_at:new Date().toISOString()}).eq("id",request.data.object_id);
    }
    if (request.data.object_type==="identity" && decision==="approved") {
      const settings=request.data.metadata?.settings;
      if (!settings||typeof settings!=="object"||Array.isArray(settings)) return {error:{message:"The approved identity request has invalid settings."}};
      for (const [key,value] of Object.entries(settings as Record<string,unknown>)) {
        const saved=await admin.from("brand_identity_settings").upsert({
          setting_key:key,setting_value:value,description:"Approved Minglora brand identity setting",updated_by:actor,updated_at:new Date().toISOString()
        },{onConflict:"setting_key"});
        if (saved.error) return {error:{message:"The approval was recorded, but an identity setting could not be applied."}};
      }
    }
    await log("approval."+decision,request.data.object_type,request.data.object_id,{approvalId,note});
    return {ok:true,approval:updated.data};
  }

  if (action==="publish" || action==="publish_asset") {
    const approvalId=String(payload.approvalId||"");
    if (!isUuid(approvalId)) return {error:{message:"Select an approved publication request."}};
    const approval=await admin.from("brand_approval_records").select("*").eq("id",approvalId).eq("status","approved").maybeSingle();
    if (approval.error||!approval.data||!["logo","asset"].includes(approval.data.object_type)) return {error:{message:"A matching approved publication request is required."}};
    const objectType=approval.data.object_type;
    if ((action==="publish"&&objectType!=="logo")||(action==="publish_asset"&&objectType!=="asset")) return {error:{message:"The approved request does not match the selected publication type."}};
    const objectTable=objectType==="logo"?"brand_logos":"brand_asset_library";
    const object=await admin.from(objectTable).select("*").eq("id",approval.data.object_id).maybeSingle();
    if (object.error||!object.data||object.data.active_version_id!==approval.data.metadata?.versionId) return {error:{message:"The asset changed after approval. Request a fresh review before publishing."}};
    const locations=Array.isArray(approval.data.metadata?.locations)?approval.data.metadata.locations:[];
    if (!locations.length||locations.some((location:string)=>!LOCATIONS.has(location))) return {error:{message:"The approved locations are invalid."}};
    const groupId=crypto.randomUUID();
    const deployments=[];
    for (const location of locations) {
      const prior=await admin.from("brand_logo_assignments").select("*").eq("location_key",location).maybeSingle();
      if (prior.error) return {error:{message:"Existing placement could not be inspected. No more locations were changed."}};
      const previous=prior.data;
      const patch={
        location_key:location,logo_id:objectType==="logo"?object.data.id:null,
        logo_version_id:objectType==="logo"?object.data.active_version_id:null,
        asset_id:objectType==="asset"?object.data.id:null,
        asset_version_id:objectType==="asset"?object.data.active_version_id:null,
        is_active:true,updated_by:actor,updated_at:new Date().toISOString()
      };
      const saved=await admin.from("brand_logo_assignments").upsert(patch,{onConflict:"location_key"}).select("*").single();
      if (saved.error) return {error:{message:"A placement could not be saved. Review deployment history and use rollback if required."}};
      const history=await admin.from("brand_deployment_history").insert({
        deployment_group_id:groupId,location_key:location,object_type:objectType,
        logo_id:patch.logo_id,asset_id:patch.asset_id,logo_version_id:patch.logo_version_id,asset_version_id:patch.asset_version_id,
        operation:"publish",status:"published",previous_logo_id:previous?.logo_id||null,
        previous_asset_id:previous?.asset_id||null,previous_logo_version_id:previous?.logo_version_id||null,
        previous_asset_version_id:previous?.asset_version_id||null,previous_is_active:previous?.is_active===true,
        created_by:actor,details:{approvalId}
      }).select("*").single();
      if (history.error) return {error:{message:"A placement was saved but its deployment history could not be recorded. Review the placement before proceeding."}};
      deployments.push(history.data);
    }
    await admin.from(objectTable).update({status:"active",updated_by:actor,updated_at:new Date().toISOString()}).eq("id",object.data.id);
    await log("publication.published",objectType,object.data.id,{approvalId,locations,groupId});
    return {ok:true,deployments};
  }

  if (action==="rollback") {
    const location=String(payload.locationKey||"");
    if (!LOCATIONS.has(location)) return {error:{message:"Choose a supported application location."}};
    const latest=await admin.from("brand_deployment_history").select("*").eq("location_key",location)
      .in("operation",["publish","scheduled_activate","scheduled_restore"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (latest.error||!latest.data) return {error:{message:"There is no deployment history to roll back at this location."}};
    const current=await admin.from("brand_logo_assignments").select("*").eq("location_key",location).maybeSingle();
    if (current.error) return {error:{message:"The current placement could not be inspected."}};
    const saved=await admin.from("brand_logo_assignments").upsert({
      location_key:location,logo_id:latest.data.previous_logo_id,asset_id:latest.data.previous_asset_id,
      logo_version_id:latest.data.previous_logo_version_id,asset_version_id:latest.data.previous_asset_version_id,
      is_active:latest.data.previous_is_active,updated_by:actor,updated_at:new Date().toISOString()
    },{onConflict:"location_key"}).select("*").single();
    if (saved.error) return {error:{message:"The previous placement could not be restored."}};
    const history=await admin.from("brand_deployment_history").insert({
      deployment_group_id:crypto.randomUUID(),location_key:location,
      object_type:latest.data.previous_logo_id?"logo":latest.data.previous_asset_id?"asset":"none",
      logo_id:latest.data.previous_logo_id,asset_id:latest.data.previous_asset_id,
      logo_version_id:latest.data.previous_logo_version_id,asset_version_id:latest.data.previous_asset_version_id,
      operation:"rollback",status:"rolled_back",previous_logo_id:current.data?.logo_id||null,
      previous_asset_id:current.data?.asset_id||null,previous_logo_version_id:current.data?.logo_version_id||null,
      previous_asset_version_id:current.data?.asset_version_id||null,previous_is_active:current.data?.is_active===true,
      created_by:actor,details:{rolledBackDeploymentId:latest.data.id}
    });
    if (history.error) return {error:{message:"The placement was restored but the rollback history could not be recorded."}};
    await log("deployment.rolled_back","placement",null,{location,sourceDeploymentId:latest.data.id});
    return {ok:true,assignment:saved.data};
  }

  if (action==="schedule_logo") {
    const approvalId=String(payload.approvalId||"");
    const location=String(payload.locationKey||"");
    const start=String(payload.scheduledFor||"");
    const end=payload.expiresAt?String(payload.expiresAt):null;
    const timezone=cleanText(payload.timezone,80,"UTC");
    if (!isUuid(approvalId)||!LOCATIONS.has(location)||!Number.isFinite(Date.parse(start))||
        (end && (!Number.isFinite(Date.parse(end)) || Date.parse(end)<=Date.parse(start)))) {
      return {error:{message:"Provide a valid approved request, location and start/expiration dates."}};
    }
    const approval=await admin.from("brand_approval_records").select("*").eq("id",approvalId).eq("status","approved").maybeSingle();
    if (approval.error||!approval.data||!["logo","asset"].includes(approval.data.object_type)||
        !(approval.data.metadata?.locations||[]).includes(location)) return {error:{message:"The schedule must match an approved publication request and location."}};
    const objectTable=approval.data.object_type==="logo"?"brand_logos":"brand_asset_library";
    const object=await admin.from(objectTable).select("id,active_version_id,status").eq("id",approval.data.object_id).maybeSingle();
    if (object.error||!object.data||object.data.active_version_id!==approval.data.metadata?.versionId) return {error:{message:"The approved asset changed. Request a new approval."}};
    const previous=await admin.from("brand_logo_assignments").select("*").eq("location_key",location).maybeSingle();
    if (previous.error) return {error:{message:"The current placement could not be read."}};
    const schedule=await admin.from("brand_logo_schedules").insert({
      approval_record_id:approvalId,object_type:approval.data.object_type,
      logo_id:approval.data.object_type==="logo"?object.data.id:null,
      asset_id:approval.data.object_type==="asset"?object.data.id:null,
      logo_version_id:approval.data.object_type==="logo"?object.data.active_version_id:null,
      asset_version_id:approval.data.object_type==="asset"?object.data.active_version_id:null,
      location_key:location,scheduled_for:new Date(start).toISOString(),expires_at:end?new Date(end).toISOString():null,
      timezone,previous_logo_id:previous.data?.logo_id||null,previous_asset_id:previous.data?.asset_id||null,
      previous_logo_version_id:previous.data?.logo_version_id||null,previous_asset_version_id:previous.data?.asset_version_id||null,
      previous_is_active:previous.data?.is_active===true,created_by:actor
    }).select("*").single();
    if (schedule.error||!schedule.data) return {error:{message:"The brand schedule could not be saved."}};
    await log("schedule.created","schedule",schedule.data.id,{location,scheduledFor:start,expiresAt:end,timezone});
    return {ok:true,schedule:schedule.data};
  }

  if (action==="cancel_schedule") {
    const scheduleId=String(payload.scheduleId||"");
    if (!isUuid(scheduleId)) return {error:{message:"Choose a valid scheduled change."}};
    const found=await admin.from("brand_logo_schedules").select("*").eq("id",scheduleId).maybeSingle();
    if (found.error||!found.data||!["pending","active"].includes(found.data.status)) return {error:{message:"That schedule is already completed or cancelled."}};
    if (found.data.status==="active") {
      const restore=await admin.from("brand_logo_assignments").upsert({
        location_key:found.data.location_key,logo_id:found.data.previous_logo_id,asset_id:found.data.previous_asset_id,
        logo_version_id:found.data.previous_logo_version_id,asset_version_id:found.data.previous_asset_version_id,
        is_active:found.data.previous_is_active,updated_by:actor,updated_at:new Date().toISOString()
      },{onConflict:"location_key"});
      if (restore.error) return {error:{message:"The currently active scheduled change could not be safely restored."}};
    }
    const updated=await admin.from("brand_logo_schedules").update({status:"cancelled",completed_at:new Date().toISOString()})
      .eq("id",scheduleId).select("*").single();
    if (updated.error) return {error:{message:"The schedule could not be cancelled."}};
    await log("schedule.cancelled","schedule",scheduleId,{location:found.data.location_key});
    return {ok:true,schedule:updated.data};
  }

  if (action==="update_identity") {
    const settings=payload.settings && typeof payload.settings==="object"&&!Array.isArray(payload.settings)
      ? payload.settings as Record<string,unknown> : null;
    if (!settings||!Object.keys(settings).length||Object.keys(settings).length>30) return {error:{message:"Provide a valid set of brand identity values."}};
    const normalized:Record<string,unknown>={};
    for (const [rawKey,value] of Object.entries(settings)) {
      const key=rawKey.toLowerCase();
      if (!/^[a-z0-9_.-]{2,100}$/.test(key)) return {error:{message:"An identity setting key is invalid."}};
      if (JSON.stringify(value).length>10000) return {error:{message:"An identity setting is too large."}};
      normalized[key]=value;
    }
    const pending=await admin.from("brand_approval_records").insert({
      object_type:"identity",object_id:null,request_type:"identity_change",status:"pending",
      metadata:{settings:normalized},requested_by:actor
    }).select("*").single();
    if (pending.error||!pending.data) return {error:{message:"The brand identity approval request could not be created."}};
    await log("identity.change_requested","identity",null,{approvalId:pending.data.id,keys:Object.keys(normalized)});
    return {ok:true,approval:pending.data};
  }

  return {error:{message:"The requested brand action is not implemented."}};
}

export async function handleBrandCenterAction(action: string,input: Record<string,unknown>,admin: any) {
  if (!admin) return jsonError(503,"Minglora Supabase is unavailable.");
  if (!actorAllowed(input)) return jsonError(403,"Only the MFA-verified designated Minglora owner can manage brand assets.");
  try {
    if (action==="admin_brand_upload_prepare") {
      const result=await uploadPrepare(admin,input);
      return result.error ? jsonError(400,result.error.message) : new Response(JSON.stringify(result),{
        status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
      });
    }
    if (action==="admin_brand_upload_complete") {
      const result=await uploadComplete(admin,input);
      return result.error ? jsonError(400,result.error.message) : new Response(JSON.stringify(result),{
        status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
      });
    }
    if (action==="admin_brand_command") {
      const result=await brandCommand(admin,input);
      return result.error ? jsonError(400,result.error.message) : new Response(JSON.stringify(result),{
        status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
      });
    }
    if (action==="admin_brand_download") {
      const kind=String(input.assetKind||"logo");
      const versionId=String(input.versionId||"");
      if (!isUuid(versionId)||!["logo","asset"].includes(kind)) return jsonError(400,"Choose a valid brand file version.");
      const table=kind==="logo"?"brand_logo_versions":"brand_asset_versions";
      const {data,error}=await admin.from(table).select("storage_path").eq("id",versionId).maybeSingle();
      if (error||!data) return jsonError(404,"That brand file version could not be found.");
      const url=await signedUrl(admin,data.storage_path);
      return url ? new Response(JSON.stringify({url}),{status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})
        : jsonError(503,"A short-lived private download link could not be created.");
    }
    return jsonError(400,"Unsupported Logo Center action.");
  } catch (error) {
    console.error("[Minglora Brand Center]",String((error as Error)?.message||error).slice(0,200));
    return jsonError(503,"The Logo Center request could not be completed safely.");
  }
}