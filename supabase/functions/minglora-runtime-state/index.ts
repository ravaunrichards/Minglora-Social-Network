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
  const maxBodyBytes = 1_000_000;
  if (length > maxBodyBytes) return json(413, { error: "Request is too large." });
  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    const rawBytes = new TextEncoder().encode(raw).byteLength;
    if (rawBytes > maxBodyBytes) return json(413, { error: "Request is too large." });
    input = JSON.parse(raw);
    if (rawBytes > 1_000_000) {
      return json(413, { error: "Request is too large." });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return json(400, { error: "Invalid request." });
    }
  } catch {
    return json(400, { error: "Invalid JSON request." });
  }

  const action = input.action;
  const supportedActions = [
    "load", "save", "health", "media_sign", "media_upload_prepare", "media_upload_complete", "media_delete",
    "live_broadcast_create", "live_broadcast_end", "live_chat_list", "live_chat_send",
    "economy_catalog", "economy_wallet", "economy_purchase_create", "economy_purchase_get",
    "economy_purchase_settle", "economy_send_gift", "economy_creator_earnings",
    "economy_get_payout_account", "economy_set_payout_account", "economy_request_payout",
    "economy_update_payout", "economy_payout_webhook", "relationship_follow", "relationship_unfollow",
    "account_deletion_request"
  ];
  if (!supportedActions.includes(String(action))) {
    return json(400, { error: "Unsupported action." });
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const validUuid = (value: unknown) => uuidPattern.test(String(value || ""));
  const fail = (error: any, fallback: string) =>
    json(409, { error: String(error?.message || fallback).slice(0, 240) });

  if (action === "account_deletion_request") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid account deletion request."});
    const {data:existing,error:lookupError}=await admin.from("data_rights_requests")
      .select("id,user_id,request_type,status,requested_at")
      .eq("user_id",userId).eq("request_type","deletion")
      .in("status",["requested","processing"]).order("requested_at",{ascending:false}).limit(1).maybeSingle();
    if(lookupError)return json(503,{error:"Minglora could not check existing deletion requests."});
    if(existing)return json(200,{request:existing,alreadyRequested:true});
    const {data,error}=await admin.from("data_rights_requests")
      .insert({user_id:userId,request_type:"deletion",status:"requested"})
      .select("id,user_id,request_type,status,requested_at").single();
    if(error)return fail(error,"Minglora could not record the deletion request.");
    return json(201,{request:data});
  }

  if (action === "economy_payout_webhook") {
    const batchId = String(input.paypalBatchId || "");
    const status = String(input.status || "");
    if (batchId.length < 5 || batchId.length > 160 || !["paid", "failed"].includes(status)) {
      return json(400, { error: "Invalid PayPal payout event." });
    }
    const patch: Record<string, unknown> = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { data, error } = await admin.from("creator_payouts").update(patch)
      .eq("paypal_batch_id", batchId)
      .in("status", ["requested", "processing"])
      .select("id,creator_id,status,amount_minor");
    if (error) return json(503, { error: "Minglora could not update the payout from PayPal's event." });
    return json(200, { updated: (data || []).length });
  }

  if (action === "relationship_follow" || action === "relationship_unfollow") {
    const followerId = String(input.followerId || ""), followedId = String(input.followedId || "");
    if (!validUuid(followerId) || !validUuid(followedId) || followerId === followedId) {
      return json(400, { error: "Invalid follow relationship." });
    }
    if (action === "relationship_follow") {
      const { error } = await admin.from("user_follows")
        .upsert({ follower_id: followerId, followed_id: followedId }, {
          onConflict: "follower_id,followed_id", ignoreDuplicates: true
        });
      if (error) return fail(error, "Minglora could not save this follow.");
    } else {
      const { error } = await admin.from("user_follows")
        .delete().eq("follower_id", followerId).eq("followed_id", followedId);
      if (error) return fail(error, "Minglora could not remove this follow.");
    }
    const { data: reverse, error: reverseError } = await admin.from("user_follows")
      .select("follower_id").eq("follower_id", followedId).eq("followed_id", followerId).maybeSingle();
    if (reverseError) return json(503, { error: "Minglora could not verify mutual follow status." });
    return json(200, {
      following: action === "relationship_follow",
      mutual: action === "relationship_follow" && Boolean(reverse),
      friends: action === "relationship_follow" && Boolean(reverse)
    });
  }

  if (action === "economy_catalog") {
    const [packagesResult, giftsResult] = await Promise.all([
      admin.from("coin_packages").select("code,name,coin_amount,price_minor,currency").eq("active", true).order("sort_order"),
      admin.from("live_gift_catalog").select("code,name,category,emoji,animation_key,coin_price,model_url,animation_preset").eq("active", true).order("sort_order")
    ]);
    if (packagesResult.error || giftsResult.error) return json(503, { error: "Minglora coin and gift catalogue is unavailable." });
    return json(200, { packages: packagesResult.data || [], gifts: giftsResult.data || [], currency: "USD", coinName: "Minglora Coins" });
  }

  if (action === "economy_wallet") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const [walletResult, ledgerResult] = await Promise.all([
      admin.from("coin_wallets").select("balance_coins,updated_at").eq("user_id", userId).maybeSingle(),
      admin.from("coin_ledger").select("id,delta_coins,balance_after,entry_type,description,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100)
    ]);
    if (walletResult.error || ledgerResult.error) return json(503, { error: "Minglora wallet could not be loaded." });
    return json(200, { wallet: walletResult.data || { balance_coins: 0 }, ledger: ledgerResult.data || [] });
  }

  if (action === "economy_purchase_create") {
    const userId = String(input.userId || "");
    const orderId = String(input.paypalOrderId || "");
    const coins = Number(input.coinAmount);
    if (!validUuid(userId) || orderId.length < 5 || orderId.length > 160 ||
        !Number.isSafeInteger(coins) || coins < 100 || coins > 100000 || coins % 2 !== 0) {
      return json(400, { error: "Invalid Minglora coin purchase details." });
    }
    const { data, error } = await admin.rpc("minglora_create_coin_purchase", {
      p_user_id: userId, p_paypal_order_id: orderId, p_coin_amount: coins, p_amount_minor: coins
    });
    if (error) return fail(error, "Minglora could not record the PayPal purchase.");
    return json(201, { purchaseId: data, paypalOrderId: orderId, coinAmount: coins, amountMinor: coins });
  }

  if (action === "economy_purchase_get") {
    const userId = String(input.userId || ""), orderId = String(input.paypalOrderId || "");
    if (!validUuid(userId) || !orderId) return json(400, { error: "Invalid purchase reference." });
    const { data, error } = await admin.from("coin_purchase_orders")
      .select("id,user_id,paypal_order_id,coin_amount,amount_minor,currency,status")
      .eq("user_id", userId).eq("paypal_order_id", orderId).maybeSingle();
    if (error) return json(503, { error: "Minglora could not verify the coin purchase." });
    if (!data) return json(404, { error: "Minglora purchase was not found for this account." });
    return json(200, { purchase: data });
  }

  if (action === "economy_purchase_settle") {
    const userId = String(input.userId || ""), orderId = String(input.paypalOrderId || "");
    const captureId = String(input.paypalCaptureId || "");
    if (!validUuid(userId) || !orderId || captureId.length < 5 || captureId.length > 160) {
      return json(400, { error: "Invalid PayPal capture details." });
    }
    const { data, error } = await admin.rpc("minglora_settle_coin_purchase", {
      p_user_id: userId, p_paypal_order_id: orderId, p_paypal_capture_id: captureId
    });
    if (error) return fail(error, "Minglora could not settle the PayPal coin purchase.");
    return json(200, { settlement: data });
  }

  if (action === "economy_send_gift") {
    const senderId = String(input.senderId || ""), broadcastId = String(input.broadcastId || "");
    const giftCode = String(input.giftCode || "");
    if (!validUuid(senderId) || !validUuid(broadcastId) || !/^[a-z0-9_-]{1,60}$/.test(giftCode)) {
      return json(400, { error: "Invalid LIVE gift request." });
    }
    const { data, error } = await admin.rpc("minglora_send_live_gift", {
      p_sender_id: senderId, p_broadcast_id: broadcastId, p_gift_code: giftCode
    });
    if (error) return fail(error, "Minglora could not send the LIVE gift.");
    return json(200, { gift: data });
  }

  if (action === "economy_creator_earnings") {
    const creatorId = String(input.creatorId || "");
    if (!validUuid(creatorId)) return json(400, { error: "Invalid creator account." });
    const [ledgerResult, payoutsResult, accountResult] = await Promise.all([
      admin.from("creator_earnings_ledger").select("id,gross_minor,creator_share_minor,platform_share_minor,currency,status,created_at,gift_transaction_id").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(250),
      admin.from("creator_payouts").select("id,amount_minor,currency,paypal_batch_id,status,created_at,paid_at").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(100),
      admin.from("creator_payout_accounts").select("paypal_email,updated_at").eq("user_id", creatorId).maybeSingle()
    ]);
    if (ledgerResult.error || payoutsResult.error || accountResult.error) return json(503, { error: "Creator earnings are temporarily unavailable." });
    const ledger = ledgerResult.data || [], payouts = payoutsResult.data || [];
    const earnedMinor = ledger.reduce((sum: number, row: any) => sum + Number(row.creator_share_minor || 0), 0);
    const reservedMinor = payouts.filter((row: any) => ["requested", "processing", "paid"].includes(row.status)).reduce((sum: number, row: any) => sum + Number(row.amount_minor || 0), 0);
    return json(200, { ledger, payouts, payoutAccount: accountResult.data || null, earnedMinor, reservedMinor, availableMinor: Math.max(0, earnedMinor - reservedMinor), currency: "USD", creatorSharePercent: 50, platformSharePercent: 50 });
  }

  if (action === "economy_get_payout_account") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const { data, error } = await admin.from("creator_payout_accounts").select("paypal_email,updated_at").eq("user_id", userId).maybeSingle();
    if (error) return json(503, { error: "PayPal payout account could not be loaded." });
    return json(200, { payoutAccount: data || null });
  }

  if (action === "economy_set_payout_account") {
    const userId = String(input.userId || ""), email = String(input.paypalEmail || "").trim().toLowerCase();
    if (!validUuid(userId) || email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return json(400, { error: "Enter a valid PayPal email address." });
    }
    const { data, error } = await admin.from("creator_payout_accounts")
      .upsert({ user_id: userId, paypal_email: email, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("paypal_email,updated_at").single();
    if (error) return fail(error, "PayPal payout details could not be saved.");
    return json(200, { payoutAccount: data });
  }

  if (action === "economy_request_payout") {
    const creatorId = String(input.creatorId || ""), amountMinor = Number(input.amountMinor);
    if (!validUuid(creatorId) || !Number.isSafeInteger(amountMinor) || amountMinor < 100) {
      return json(400, { error: "Payout must be at least USD 1.00." });
    }
    const { data, error } = await admin.rpc("minglora_request_creator_payout", {
      p_creator_id: creatorId, p_amount_minor: amountMinor
    });
    if (error) return fail(error, "The payout exceeds the available creator balance.");
    return json(201, { payoutId: data, amountMinor, currency: "USD" });
  }

  if (action === "economy_update_payout") {
    const creatorId = String(input.creatorId || ""), payoutId = String(input.payoutId || "");
    const status = String(input.status || ""), batchId = input.paypalBatchId ? String(input.paypalBatchId) : null;
    if (!validUuid(creatorId) || !validUuid(payoutId) || !["processing", "paid", "failed", "cancelled"].includes(status)) {
      return json(400, { error: "Invalid creator payout update." });
    }
    const patch: Record<string, unknown> = { status };
    if (batchId) patch.paypal_batch_id = batchId;
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { data, error } = await admin.from("creator_payouts").update(patch)
      .eq("id", payoutId).eq("creator_id", creatorId).select("id,status,amount_minor,paypal_batch_id,paid_at").maybeSingle();
    if (error) return json(503, { error: "Minglora could not update payout status." });
    if (!data) return json(404, { error: "Creator payout was not found." });
    return json(200, { payout: data });
  }

  if (action === "live_broadcast_create") {
    const broadcastId = String(input.id || ""), hostId = String(input.hostId || "");
    const title = String(input.title || "").trim(), description = String(input.description || "");
    const audience = String(input.audience || "public"), roomRef = String(input.roomRef || "");
    if (!validUuid(broadcastId) || !validUuid(hostId) || !title || title.length > 180 ||
        description.length > 2000 || roomRef.length < 1 || roomRef.length > 200 ||
        !["public", "friends", "followers", "private", "subscribers"].includes(audience)) {
      return json(400, { error: "Invalid Minglora LIVE broadcast details." });
    }
    const startedAt = new Date().toISOString();
    const { data, error } = await admin.from("live_broadcasts").insert({
      id: broadcastId, host_id: hostId, title, description, audience,
      room_ref: roomRef, status: "live", started_at: startedAt
    }).select("id,host_id,title,description,audience,room_ref,status,started_at").single();
    if (error) return fail(error, "Minglora could not save this LIVE session.");
    return json(201, { broadcast: data });
  }

  if (action === "live_broadcast_end") {
    const broadcastId = String(input.id || ""), hostId = String(input.hostId || "");
    if (!validUuid(broadcastId) || !validUuid(hostId)) return json(400, { error: "Invalid LIVE session." });
    const { data, error } = await admin.from("live_broadcasts").update({
      status: "ended", ended_at: new Date().toISOString()
    }).eq("id", broadcastId).eq("host_id", hostId).eq("status", "live")
      .select("id,status,ended_at").maybeSingle();
    if (error) return json(503, { error: "Minglora could not close the LIVE session." });
    return json(200, { broadcast: data || { id: broadcastId, status: "ended" } });
  }

  if (action === "live_chat_send") {
    const broadcastId = String(input.broadcastId || ""), userId = String(input.userId || "");
    const body = String(input.body || "").trim();
    if (!validUuid(broadcastId) || !validUuid(userId) || body.length < 1 || body.length > 500) {
      return json(400, { error: "LIVE comments must contain 1–500 characters." });
    }
    const { data: broadcast, error: broadcastError } = await admin.from("live_broadcasts")
      .select("id,status").eq("id", broadcastId).eq("status", "live").maybeSingle();
    if (broadcastError || !broadcast) return json(404, { error: "LIVE session not found." });
    const { data, error } = await admin.from("live_chat_messages")
      .insert({ broadcast_id: broadcastId, user_id: userId, body })
      .select("id,user_id,body,created_at").single();
    if (error) return json(503, { error: "LIVE comment could not be sent." });
    const { data: profile } = await admin.from("profiles").select("id,display_name,username").eq("id", userId).maybeSingle();
    return json(201, { message: { ...data, user: profile ? { id: profile.id, name: profile.display_name, username: profile.username } : null } });
  }

  if (action === "live_chat_list") {
    const broadcastId = String(input.broadcastId || "");
    if (!validUuid(broadcastId)) return json(400, { error: "Invalid LIVE session." });
    const { data: broadcast, error: broadcastError } = await admin.from("live_broadcasts")
      .select("id,status").eq("id", broadcastId).in("status", ["live", "ended"]).maybeSingle();
    if (broadcastError || !broadcast) return json(404, { error: "LIVE session not found." });
    const { data, error } = await admin.from("live_chat_messages")
      .select("id,user_id,body,created_at").eq("broadcast_id", broadcastId)
      .order("created_at", { ascending: false }).limit(100);
    if (error) return json(503, { error: "LIVE comments could not be loaded." });
    const rows = (data || []).reverse(), ids = [...new Set(rows.map((row: any) => row.user_id))];
    const { data: profiles } = ids.length ? await admin.from("profiles").select("id,display_name,username").in("id", ids) : { data: [] };
    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    return json(200, { messages: rows.map((row: any) => {
      const profile = profileMap.get(row.user_id);
      return { ...row, user: profile ? { id: profile.id, name: profile.display_name, username: profile.username } : null };
    }) });
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
    const communityMedia={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4"};
    const message={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","application/pdf":"pdf","text/plain":"txt","text/csv":"csv","application/zip":"zip","application/x-zip-compressed":"zip","application/msword":"doc","application/vnd.ms-excel":"xls","application/vnd.ms-powerpoint":"ppt","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx","application/vnd.openxmlformats-officedocument.presentationml.presentation":"pptx"};
    const allowed=slot==="avatar"||slot==="cover"?image:slot==="post"?post:slot==="story"?story:slot==="group"||slot==="page"?communityMedia:slot==="message"?message:{};
    const bucket=slot==="avatar"?"minglora-avatars":slot==="cover"?"minglora-covers":slot==="post"?"minglora-post-media":slot==="story"?"minglora-stories":slot==="group"?"minglora-group-media":slot==="page"?"minglora-page-media":slot==="message"?"minglora-message-attachments":"";
    const maxBytes=slot==="avatar"?10*1024*1024:slot==="cover"?20*1024*1024:slot==="story"?200*1024*1024:slot==="group"||slot==="page"?250*1024*1024:slot==="message"?100*1024*1024:slot==="post"?500*1024*1024:0;
    if(!uuidPattern.test(ownerId)||!bucket||!allowed[mimeType]||!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>maxBytes){
      return json(400,{error:"The selected file type or size is not allowed for this media area."});
    }
    const mediaType=mimeType.startsWith("image/")?"image":mimeType.startsWith("video/")?"video":mimeType.startsWith("audio/")?"audio":mimeType==="model/gltf-binary"?"model3d":"document";
    const objectPath=`${ownerId}/${crypto.randomUUID()}.${allowed[mimeType]}`;
    const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(objectPath,{upsert:false});
    if(error||!data?.signedUrl)return json(502,{error:"Minglora could not prepare a secure upload."});
    const supabaseHost=new URL(SUPABASE_URL);
    const projectRef=supabaseHost.hostname.split(".")[0];
    const endpoint=`${supabaseHost.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
    let signedUrl="";
    let token="";
    try{
      const parsedSignedUrl=new URL(data.signedUrl,new URL("/storage/v1",SUPABASE_URL));
      signedUrl=parsedSignedUrl.toString();
      token=String(parsedSignedUrl.searchParams.get("token")||"").trim();
    }catch{
      return json(502,{error:"Minglora received an invalid signed upload URL from Storage."});
    }
    if(!token||token.split(".").length!==3){
      return json(502,{error:"Minglora received an invalid upload authorization from Storage. Retry the upload."});
    }
    return json(201,{bucket,path:objectPath,mimeType,mediaType,byteSize,token,signedUrl,endpoint});
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
      "minglora-message-attachments":["image/jpeg","image/png","image/webp","video/mp4","video/webm","audio/mpeg","audio/mp4","audio/ogg","audio/webm","application/pdf","text/plain","text/csv","application/zip","application/x-zip-compressed","application/msword","application/vnd.ms-excel","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      "minglora-stories":["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime"],
      "minglora-group-media":["image/jpeg","image/png","image/webp","video/mp4"],
      "minglora-page-media":["image/jpeg","image/png","image/webp","video/mp4"]
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
    const {data:signedProbe,error:probeError}=await admin.storage.from(bucket).createSignedUrl(objectPath,60);
    if(probeError||!signedProbe?.signedUrl)return json(502,{error:"Minglora could not verify the uploaded media."});
    let probeResponse:Response;
    try{probeResponse=await fetch(signedProbe.signedUrl,{headers:{Range:"bytes=0-31"}});}catch{return json(502,{error:"Minglora could not inspect the uploaded media."});}
    if(probeResponse.status!==206){await probeResponse.body?.cancel();return json(502,{error:"Storage did not return a bounded media signature check."});}
    const prefix=new Uint8Array(await probeResponse.arrayBuffer());
    const starts=(values:number[])=>values.every((value,index)=>prefix[index]===value);
    const ascii=(start:number,end:number)=>String.fromCharCode(...prefix.slice(start,end));
    const validSignature=
      (mimeType==="image/jpeg"&&starts([0xff,0xd8,0xff]))||
      (mimeType==="image/png"&&starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))||
      (mimeType==="image/webp"&&ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP")||
      (mimeType==="image/avif"&&ascii(4,8)==="ftyp"&&["avif","avis","mif1"].includes(ascii(8,12)))||
      (["video/mp4","video/quicktime","audio/mp4"].includes(mimeType)&&ascii(4,8)==="ftyp")||
      (["video/webm","audio/webm"].includes(mimeType)&&starts([0x1a,0x45,0xdf,0xa3]))||
      (mimeType==="audio/mpeg"&&(ascii(0,3)==="ID3"||(prefix[0]===0xff&&(prefix[1]&0xe0)===0xe0)))||
      (mimeType==="audio/ogg"&&ascii(0,4)==="OggS")||
      (mimeType==="model/gltf-binary"&&ascii(0,4)==="glTF")||
      (mimeType==="application/pdf"&&ascii(0,4)==="%PDF")||
      (["application/zip","application/x-zip-compressed","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mimeType)&&(starts([0x50,0x4b,0x03,0x04])||starts([0x50,0x4b,0x05,0x06])||starts([0x50,0x4b,0x07,0x08])))||
      (["application/msword","application/vnd.ms-excel","application/vnd.ms-powerpoint"].includes(mimeType)&&starts([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))||
      (["text/plain","text/csv"].includes(mimeType)&&prefix.length>0&&prefix.every(value=>value===9||value===10||value===13||value>=32));
    if(!validSignature){
      await admin.storage.from(bucket).remove([objectPath]);
      return json(415,{error:"The uploaded file contents do not match the selected media type. The file was removed."});
    }
    const mediaType=mimeType.startsWith("image/")?"image":mimeType.startsWith("video/")?"video":mimeType.startsWith("audio/")?"audio":mimeType==="model/gltf-binary"?"model3d":"document";
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

  if (action === "media_delete") {
    const ownerId=String(input.ownerId||"");
    const bucket=String(input.bucket||"");
    const objectPath=String(input.path||"");
    const allowedBuckets=["minglora-avatars","minglora-covers","minglora-post-media","minglora-stories","minglora-short-videos","minglora-message-attachments","minglora-group-media","minglora-page-media","minglora-marketplace-media","minglora-live-thumbnails","minglora-data-exports"];
    if(!validUuid(ownerId)||!allowedBuckets.includes(bucket)||!objectPath.startsWith(ownerId+"/")||objectPath.includes("..")||objectPath.includes("\\\\")){
      return json(400,{error:"Invalid media deletion reference."});
    }
    const {error}=await admin.storage.from(bucket).remove([objectPath]);
    if(error)return json(502,{error:"Minglora could not remove the stored file."});
    return json(200,{ok:true});
  }

  if (action === "media_sign") {
    const ownerId=String(input.ownerId||"");
    const bucket=String(input.bucket||"");
    const objectPath=String(input.path||"");
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!uuidPattern.test(ownerId)||!["minglora-post-media","minglora-stories","minglora-avatars","minglora-covers","minglora-message-attachments","minglora-group-media","minglora-page-media"].includes(bucket)||!objectPath.startsWith(ownerId+"/")||objectPath.includes("..")){
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
