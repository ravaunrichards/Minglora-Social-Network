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
    "live_participant_mark_connected", "live_participant_mark_left", "live_speaker_request", "live_speaker_requests_list", "live_speaker_request_status",
    "live_speaker_request_review", "live_speaker_mark_connected", "live_speaker_mark_left",
    "economy_catalog", "economy_wallet", "economy_purchase_create", "economy_purchase_get",
    "economy_purchase_settle", "economy_send_gift", "economy_creator_earnings",
    "economy_get_payout_account", "economy_set_payout_account", "economy_request_payout",
    "economy_update_payout", "economy_payout_webhook", "relationship_follow", "relationship_unfollow",
    "auth_register_user", "account_deletion_request",
    "marketplace_seller_get", "marketplace_seller_apply", "marketplace_seller_review", "marketplace_seller_queue", "marketplace_seller_admin_list",
    "marketplace_listing_sync", "marketplace_listing_set_status", "marketplace_listings_list", "marketplace_listing_get", "marketplace_checkout_quote", "marketplace_checkout_status",
    "marketplace_bookings_list", "marketplace_booking_create", "marketplace_booking_update",
    "marketplace_jobs_list", "marketplace_jobs_mine", "marketplace_jobs_create", "marketplace_job_review",
    "marketplace_job_update", "marketplace_job_apply", "marketplace_job_applications_for_job",
    "marketplace_job_applications_mine", "marketplace_job_application_update",
    "marketplace_saved_listings_list", "marketplace_listing_save"
  ];
  if (!supportedActions.includes(String(action))) {
    return json(400, { error: "Unsupported action." });
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const validUuid = (value: unknown) => uuidPattern.test(String(value || ""));
  const fail = (error: any, fallback: string) =>
    json(409, { error: String(error?.message || fallback).slice(0, 240) });

  if (action === "auth_register_user") {
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const name = String(input.name || "").trim();
    const username = String(input.username || "").trim().toLowerCase();
    const contactPhone = String(input.phoneNumber || input.contactPhone || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        password.length < 10 || password.length > 1024 ||
        name.length < 2 || name.length > 120 ||
        !/^[a-z0-9_]{3,30}$/.test(username) ||
        (contactPhone && !/^\+[1-9][0-9]{7,14}$/.test(contactPhone))) {
      return json(400, { error: "Enter a valid name, username, email and password. Phone number is optional." });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        username,
        contact_phone: contactPhone,
        phone_number: contactPhone
      }
    });
    if (error || !data?.user?.id) {
      const message = String(error?.message || "Minglora could not create the account.").slice(0, 240);
      const duplicate = /already|exists|registered|duplicate/i.test(message);
      return json(duplicate ? 409 : 503, { error: duplicate ? "An account with this email already exists. Log in instead." : message });
    }
    return json(201, {
      user: {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
        email_confirmed_at: data.user.email_confirmed_at,
        user_metadata: data.user.user_metadata || {},
        identities: data.user.identities || []
      },
      emailConfirmed: Boolean(data.user.email_confirmed_at)
    });
  }

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
    const broadcastType = String(input.broadcastType || "video_audio");
    if (!validUuid(broadcastId) || !validUuid(hostId) || !title || title.length > 180 ||
        description.length > 2000 || roomRef.length < 1 || roomRef.length > 200 ||
        !["public", "friends", "followers", "private", "subscribers"].includes(audience) ||
        !["video_audio", "audio_only"].includes(broadcastType)) {
      return json(400, { error: "Invalid Minglora LIVE broadcast details." });
    }
    const startedAt = new Date().toISOString();
    const { data, error } = await admin.from("live_broadcasts").insert({
      id: broadcastId, host_id: hostId, title, description, audience, broadcast_type: broadcastType,
      room_ref: roomRef, status: "live", started_at: startedAt
    }).select("id,host_id,title,description,audience,broadcast_type,room_ref,status,started_at").single();
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
    const endedAt=data?.ended_at||new Date().toISOString();
    const {error:participantError}=await admin.from("live_participants").update({
      status:"left",left_at:endedAt
    }).eq("broadcast_id",broadcastId).in("status",["requested","invited","accepted","connected"]);
    if(participantError)return json(503,{error:"The broadcast ended, but participant presence could not be finalized."});
    return json(200, { broadcast: data || { id: broadcastId, status: "ended" } });
  }

  if (action === "live_participant_mark_connected") {
    const broadcastId=String(input.broadcastId||""), userId=String(input.userId||""), role=String(input.role||"");
    if(!validUuid(broadcastId)||!validUuid(userId)||!["host","guest","viewer"].includes(role))
      return json(400,{error:"Invalid LIVE participant connection."});
    const {data:broadcast,error:broadcastError}=await admin.from("live_broadcasts")
      .select("id,host_id,status").eq("id",broadcastId).maybeSingle();
    if(broadcastError||!broadcast||broadcast.status!=="live")
      return json(404,{error:"LIVE session not found."});
    if(role==="host"&&broadcast.host_id!==userId)
      return json(403,{error:"Only the broadcast host can connect as host."});
    if(role!=="host"&&broadcast.host_id===userId)
      return json(400,{error:"The host must connect with the host role."});
    const {data:existing,error:existingError}=await admin.from("live_participants")
      .select("role,status").eq("broadcast_id",broadcastId).eq("user_id",userId).maybeSingle();
    if(existingError)return json(503,{error:"Minglora could not verify the participant's current stage status."});
    if(role==="guest"&&(!existing||existing.role!=="guest"||!["accepted","connected"].includes(existing.status)))
      return json(403,{error:"Host approval is required before joining the speaker stage."});
    // A listener who has a pending hand-raise must keep that request row intact.
    // The same relational row stores speaker-request and participant status.
    if(role==="viewer"&&existing?.role==="guest"&&existing.status==="requested")
      return json(200,{participant:existing,requestPending:true});
    if(role==="viewer"&&existing?.role==="guest"&&["accepted","connected"].includes(existing.status))
      return json(409,{error:"Your speaker request is approved. Rejoin with the speaker-stage token."});
    const connectedAt=new Date().toISOString();
    const {data,error}=await admin.from("live_participants").upsert({
      broadcast_id:broadcastId,user_id:userId,role,status:"connected",joined_at:connectedAt,left_at:null
    },{onConflict:"broadcast_id,user_id"}).select("broadcast_id,user_id,role,status,joined_at").single();
    if(error)return fail(error,"Minglora could not save the connected LIVE participant.");
    return json(200,{participant:data});
  }

  if (action === "live_speaker_request") {
    const broadcastId=String(input.broadcastId||""), userId=String(input.userId||"");
    if(!validUuid(broadcastId)||!validUuid(userId))return json(400,{error:"Invalid LIVE speaker request."});
    const {data:broadcast,error:broadcastError}=await admin.from("live_broadcasts")
      .select("id,host_id,status").eq("id",broadcastId).maybeSingle();
    if(broadcastError||!broadcast||broadcast.status!=="live")return json(404,{error:"LIVE session not found."});
    if(broadcast.host_id===userId)return json(400,{error:"The host is already on stage."});
    const {data:existing,error:existingError}=await admin.from("live_participants").select("role,status")
      .eq("broadcast_id",broadcastId).eq("user_id",userId).maybeSingle();
    if(existingError)return json(503,{error:"Minglora could not check your current LIVE stage access."});
    if(existing?.role==="guest"&&["accepted","connected"].includes(existing.status))
      return json(409,{error:"You already have speaker access."});
    if(existing?.role==="guest"&&existing.status==="requested"){
      const {data:pending,error:pendingError}=await admin.from("live_participants")
        .select("broadcast_id,user_id,role,status,joined_at").eq("broadcast_id",broadcastId).eq("user_id",userId).single();
      if(pendingError)return json(503,{error:"Minglora could not load your pending speaker request."});
      return json(200,{request:pending,alreadyRequested:true});
    }
    // A connected listener may raise a hand. Change their existing viewer row
    // into a pending guest request instead of mistaking viewer connectivity
    // for an already-approved speaker grant.
    const {data,error}=await admin.from("live_participants").upsert({
      broadcast_id:broadcastId,user_id:userId,role:"guest",status:"requested",joined_at:null,left_at:null
    },{onConflict:"broadcast_id,user_id"}).select("broadcast_id,user_id,role,status,joined_at").single();
    if(error)return fail(error,"Minglora could not save your speaker request.");
    return json(201,{request:data});
  }

  if (action === "live_speaker_requests_list") {
    const broadcastId=String(input.broadcastId||""), hostId=String(input.hostId||"");
    if(!validUuid(broadcastId)||!validUuid(hostId))return json(400,{error:"Invalid LIVE speaker request lookup."});
    const {data:broadcast,error:broadcastError}=await admin.from("live_broadcasts")
      .select("id,host_id,status").eq("id",broadcastId).maybeSingle();
    if(broadcastError||!broadcast||broadcast.host_id!==hostId)return json(404,{error:"LIVE session not found."});
    const {data:rows,error}=await admin.from("live_participants")
      .select("broadcast_id,user_id,role,status,joined_at,left_at")
      .eq("broadcast_id",broadcastId).eq("role","guest")
      .in("status",["requested","accepted","connected"])
      .order("joined_at",{ascending:true});
    if(error)return json(503,{error:"Speaker requests could not be loaded."});
    const ids=(rows||[]).map(row=>row.user_id);
    const {data:profiles}=ids.length
      ?await admin.from("profiles").select("id,display_name,username,avatar_url").in("id",ids)
      :{data:[]};
    const profileMap=new Map((profiles||[]).map(profile=>[profile.id,profile]));
    return json(200,{requests:(rows||[]).map(row=>({...row,user:profileMap.get(row.user_id)||null}))});
  }

  if (action === "live_speaker_request_status") {
    const broadcastId=String(input.broadcastId||""), userId=String(input.userId||"");
    if(!validUuid(broadcastId)||!validUuid(userId))return json(400,{error:"Invalid LIVE speaker request status lookup."});
    const {data,error}=await admin.from("live_participants")
      .select("broadcast_id,user_id,role,status,joined_at,left_at")
      .eq("broadcast_id",broadcastId).eq("user_id",userId).maybeSingle();
    if(error)return json(503,{error:"Speaker request status is unavailable."});
    return json(200,{request:data||null});
  }

  if (action === "live_speaker_request_review") {
    const broadcastId=String(input.broadcastId||""), hostId=String(input.hostId||"");
    const speakerId=String(input.speakerId||""), decision=String(input.decision||"");
    if(!validUuid(broadcastId)||!validUuid(hostId)||!validUuid(speakerId)||!["accept","reject"].includes(decision))
      return json(400,{error:"Choose a valid speaker request decision."});
    const {data:broadcast,error:broadcastError}=await admin.from("live_broadcasts")
      .select("id,host_id,status").eq("id",broadcastId).maybeSingle();
    if(broadcastError||!broadcast||broadcast.host_id!==hostId||broadcast.status!=="live")
      return json(404,{error:"LIVE session not found."});
    const {data:pending,error:pendingError}=await admin.from("live_participants")
      .select("user_id,status").eq("broadcast_id",broadcastId).eq("user_id",speakerId).eq("status","requested").maybeSingle();
    if(pendingError||!pending)return json(409,{error:"This speaker request is no longer pending."});
    if(decision==="accept"){
      const {count,error:countError}=await admin.from("live_participants").select("user_id",{count:"exact",head:true})
        .eq("broadcast_id",broadcastId).eq("role","guest").in("status",["accepted","connected"]);
      if(countError)return json(503,{error:"Minglora could not verify the stage capacity."});
      if(Number(count||0)>=8)return json(409,{error:"The eight guest speaker places are full."});
    }
    const status=decision==="accept"?"accepted":"rejected";
    const {data,error}=await admin.from("live_participants").update({role:"guest",status})
      .eq("broadcast_id",broadcastId).eq("user_id",speakerId).select("broadcast_id,user_id,role,status").single();
    if(error)return fail(error,"Minglora could not update this speaker request.");
    return json(200,{request:data});
  }

  if (action === "live_speaker_mark_connected") {
    const broadcastId=String(input.broadcastId||""), userId=String(input.userId||"");
    if(!validUuid(broadcastId)||!validUuid(userId))return json(400,{error:"Invalid LIVE speaker connection."});
    const {data,error}=await admin.from("live_participants").update({status:"connected",joined_at:new Date().toISOString(),left_at:null})
      .eq("broadcast_id",broadcastId).eq("user_id",userId).eq("role","guest").eq("status","accepted")
      .select("user_id,status").maybeSingle();
    if(error||!data)return json(409,{error:"Your speaker access is no longer active. Request to speak again."});
    return json(200,{participant:data});
  }

  if (action === "live_participant_mark_left") {
    const broadcastId=String(input.broadcastId||""), userId=String(input.userId||"");
    if(!validUuid(broadcastId)||!validUuid(userId))return json(400,{error:"Invalid LIVE participant departure."});
    const {data,error}=await admin.from("live_participants").update({
      status:"left",left_at:new Date().toISOString()
    }).eq("broadcast_id",broadcastId).eq("user_id",userId)
      .in("status",["requested","invited","accepted","connected"])
      .select("broadcast_id,user_id,role,status,left_at").maybeSingle();
    if(error)return json(503,{error:"Minglora could not update LIVE participant presence."});
    return json(200,{participant:data||null});
  }

  if (action === "live_speaker_mark_left") {
    const broadcastId=String(input.broadcastId||""), userId=String(input.userId||"");
    if(!validUuid(broadcastId)||!validUuid(userId))return json(400,{error:"Invalid LIVE speaker departure."});
    const {data,error}=await admin.from("live_participants").update({status:"left",left_at:new Date().toISOString()})
      .eq("broadcast_id",broadcastId).eq("user_id",userId).eq("role","guest")
      .in("status",["accepted","connected"]).select("user_id,status").maybeSingle();
    if(error)return json(503,{error:"Minglora could not update the speaker connection."});
    return json(200,{participant:data||null});
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
    const allowed=slot==="avatar"||slot==="cover"?image:slot==="post"?post:slot==="story"?story:slot==="group"||slot==="page"?communityMedia:slot==="marketplace"?image:slot==="message"?message:{};
    const bucket=slot==="avatar"?"minglora-avatars":slot==="cover"?"minglora-covers":slot==="post"||slot==="marketplace"?"minglora-post-media":slot==="story"?"minglora-stories":slot==="group"?"minglora-group-media":slot==="page"?"minglora-page-media":slot==="message"?"minglora-message-attachments":"";
    const maxBytes=slot==="avatar"?10*1024*1024:slot==="cover"?20*1024*1024:slot==="marketplace"?15*1024*1024:slot==="story"?200*1024*1024:slot==="group"||slot==="page"?250*1024*1024:slot==="message"?100*1024*1024:slot==="post"?500*1024*1024:0;
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
    const assetId=String(input.assetId||"");
    const slot=String(input.slot||"");
    const originalName=String(input.originalName||"").trim().slice(0,255);
    if(!uuidPattern.test(assetId)||!["avatar","cover","post","story","group","page","message","marketplace"].includes(slot)){
      return json(400,{error:"A valid upload asset ID and media slot are required."});
    }
    const assetStatus=slot==="avatar"||slot==="cover"?"attached":"uploaded";
    const {error:assetError}=await admin.from("media_assets").upsert({
      id:assetId,owner_id:ownerId,storage_key:objectPath,storage_bucket:bucket,
      media_type:mediaType,mime_type:mimeType,byte_size:byteSize,
      processing_status:"ready",slot,asset_status:assetStatus,original_name:originalName,
      attached_to:assetStatus==="attached"?"profile:"+slot:null,completed_at:new Date().toISOString()
    },{onConflict:"id"});
    if(assetError)return json(503,{error:"Upload completed in Storage but media metadata could not be registered. Retry completion."});
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
    const {error:assetError}=await admin.from("media_assets").update({asset_status:"deleted",processing_status:"deleted"}).eq("owner_id",ownerId).eq("storage_bucket",bucket).eq("storage_key",objectPath);
    if(assetError)return json(503,{error:"File was removed from Storage but its media record could not be retired."});
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


  if (action === "marketplace_seller_get") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid seller account."});
    const {data,error}=await admin.from("marketplace_seller_profiles")
      .select("user_id,seller_type,store_name,description,country_code,contact_email,status,identity_status,payout_status,terms_version,terms_accepted_at,created_at,updated_at")
      .eq("user_id",userId).maybeSingle();
    if(error)return json(503,{error:"Seller profile could not be loaded."});
    return json(200,{seller:data?{
      userId:data.user_id,sellerType:data.seller_type,storeName:data.store_name,description:data.description,
      countryCode:data.country_code,contactEmail:data.contact_email,status:data.status,
      identityStatus:data.identity_status,payoutStatus:data.payout_status,termsVersion:data.terms_version,
      termsAcceptedAt:data.terms_accepted_at,createdAt:data.created_at,updatedAt:data.updated_at
    }:null});
  }

  if (action === "marketplace_seller_apply") {
    const userId=String(input.userId||"");
    const sellerType=String(input.sellerType||"");
    const storeName=String(input.storeName||"").trim().slice(0,100);
    const description=String(input.description||"").trim().slice(0,1000);
    const countryCode=String(input.countryCode||"").trim().toUpperCase();
    const contactEmail=String(input.contactEmail||"").trim().toLowerCase();
    const termsVersion=String(input.termsVersion||"").trim().slice(0,40);
    if(!validUuid(userId)||!["individual","business"].includes(sellerType)||storeName.length<2||
       description.length<20||!/^[A-Z]{2}$/.test(countryCode)||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)||input.acceptTerms!==true||!termsVersion){
      return json(400,{error:"Complete every seller application field and accept the current terms."});
    }
    const {data:existing,error:lookupError}=await admin.from("marketplace_seller_profiles")
      .select("user_id,status").eq("user_id",userId).maybeSingle();
    if(lookupError)return json(503,{error:"Seller application could not be checked."});
    if(existing&&existing.status!=="rejected")return json(409,{error:"A seller application already exists for this account.",status:existing.status});
    const values={
      seller_type:sellerType,store_name:storeName,description,country_code:countryCode,
      contact_email:contactEmail,status:"pending",identity_status:"not_started",
      payout_status:"not_connected",terms_version:termsVersion,terms_accepted_at:new Date().toISOString(),
      reviewed_at:null,reviewed_by:null,review_reason:"",updated_at:new Date().toISOString()
    };
    let result;
    if(existing){
      result=await admin.from("marketplace_seller_profiles").update(values).eq("user_id",userId)
        .select("user_id,status,identity_status,payout_status,store_name,created_at,updated_at").single();
    }else{
      result=await admin.from("marketplace_seller_profiles").insert({...values,user_id:userId})
        .select("user_id,status,identity_status,payout_status,store_name,created_at,updated_at").single();
    }
    if(result.error)return fail(result.error,"Seller application could not be submitted.");
    const {error:eventError}=await admin.from("marketplace_seller_verification_events").insert({
      seller_id:userId,actor_id:userId,event_type:"submitted",
      reason:existing?"Resubmitted after rejection":"New application"
    });
    if(eventError)return json(503,{error:"Seller application was saved but its verification audit event could not be written."});
    await admin.from("marketplace_seller_public_profiles").upsert({
      user_id:userId,store_name:storeName,description,country_code:countryCode,status:"inactive",updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    return json(201,{seller:{
      userId:result.data.user_id,status:result.data.status,identityStatus:result.data.identity_status,
      payoutStatus:result.data.payout_status,storeName:result.data.store_name,
      createdAt:result.data.created_at,updatedAt:result.data.updated_at
    }});
  }

  if (action === "marketplace_seller_review") {
    const actorId=String(input.actorId||""),sellerId=String(input.sellerId||"");
    const status=String(input.status||""),identityStatus=String(input.identityStatus||"");
    const reason=String(input.reason||"").trim().slice(0,1000);
    if(!validUuid(actorId)||!validUuid(sellerId)||!["approved","rejected","suspended","pending"].includes(status)||
       !["not_started","pending","verified","rejected"].includes(identityStatus)||!reason){
      return json(400,{error:"A valid seller review decision and audit reason are required."});
    }
    if(status==="approved"&&identityStatus!=="verified")return json(409,{error:"Identity or business verification must be completed before approval."});
    const {data:seller,error:lookupError}=await admin.from("marketplace_seller_profiles")
      .select("user_id,store_name,description,country_code,status").eq("user_id",sellerId).maybeSingle();
    if(lookupError)return json(503,{error:"Seller application could not be loaded."});
    if(!seller)return json(404,{error:"Seller application not found."});
    const stamp=new Date().toISOString();
    const {data,error}=await admin.from("marketplace_seller_profiles").update({
      status,identity_status:identityStatus,reviewed_at:stamp,reviewed_by:actorId,
      review_reason:reason,updated_at:stamp
    }).eq("user_id",sellerId)
      .select("user_id,status,identity_status,payout_status,store_name").single();
    if(error)return fail(error,"Seller review could not be saved.");
    const eventType=identityStatus==="verified"?"identity_verified":status;
    const {error:eventError}=await admin.from("marketplace_seller_verification_events").insert({
      seller_id:sellerId,actor_id:actorId,event_type:eventType,reason
    });
    if(eventError)return json(503,{error:"Seller review saved but audit event recording failed."});
    const publicStatus=status==="approved"&&identityStatus==="verified"?"active":"inactive";
    const {error:publicError}=await admin.from("marketplace_seller_public_profiles").upsert({
      user_id:sellerId,store_name:seller.store_name,description:seller.description,
      country_code:seller.country_code,status:publicStatus,updated_at:stamp
    },{onConflict:"user_id"});
    if(publicError)return json(503,{error:"Seller review saved but public storefront status could not be synchronized."});
    await admin.from("audit_log").insert({
      actor_id:actorId,action:"marketplace_seller_reviewed",target_type:"marketplace_seller",
      target_id:sellerId,metadata:{status,identityStatus,reason}
    });
    return json(200,{seller:{userId:data.user_id,status:data.status,identityStatus:data.identity_status,payoutStatus:data.payout_status,storeName:data.store_name}});
  }

  if (action === "marketplace_seller_admin_list") {
    const status=String(input.status||"pending");
    if(!["pending","approved","rejected","suspended"].includes(status))return json(400,{error:"Invalid seller application filter."});
    const {data,error}=await admin.from("marketplace_seller_profiles")
      .select("user_id,seller_type,store_name,description,country_code,contact_email,status,identity_status,payout_status,created_at,reviewed_at")
      .eq("status",status).order("created_at",{ascending:false}).limit(200);
    if(error)return json(503,{error:"Seller applications could not be loaded."});
    return json(200,{sellers:(data||[]).map((row:any)=>({
      userId:row.user_id,sellerType:row.seller_type,storeName:row.store_name,description:row.description,
      countryCode:row.country_code,contactEmail:row.contact_email,status:row.status,
      identityStatus:row.identity_status,payoutStatus:row.payout_status,submittedAt:row.created_at,reviewedAt:row.reviewed_at
    }))});
  }

  if (action === "marketplace_seller_queue") {
    const [sellerResult,jobResult]=await Promise.all([
      admin.from("marketplace_seller_profiles")
        .select("user_id,seller_type,store_name,description,country_code,contact_email,status,identity_status,payout_status,created_at")
        .eq("status","pending").order("created_at",{ascending:true}).limit(200),
      admin.from("marketplace_job_postings")
        .select("id,employer_id,title,company_name,description,category,employment_type,workplace_type,location_label,created_at")
        .eq("status","pending_review").order("created_at",{ascending:true}).limit(200)
    ]);
    if(sellerResult.error||jobResult.error)return json(503,{error:"Marketplace moderation queue is unavailable."});
    const cfg=await admin.from("marketplace_payment_configuration")
      .select("provider,marketplace_approval_status,checkout_enabled,payouts_enabled,tax_calculation_enabled")
      .eq("singleton",true).maybeSingle();
    const blockers=[];
    if(!cfg.data?.checkout_enabled||cfg.data?.marketplace_approval_status!=="approved")blockers.push("Marketplace provider approval and buyer payment processing are not enabled.");
    if(!cfg.data?.payouts_enabled)blockers.push("Marketplace seller payouts are not enabled.");
    if(!cfg.data?.tax_calculation_enabled)blockers.push("Tax and customs calculations are not configured.");
    return json(200,{
      sellers:(sellerResult.data||[]).map(row=>({
        userId:row.user_id,sellerType:row.seller_type,storeName:row.store_name,description:row.description,
        countryCode:row.country_code,contactEmail:row.contact_email,status:row.status,
        identityStatus:row.identity_status,payoutStatus:row.payout_status,submittedAt:row.created_at
      })),
      jobs:(jobResult.data||[]).map(row=>({
        id:row.id,employerId:row.employer_id,title:row.title,companyName:row.company_name,
        description:row.description,category:row.category,employmentType:row.employment_type,
        workplaceType:row.workplace_type,location:row.location_label,createdAt:row.created_at
      })),
      commerce:{enabled:Boolean(cfg.data?.checkout_enabled&&cfg.data?.marketplace_approval_status==="approved"),blockers}
    });
  }

  if (action === "marketplace_listing_sync") {
    const userId=String(input.userId||""),listing=input.listing||{};
    if(!validUuid(userId)||!validUuid(listing.id)||String(listing.sellerId||"")!==userId)return json(400,{error:"Invalid Marketplace listing owner or ID."});
    const {data:seller,error:sellerError}=await admin.from("marketplace_seller_profiles")
      .select("status,identity_status").eq("user_id",userId).maybeSingle();
    if(sellerError)return json(503,{error:"Seller verification could not be checked."});
    if(seller?.status!=="approved"||seller?.identity_status!=="verified")return json(403,{error:"A verified and approved seller account is required to publish listings."});
    const kind=String(listing.kind||"product"),priceType=String(listing.priceType||"fixed");
    const currency=String(listing.currency||"JMD").toUpperCase();
    const status=String(listing.status||"active");
    if(!["product","service"].includes(kind)||!["fixed","from","hourly","quote"].includes(priceType)||
       !["JMD","USD","CAD","GBP","EUR","TTD","BBD","GYD"].includes(currency)||
       !["active","paused","sold","removed","archived","draft"].includes(status)){
      return json(400,{error:"Marketplace listing configuration is invalid."});
    }
    const priceMinor=listing.priceMinor==null?null:Number(listing.priceMinor);
    const quantity=kind==="product"?Number(listing.quantity):1;
    const fulfillment=Array.isArray(listing.fulfillment)?listing.fulfillment.map(String):[];
    if(kind==="product"&&(!Number.isSafeInteger(priceMinor)||priceMinor<=0||!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000||!fulfillment.length)){
      return json(400,{error:"Product price, stock or fulfilment settings are invalid."});
    }
    if(kind==="service"&&((priceType==="quote"&&priceMinor!==null)||(priceType!=="quote"&&(!Number.isSafeInteger(priceMinor)||priceMinor<=0)))){
      return json(400,{error:"Service pricing details are invalid."});
    }
    const dbStatus=status==="paused"?"archived":status;
    const row={
      id:listing.id,seller_id:userId,title:String(listing.title||"").trim().slice(0,180),
      description:String(listing.description||"").slice(0,5000),price_minor:priceMinor,currency,
      category:String(listing.category||"other"),condition:String(listing.condition||"unspecified"),
      location_label:String(listing.location||"").slice(0,160),status:dbStatus,kind,price_type:priceType,
      quantity,fulfillment_options:fulfillment,service_mode:listing.serviceMode||null,
      tags:Array.isArray(listing.tags)?listing.tags.map((tag:string)=>String(tag).slice(0,24)).slice(0,8):[]
    };
    if(row.title.length<5)return json(400,{error:"Listing title is too short."});
    const {data:existing,error:existingError}=await admin.from("marketplace_listings")
      .select("id,seller_id").eq("id",listing.id).maybeSingle();
    if(existingError)return json(503,{error:"Marketplace listing could not be checked."});
    if(existing&&existing.seller_id!==userId)return json(409,{error:"Listing ownership conflict."});
    const mediaIds=[...new Set((Array.isArray(listing.mediaIds)?listing.mediaIds:[]).map(String))];
    if(mediaIds.length>8)return json(400,{error:"A listing may contain no more than eight photos."});
    if(mediaIds.length){
      const {data:assets,error:assetError}=await admin.from("media_assets")
        .select("id,owner_id,slot,asset_status,media_type,storage_bucket,storage_key").in("id",mediaIds);
      if(assetError||(assets||[]).length!==mediaIds.length||(assets||[]).some((asset:any)=>
        asset.owner_id!==userId||asset.slot!=="marketplace"||asset.asset_status!=="uploaded"||
        asset.media_type!=="image"||!asset.storage_bucket||!asset.storage_key
      ))return json(400,{error:"One or more listing photos are not completed Marketplace images owned by this seller."});
    }
    const {data:existing,error:existingError}=await admin.from("marketplace_listings")
      .select("id,seller_id").eq("id",listing.id).maybeSingle();
    if(existingError)return json(503,{error:"Marketplace listing could not be checked."});
    if(existing&&existing.seller_id!==userId)return json(409,{error:"Listing ownership conflict."});
    const {data:saved,error}=await admin.from("marketplace_listings").upsert(row,{onConflict:"id"}).select("*").single();
    if(error)return fail(error,"Marketplace listing could not be saved to the commerce database.");
    const {error:deleteError}=await admin.from("listing_media").delete().eq("listing_id",listing.id);
    if(deleteError)return json(503,{error:"Listing saved but photo associations could not be refreshed."});
    if(mediaIds.length){
      const {error:mediaError}=await admin.from("listing_media").insert(mediaIds.map((assetId:string,index:number)=>({listing_id:listing.id,asset_id:assetId,sort_order:index})));
      if(mediaError)return json(503,{error:"Listing saved but photo associations could not be refreshed."});
      const {error:attachError}=await admin.from("media_assets").update({asset_status:"attached",attached_to:"marketplace:"+listing.id}).in("id",mediaIds).eq("owner_id",userId);
      if(attachError)return json(503,{error:"Listing photos were linked but their asset state could not be updated."});
    }
    return json(200,{listing:{id:saved.id,sellerId:saved.seller_id,title:saved.title,description:saved.description,
      priceMinor:saved.price_minor,currency:saved.currency,category:saved.category,condition:saved.condition,
      location:saved.location_label,status:saved.status==="archived"?"paused":saved.status,kind:saved.kind,
      priceType:saved.price_type,quantity:saved.quantity,fulfillment:saved.fulfillment_options,
      serviceMode:saved.service_mode,tags:saved.tags,mediaIds,createdAt:saved.created_at,updatedAt:saved.updated_at}});
  }

  if (action === "marketplace_listing_set_status") {
    const userId=String(input.userId||""),listingId=String(input.listingId||""),status=String(input.status||"");
    if(!validUuid(userId)||!validUuid(listingId)||!["active","paused","sold","removed"].includes(status))return json(400,{error:"Invalid listing status change."});
    const {data:listing,error:lookupError}=await admin.from("marketplace_listings").select("id,seller_id,kind,quantity,reserved_quantity")
      .eq("id",listingId).maybeSingle();
    if(lookupError)return json(503,{error:"Marketplace listing could not be loaded."});
    if(!listing)return json(404,{error:"Marketplace listing not found."});
    if(listing.seller_id!==userId)return json(403,{error:"Only the seller can manage this listing."});
    if(status==="active"&&listing.kind==="product"&&Number(listing.quantity)<1)return json(409,{error:"Add available stock before reactivating this product."});
    if(status==="sold"&&Number(listing.reserved_quantity||0)>0)return json(409,{error:"This product has stock reserved by a pending order. Resolve that order before marking it sold."});
    const dbStatus=status==="paused"?"archived":status;
    const {data,error}=await admin.from("marketplace_listings").update({
      status:dbStatus,quantity:status==="sold"?0:listing.quantity,updated_at:new Date().toISOString()
    }).eq("id",listingId).select("*").single();
    if(error)return fail(error,"Marketplace listing status could not be updated.");
    return json(200,{listing:{id:data.id,sellerId:data.seller_id,title:data.title,description:data.description,priceMinor:data.price_minor,currency:data.currency,category:data.category,condition:data.condition,location:data.location_label,status:data.status==="archived"?"paused":data.status,kind:data.kind,priceType:data.price_type,quantity:data.quantity,fulfillment:data.fulfillment_options,serviceMode:data.service_mode,tags:data.tags,updatedAt:data.updated_at}});
  }


  if (action === "marketplace_listings_list" || action === "marketplace_listing_get") {
    const userId=String(input.userId||""),mode=String(input.mode||"browse");
    if(!validUuid(userId))return json(400,{error:"Invalid Marketplace viewer."});
    if(action==="marketplace_listing_get"&&!validUuid(String(input.listingId||"")))return json(400,{error:"Invalid Marketplace listing ID."});
    const limit=Math.max(1,Math.min(60,Number(input.limit)||36));
    const offset=Math.max(0,Math.min(10000,Number(input.offset)||0));
    let savedRows:any[]=[];
    let query=admin.from("marketplace_listings").select("*",{count:"exact"});
    if(action==="marketplace_listing_get"){
      query=query.eq("id",input.listingId);
    }else if(mode==="mine"){
      query=query.eq("seller_id",userId);
    }else if(mode==="saved"){
      const {data,error}=await admin.from("marketplace_saved_listings").select("listing_id,created_at")
        .eq("user_id",userId).order("created_at",{ascending:false}).limit(500);
      if(error)return json(503,{error:"Saved Marketplace listings could not be loaded."});
      savedRows=data||[];
      const ids=savedRows.map((row:any)=>row.listing_id);
      if(!ids.length)return json(200,{listings:[],total:0});
      query=query.in("id",ids).eq("status","active");
    }else{
      query=query.eq("status","active");
    }
    const kind=String(input.kind||"");
    if(kind==="product"||kind==="service")query=query.eq("kind",kind);
    if(input.category)query=query.eq("category",String(input.category));
    const location=String(input.location||"").trim().slice(0,120).replace(/[%_,()]/g," ");
    if(location)query=query.ilike("location_label","%"+location+"%");
    const q=String(input.q||"").trim().slice(0,100).replace(/[^\p{L}\p{N}\s-]/gu," ");
    if(q)query=query.or("title.ilike.%"+q+"%,description.ilike.%"+q+"%,category.ilike.%"+q+"%");
    const sort=String(input.sort||"recent");
    if(sort==="price_low")query=query.order("price_minor",{ascending:true,nullsFirst:false});
    else if(sort==="price_high")query=query.order("price_minor",{ascending:false,nullsFirst:false});
    else query=query.order("created_at",{ascending:false});
    if(action==="marketplace_listing_get")query=query.limit(1);
    else query=query.range(offset,offset+limit-1);
    const {data:rows,count,error}=await query;
    if(error)return json(503,{error:"Marketplace listings could not be loaded."});
    const listings=rows||[];
    if(action==="marketplace_listing_get"&&!listings.length)return json(404,{error:"Marketplace listing not found."});
    if(action==="marketplace_listing_get"&&listings[0].status!=="active"&&listings[0].seller_id!==userId){
      return json(404,{error:"Marketplace listing not found."});
    }
    const listingIds=listings.map((row:any)=>row.id);
    const sellerIds=[...new Set(listings.map((row:any)=>row.seller_id))];
    const [mediaResult,storeResult,profileResult,savedResult]=await Promise.all([
      listingIds.length?admin.from("listing_media").select("listing_id,asset_id,sort_order").in("listing_id",listingIds).order("sort_order",{ascending:true}):Promise.resolve({data:[],error:null}),
      sellerIds.length?admin.from("marketplace_seller_public_profiles").select("user_id,store_name,status").in("user_id",sellerIds):Promise.resolve({data:[],error:null}),
      sellerIds.length?admin.from("profiles").select("id,display_name,username").in("id",sellerIds):Promise.resolve({data:[],error:null}),
      listingIds.length?admin.from("marketplace_saved_listings").select("listing_id").eq("user_id",userId).in("listing_id",listingIds):Promise.resolve({data:[],error:null})
    ]);
    if(mediaResult.error||storeResult.error||profileResult.error||savedResult.error)return json(503,{error:"Marketplace listing details could not be loaded."});
    const mediaMap=new Map<string,string[]>();
    for(const media of mediaResult.data||[]){
      const current=mediaMap.get(media.listing_id)||[];
      current.push(media.asset_id);mediaMap.set(media.listing_id,current);
    }
    const storeMap=new Map((storeResult.data||[]).map((row:any)=>[row.user_id,row]));
    const profileMap=new Map((profileResult.data||[]).map((row:any)=>[row.id,row]));
    const savedSet=new Set((savedResult.data||[]).map((row:any)=>row.listing_id));
    const savedAtMap=new Map(savedRows.map((row:any)=>[row.listing_id,row.created_at]));
    const mapped=listings.map((row:any)=>{
      const profile=profileMap.get(row.seller_id),store=storeMap.get(row.seller_id);
      return {
        id:row.id,sellerId:row.seller_id,title:row.title,description:row.description,
        priceMinor:row.price_minor,currency:row.currency,category:row.category,condition:row.condition,
        location:row.location_label,status:row.status==="archived"?"paused":row.status,
        kind:row.kind,priceType:row.price_type,quantity:row.quantity,
        fulfillment:row.fulfillment_options,serviceMode:row.service_mode,tags:row.tags||[],
        mediaIds:mediaMap.get(row.id)||[],seller:{
          id:row.seller_id,name:profile?.display_name||store?.store_name||"Minglora seller",
          username:profile?.username||"",storeName:store?.store_name||null
        },
        isSaved:savedSet.has(row.id),savedAt:savedAtMap.get(row.id)||null,
        createdAt:row.created_at,updatedAt:row.updated_at
      };
    });
    if(action==="marketplace_listing_get")return json(200,{listing:mapped[0]});
    return json(200,{listings:mapped,total:count??mapped.length});
  }

  if (action === "marketplace_checkout_quote") {
    const buyerId=String(input.buyerId||"");
    if(!validUuid(buyerId))return json(400,{error:"Sign in before preparing a checkout quote."});
    const {data,error}=await admin.rpc("create_marketplace_checkout_quote",{
      p_buyer_id:buyerId,p_items:input.items,p_fulfillment_by_listing:input.fulfillmentByListing||{}
    });
    if(error)return fail(error,"A checkout quote could not be calculated.");
    return json(200,{quote:data,notice:"This is an informational quote only. No stock is reserved and no payment has been taken."});
  }

  if (action === "marketplace_checkout_status") {
    const {data,error}=await admin.from("marketplace_payment_configuration")
      .select("provider,marketplace_approval_status,checkout_enabled,payouts_enabled,tax_calculation_enabled")
      .eq("singleton",true).maybeSingle();
    if(error||!data)return json(503,{error:"Marketplace payment configuration is unavailable."});
    const blockers=[];
    if(data.marketplace_approval_status!=="approved")blockers.push("Marketplace provider approval has not been confirmed.");
    if(!data.checkout_enabled)blockers.push("Buyer checkout is disabled.");
    if(!data.payouts_enabled)blockers.push("Seller payouts are disabled.");
    if(!data.tax_calculation_enabled)blockers.push("Tax and customs calculation is not configured.");
    if(!data.provider)blockers.push("No marketplace payment provider is configured.");
    return json(200,{enabled:Boolean(data.checkout_enabled&&data.marketplace_approval_status==="approved"&&data.provider&&data.tax_calculation_enabled),
      orderCreationEnabled:false,payoutsEnabled:Boolean(data.payouts_enabled&&data.marketplace_approval_status==="approved"),
      provider:data.provider||null,blockers});
  }

  if (action === "marketplace_bookings_list") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid user."});
    const {data:rows,error}=await admin.from("marketplace_service_bookings").select("*")
      .or("buyer_id.eq."+userId+",seller_id.eq."+userId).order("starts_at",{ascending:true}).limit(200);
    if(error)return json(503,{error:"Service bookings could not be loaded."});
    const listingIds=[...new Set((rows||[]).map((row:any)=>row.listing_id))];
    const otherIds=[...new Set((rows||[]).map((row:any)=>row.buyer_id===userId?row.seller_id:row.buyer_id))];
    const [listingsResult,peopleResult]=await Promise.all([
      listingIds.length?admin.from("marketplace_listings").select("id,title").in("id",listingIds):Promise.resolve({data:[],error:null}),
      otherIds.length?admin.from("profiles").select("id,display_name").in("id",otherIds):Promise.resolve({data:[],error:null})
    ]);
    if(listingsResult.error||peopleResult.error)return json(503,{error:"Booking details could not be loaded."});
    const listingMap=new Map((listingsResult.data||[]).map((item:any)=>[item.id,item.title]));
    const personMap=new Map((peopleResult.data||[]).map((item:any)=>[item.id,item.display_name]));
    return json(200,{bookings:(rows||[]).map((row:any)=>({
      id:row.id,listingId:row.listing_id,buyerId:row.buyer_id,sellerId:row.seller_id,
      status:row.status,startAt:row.starts_at,endAt:row.ends_at,durationMinutes:row.duration_minutes,
      priceMinor:row.price_minor,currency:row.currency,message:row.buyer_message,
      completionConfirmedAt:row.completion_confirmed_at,createdAt:row.created_at,updatedAt:row.updated_at,
      listingTitle:listingMap.get(row.listing_id)||"Service appointment",
      otherName:personMap.get(row.buyer_id===userId?row.seller_id:row.buyer_id)||"Minglora member"
    }))});
  }

  if (action === "marketplace_booking_create") {
    const buyerId=String(input.buyerId||"");
    if(!validUuid(buyerId))return json(400,{error:"Sign in before requesting an appointment."});
    const {data,error}=await admin.rpc("create_marketplace_service_booking",{
      p_buyer_id:buyerId,p_listing_id:input.listingId,p_start_at:input.startAt,
      p_duration_minutes:input.durationMinutes,p_message:String(input.message||"")
    });
    if(error)return fail(error,"Service appointment could not be requested.");
    return json(201,{booking:data});
  }

  if (action === "marketplace_booking_update") {
    const actorId=String(input.actorId||"");
    if(!validUuid(actorId)||!validUuid(String(input.bookingId||"")))return json(400,{error:"Invalid booking update."});
    const {data,error}=await admin.rpc("transition_marketplace_service_booking",{
      p_booking_id:input.bookingId,p_actor_id:actorId,p_next_status:input.status
    });
    if(error)return fail(error,"Service appointment could not be updated.");
    return json(200,{booking:data});
  }

  if (action === "marketplace_jobs_list" || action === "marketplace_jobs_mine") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid user."});
    let query=admin.from("marketplace_job_postings").select("*");
    if(action==="marketplace_jobs_mine")query=query.eq("employer_id",userId);
    else query=query.eq("status","open").gt("application_deadline",new Date().toISOString());
    const q=String(input.q||"").trim().slice(0,100);
    if(q&&action==="marketplace_jobs_list"){
      const safeQ=q.replace(/[%_,]/g," ").trim();
      if(safeQ)query=query.or("title.ilike.%"+safeQ+"%,company_name.ilike.%"+safeQ+"%,description.ilike.%"+safeQ+"%");
    }
    if(input.category&&action==="marketplace_jobs_list")query=query.eq("category",String(input.category));
    if(input.location&&action==="marketplace_jobs_list")query=query.ilike("location_label","%"+String(input.location).slice(0,120)+"%");
    const {data,error}=await query.order("created_at",{ascending:false}).limit(100);
    if(error)return json(503,{error:"Job vacancies could not be loaded."});
    return json(200,{jobs:(data||[]).map((row:any)=>({
      id:row.id,employerId:row.employer_id,companyName:row.company_name,title:row.title,
      description:row.description,category:row.category,employmentType:row.employment_type,
      workplaceType:row.workplace_type,location:row.location_label,currency:row.currency,
      salaryMinMinor:row.salary_min_minor,salaryMaxMinor:row.salary_max_minor,
      applicationDeadline:row.application_deadline,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at
    }))});
  }

  if (action === "marketplace_jobs_create") {
    const employerId=String(input.employerId||"");
    if(!validUuid(employerId))return json(400,{error:"Invalid employer."});
    const job=input.job||{};
    const title=String(job.title||"").trim(),companyName=String(job.companyName||"").trim();
    const description=String(job.description||"").trim(),deadline=new Date(job.applicationDeadline);
    if(title.length<5||companyName.length<2||description.length<50||description.length>6000||
       !Number.isFinite(deadline.getTime())||deadline<=new Date())return json(400,{error:"Job posting details or application deadline are invalid."});
    const {data,error}=await admin.from("marketplace_job_postings").insert({
      employer_id:employerId,company_name:companyName,title,description,category:job.category,
      employment_type:job.employmentType,workplace_type:job.workplaceType,location_label:job.location||"",
      currency:job.currency||"JMD",salary_min_minor:job.salaryMinMinor,salary_max_minor:job.salaryMaxMinor,
      application_deadline:deadline.toISOString(),status:"pending_review"
    }).select("*").single();
    if(error)return fail(error,"Job vacancy could not be submitted.");
    return json(201,{job:{id:data.id,employerId:data.employer_id,companyName:data.company_name,title:data.title,
      description:data.description,category:data.category,employmentType:data.employment_type,workplaceType:data.workplace_type,
      location:data.location_label,currency:data.currency,salaryMinMinor:data.salary_min_minor,salaryMaxMinor:data.salary_max_minor,
      applicationDeadline:data.application_deadline,status:data.status,createdAt:data.created_at}});
  }

  if (action === "marketplace_job_review") {
    const actorId=String(input.actorId||"");
    if(!validUuid(actorId)||!validUuid(String(input.jobId||""))||!["open","rejected"].includes(String(input.status||""))||!String(input.reason||"").trim()){
      return json(400,{error:"A valid vacancy moderation decision and reason are required."});
    }
    const {data,error}=await admin.from("marketplace_job_postings").update({
      status:input.status,reviewed_by:actorId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq("id",input.jobId).eq("status","pending_review").select("*").maybeSingle();
    if(error)return fail(error,"Job moderation decision could not be saved.");
    if(!data)return json(404,{error:"Pending job vacancy not found."});
    await admin.from("audit_log").insert({
      actor_id:actorId,action:"job_posting_"+String(input.status),target_type:"job_posting",
      target_id:String(input.jobId),metadata:{reason:String(input.reason).slice(0,1000)}
    });
    return json(200,{job:{id:data.id,employerId:data.employer_id,title:data.title,status:data.status,reviewedAt:data.reviewed_at}});
  }

  if (action === "marketplace_job_update") {
    const userId=String(input.userId||""),jobId=String(input.jobId||""),status=String(input.status||"");
    if(!validUuid(userId)||!validUuid(jobId)||!["paused","closed"].includes(status))return json(400,{error:"Invalid job status update."});
    const {data,error}=await admin.from("marketplace_job_postings").update({status,updated_at:new Date().toISOString()})
      .eq("id",jobId).eq("employer_id",userId).in("status",["open","paused"]).select("id,status").maybeSingle();
    if(error)return fail(error,"Job vacancy could not be updated.");
    if(!data)return json(404,{error:"Open vacancy not found."});
    return json(200,{job:{id:data.id,status:data.status}});
  }

  if (action === "marketplace_job_apply") {
    const applicantId=String(input.applicantId||""),jobId=String(input.jobId||"");
    const coverLetter=String(input.coverLetter||"").trim().slice(0,5000);
    if(!validUuid(applicantId)||!validUuid(jobId)||coverLetter.length<30)return json(400,{error:"Add a valid cover letter to apply."});
    const {data:job,error:jobError}=await admin.from("marketplace_job_postings")
      .select("id,employer_id,status,application_deadline").eq("id",jobId).maybeSingle();
    if(jobError)return json(503,{error:"Vacancy details could not be loaded."});
    if(!job||job.status!=="open"||new Date(job.application_deadline)<=new Date()||job.employer_id===applicantId){
      return json(404,{error:"This vacancy is unavailable for applications."});
    }
    const {data,error}=await admin.from("marketplace_job_applications")
      .insert({job_id:jobId,applicant_id:applicantId,cover_letter:coverLetter,status:"submitted"})
      .select("id,job_id,applicant_id,status,cover_letter,created_at").single();
    if(error){
      if(error.code==="23505")return json(409,{error:"You have already applied for this vacancy."});
      return fail(error,"Job application could not be submitted.");
    }
    return json(201,{application:{id:data.id,jobId:data.job_id,applicantId:data.applicant_id,status:data.status,coverLetter:data.cover_letter,createdAt:data.created_at}});
  }

  if (action === "marketplace_job_applications_for_job") {
    const viewerId=String(input.viewerId||""),jobId=String(input.jobId||"");
    if(!validUuid(viewerId)||!validUuid(jobId))return json(400,{error:"Invalid job application request."});
    const {data:job,error:jobError}=await admin.from("marketplace_job_postings")
      .select("id,employer_id").eq("id",jobId).maybeSingle();
    if(jobError)return json(503,{error:"Vacancy could not be loaded."});
    if(!job||job.employer_id!==viewerId)return json(403,{error:"Only the employer can review applicants."});
    const {data:rows,error}=await admin.from("marketplace_job_applications")
      .select("id,job_id,applicant_id,status,cover_letter,created_at,updated_at")
      .eq("job_id",jobId).order("created_at",{ascending:false}).limit(200);
    if(error)return json(503,{error:"Job applications could not be loaded."});
    const ids=[...new Set((rows||[]).map((row:any)=>row.applicant_id))];
    const {data:people,error:peopleError}=ids.length
      ?await admin.from("profiles").select("id,display_name,username").in("id",ids)
      :{data:[],error:null};
    if(peopleError)return json(503,{error:"Candidate profiles could not be loaded."});
    const profiles=new Map((people||[]).map((row:any)=>[row.id,{id:row.id,name:row.display_name,username:row.username}]));
    return json(200,{applications:(rows||[]).map((row:any)=>({
      id:row.id,jobId:row.job_id,applicantId:row.applicant_id,status:row.status,
      coverLetter:row.cover_letter,createdAt:row.created_at,updatedAt:row.updated_at,
      candidate:profiles.get(row.applicant_id)||null
    }))});
  }

  if (action === "marketplace_job_applications_mine") {
    const applicantId=String(input.applicantId||"");
    if(!validUuid(applicantId))return json(400,{error:"Invalid candidate."});
    const {data:rows,error}=await admin.from("marketplace_job_applications")
      .select("id,job_id,applicant_id,status,cover_letter,created_at,updated_at")
      .eq("applicant_id",applicantId).order("created_at",{ascending:false}).limit(200);
    if(error)return json(503,{error:"Your job applications could not be loaded."});
    const ids=[...new Set((rows||[]).map((row:any)=>row.job_id))];
    const {data:jobs,error:jobsError}=ids.length
      ?await admin.from("marketplace_job_postings").select("id,title,company_name,location_label,employment_type").in("id",ids)
      :{data:[],error:null};
    if(jobsError)return json(503,{error:"Job details could not be loaded."});
    const jobMap=new Map((jobs||[]).map((row:any)=>[row.id,{id:row.id,title:row.title,companyName:row.company_name,location:row.location_label,employmentType:row.employment_type}]));
    return json(200,{applications:(rows||[]).map((row:any)=>({
      id:row.id,jobId:row.job_id,applicantId:row.applicant_id,status:row.status,
      coverLetter:row.cover_letter,createdAt:row.created_at,updatedAt:row.updated_at,job:jobMap.get(row.job_id)||null
    }))});
  }

  if (action === "marketplace_job_application_update") {
    const actorId=String(input.actorId||""),applicationId=String(input.applicationId||""),nextStatus=String(input.status||"");
    if(!validUuid(actorId)||!validUuid(applicationId)||!["reviewed","shortlisted","rejected","hired","withdrawn"].includes(nextStatus)){
      return json(400,{error:"Invalid application status update."});
    }
    const {data:application,error:appError}=await admin.from("marketplace_job_applications")
      .select("id,job_id,applicant_id,status").eq("id",applicationId).maybeSingle();
    if(appError)return json(503,{error:"Job application could not be loaded."});
    if(!application)return json(404,{error:"Application not found."});
    const {data:job,error:jobError}=await admin.from("marketplace_job_postings")
      .select("id,employer_id").eq("id",application.job_id).maybeSingle();
    if(jobError)return json(503,{error:"Vacancy could not be loaded."});
    const isApplicant=application.applicant_id===actorId,isEmployer=job?.employer_id===actorId;
    if(!isApplicant&&!isEmployer)return json(403,{error:"You are not permitted to manage this application."});
    const allowed:Record<string,string[]>={submitted:["reviewed","shortlisted","rejected","withdrawn"],reviewed:["shortlisted","rejected","withdrawn"],shortlisted:["hired","rejected","withdrawn"],rejected:[],hired:[],withdrawn:[]};
    if(!(allowed[application.status]||[]).includes(nextStatus))return json(409,{error:"This application status transition is not permitted."});
    if(nextStatus==="withdrawn"&&!isApplicant)return json(403,{error:"Only the applicant can withdraw this application."});
    if(nextStatus!=="withdrawn"&&!isEmployer)return json(403,{error:"Only the employer can update hiring status."});
    const {data,error}=await admin.from("marketplace_job_applications").update({
      status:nextStatus,updated_at:new Date().toISOString()
    }).eq("id",applicationId).eq("status",application.status)
      .select("id,job_id,applicant_id,status,updated_at").maybeSingle();
    if(error)return fail(error,"Application status could not be updated.");
    if(!data)return json(409,{error:"This application was updated by another request. Refresh and try again."});
    return json(200,{application:{id:data.id,jobId:data.job_id,applicantId:data.applicant_id,status:data.status,updatedAt:data.updated_at}});
  }

  if (action === "marketplace_saved_listings_list") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid user."});
    const {data,error}=await admin.from("marketplace_saved_listings")
      .select("listing_id,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(500);
    if(error)return json(503,{error:"Saved Marketplace listings could not be loaded."});
    return json(200,{saved:(data||[]).map((row:any)=>({listingId:row.listing_id,createdAt:row.created_at}))});
  }

  if (action === "marketplace_listing_save") {
    const userId=String(input.userId||""),listingId=String(input.listingId||""),save=input.save===true;
    if(!validUuid(userId)||!validUuid(listingId))return json(400,{error:"Invalid saved listing."});
    if(save){
      const {data:listing,error:listingError}=await admin.from("marketplace_listings").select("id,status").eq("id",listingId).maybeSingle();
      if(listingError)return json(503,{error:"Marketplace listing could not be checked."});
      if(!listing||listing.status!=="active")return json(404,{error:"Marketplace listing not found."});
      const {error}=await admin.from("marketplace_saved_listings").upsert({user_id:userId,listing_id:listingId},{onConflict:"user_id,listing_id",ignoreDuplicates:true});
      if(error)return fail(error,"Marketplace listing could not be saved.");
    }else{
      const {error}=await admin.from("marketplace_saved_listings").delete().eq("user_id",userId).eq("listing_id",listingId);
      if(error)return fail(error,"Marketplace listing could not be removed from Saved.");
    }
    return json(200,{saved:save});
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
