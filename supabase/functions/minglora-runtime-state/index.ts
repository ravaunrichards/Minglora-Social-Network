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


const MARKETPLACE_PAYPAL_MODE = (Deno.env.get("MARKETPLACE_PAYPAL_MODE") || "sandbox").toLowerCase();
const MARKETPLACE_PAYPAL_BASE = (Deno.env.get("MARKETPLACE_PAYPAL_API_BASE_URL") ||
  (MARKETPLACE_PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com")).replace(/\/+$/, "");
function marketplacePayPalConfig() {
  const clientId=Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_ID")||"";
  const clientSecret=Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_SECRET")||"";
  const attributionId=Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"";
  const partnerMerchantId=Deno.env.get("MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID")||"";
  const webhookId=Deno.env.get("MARKETPLACE_PAYPAL_WEBHOOK_ID")||"";
  return {
    clientId,clientSecret,attributionId,partnerMerchantId,webhookId,
    base:MARKETPLACE_PAYPAL_BASE,
    configured:Boolean(clientId&&clientSecret&&attributionId&&partnerMerchantId&&webhookId)
  };
}

function marketplacePayPalAuthAssertion(sellerEmail:string):string {
  const cfg=marketplacePayPalConfig();
  const email=String(sellerEmail||"").trim().toLowerCase();
  if(!cfg.clientId||!/^\\S+@\\S+\\.\\S+$/.test(email)||email.length>254){
    throw new Error("A verified PayPal seller email and marketplace client ID are required.");
  }
  const encode=(value:Record<string,string>)=>btoa(JSON.stringify(value)).replace(/=+$/,"").replace(/\\+/g,"-").replace(/\\//g,"_");
  const header=encode({alg:"none"});
  const payload=encode({iss:cfg.clientId,email});
  return header+"."+payload+".";
}
let marketplacePayPalToken: { value: string; expiresAt: number } | null = null;
async function getMarketplacePayPalToken(): Promise<string> {
  const clientId=Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_ID")||"";
  const clientSecret=Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_SECRET")||"";
  if(!clientId||!clientSecret)throw new Error("Marketplace PayPal credentials are not configured.");
  if(marketplacePayPalToken&&marketplacePayPalToken.expiresAt>Date.now()+60000)return marketplacePayPalToken.value;
  const response=await fetch(MARKETPLACE_PAYPAL_BASE+"/v1/oauth2/token",{
    method:"POST",
    headers:{"Authorization":"Basic "+btoa(clientId+":"+clientSecret),"Content-Type":"application/x-www-form-urlencoded"},
    body:"grant_type=client_credentials"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error("Marketplace PayPal authentication failed.");
  marketplacePayPalToken={value:String(data.access_token),expiresAt:Date.now()+Math.max(60,Number(data.expires_in||300))*1000};
  return marketplacePayPalToken.value;
}

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
    "streambay_cleanup", "load", "save", "health", "media_sign", "media_upload_prepare", "media_upload_complete", "media_delete",
    "live_broadcast_create", "live_broadcast_end", "live_chat_list", "live_chat_send",
    "live_participant_mark_connected", "live_participant_mark_left", "live_speaker_request", "live_speaker_requests_list", "live_speaker_request_status",
    "live_speaker_request_review", "live_speaker_mark_connected", "live_speaker_mark_left",
    "economy_catalog", "economy_wallet", "economy_purchase_create", "economy_purchase_get",
    "economy_purchase_settle", "economy_send_gift", "economy_creator_earnings",
    "economy_get_payout_account", "economy_set_payout_account", "economy_request_payout",
    "economy_update_payout", "economy_payout_webhook", "relationship_follow", "relationship_unfollow",
    "auth_register_user", "account_deletion_request",
    "marketplace_cart_get", "marketplace_cart_add", "marketplace_cart_update", "marketplace_cart_remove", "marketplace_cart_clear",
    "marketplace_refund_request", "marketplace_refunds_admin_list", "marketplace_refund_approve",
    "marketplace_seller_get", "marketplace_seller_apply", "marketplace_seller_review", "marketplace_seller_queue", "marketplace_seller_admin_list",
    "marketplace_listing_sync", "marketplace_listing_set_status", "marketplace_listings_list", "marketplace_listing_get", "marketplace_checkout_quote", "marketplace_checkout_status",
    "marketplace_paypal_seller_get", "marketplace_paypal_seller_start", "marketplace_paypal_seller_callback_state", "marketplace_paypal_seller_complete",
    "marketplace_paypal_payment_prepare", "marketplace_paypal_capture_execute", "marketplace_paypal_order_saved", "marketplace_paypal_capture_record", "marketplace_paypal_payment_failed", "marketplace_paypal_webhook_receive", "marketplace_paypal_webhook_record", "marketplace_paypal_payout_release", "marketplace_paypal_payout_webhook", "marketplace_financial_reconcile", "marketplace_seller_payouts",
    "marketplace_order_create", "marketplace_orders_list", "marketplace_order_get", "marketplace_order_cancel", "marketplace_inventory_expire",
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
    const ringtone={"audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","audio/wav":"wav","audio/x-wav":"wav","audio/flac":"flac","audio/aac":"aac"};
    const allowed=slot==="avatar"||slot==="cover"?image:slot==="post"?post:slot==="story"?story:slot==="group"||slot==="page"?communityMedia:slot==="marketplace"?image:slot==="message"?message:slot==="ringtone"?ringtone:{};
    const bucket=slot==="avatar"?"minglora-avatars":slot==="cover"?"minglora-covers":slot==="post"||slot==="marketplace"?"minglora-post-media":slot==="story"?"minglora-stories":slot==="group"?"minglora-group-media":slot==="page"?"minglora-page-media":slot==="message"?"minglora-message-attachments":slot==="ringtone"?"minglora-ringtones":"";
    const maxBytes=slot==="avatar"?10*1024*1024:slot==="cover"?20*1024*1024:slot==="marketplace"?15*1024*1024:slot==="story"?200*1024*1024:slot==="group"||slot==="page"?250*1024*1024:slot==="message"?100*1024*1024:slot==="ringtone"?20*1024*1024:slot==="post"?500*1024*1024:0;
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
      "minglora-page-media":["image/jpeg","image/png","image/webp","video/mp4"],
      "minglora-ringtones":["audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/flac","audio/aac"]
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
      (["audio/wav","audio/x-wav"].includes(mimeType)&&ascii(0,4)==="RIFF"&&ascii(8,12)==="WAVE")||
      (mimeType==="audio/flac"&&ascii(0,4)==="fLaC")||
      (mimeType==="audio/aac"&&prefix[0]===0xff&&(prefix[1]&0xf6)===0xf0)||
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
    const allowedBuckets=["minglora-avatars","minglora-covers","minglora-post-media","minglora-stories","minglora-short-videos","minglora-message-attachments","minglora-group-media","minglora-page-media","minglora-marketplace-media","minglora-live-thumbnails","minglora-data-exports","minglora-ringtones"];
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
    if(!uuidPattern.test(ownerId)||!["minglora-post-media","minglora-stories","minglora-avatars","minglora-covers","minglora-message-attachments","minglora-group-media","minglora-page-media","minglora-ringtones"].includes(bucket)||!objectPath.startsWith(ownerId+"/")||objectPath.includes("..")){
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



  if (action === "marketplace_paypal_seller_get") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid seller account."});
    const {data,error}=await admin.from("marketplace_seller_paypal_accounts")
      .select("onboarding_status,account_type,permissions_granted,consent_granted,primary_email_confirmed,payments_receivable,requested_features,granted_features,products,last_checked_at,status_reason")
      .eq("user_id",userId).maybeSingle();
    if(error)return json(503,{error:"PayPal seller connection status could not be loaded."});
    return json(200,{paypal:data?{
      status:data.onboarding_status,accountType:data.account_type,permissionsGranted:data.permissions_granted,
      consentGranted:data.consent_granted,emailConfirmed:data.primary_email_confirmed,
      paymentsReceivable:data.payments_receivable,requestedFeatures:data.requested_features,
      grantedFeatures:data.granted_features,products:data.products,lastCheckedAt:data.last_checked_at,
      reason:data.status_reason
    }:{status:"not_started",accountType:"unknown",permissionsGranted:false,consentGranted:false,
      emailConfirmed:false,paymentsReceivable:false,requestedFeatures:[],grantedFeatures:[],products:[]}});
  }

  if (action === "marketplace_paypal_seller_start") {
    const userId=String(input.userId||"");
    const callbackState=String(input.callbackState||"");
    const returnUrl=String(input.returnUrl||"");
    const shareDataConsent=input.shareDataConsent===true;
    if(!validUuid(userId)||!shareDataConsent||callbackState.length<48||callbackState.length>160||
       !/^[a-zA-Z0-9_-]+$/.test(callbackState)||!/^https:\/\//i.test(returnUrl)){
      return json(400,{error:"A secure onboarding state, HTTPS return URL and explicit PayPal data-sharing consent are required."});
    }
    const {data:seller,error:sellerError}=await admin.from("marketplace_seller_profiles")
      .select("user_id,seller_type,status,identity_status,country_code,contact_email")
      .eq("user_id",userId).maybeSingle();
    if(sellerError)return json(503,{error:"Seller eligibility could not be checked."});
    if(!seller||seller.status!=="approved"||seller.identity_status!=="verified"){
      return json(403,{error:"Minglora seller approval and identity verification are required before connecting PayPal."});
    }
    if(seller.seller_type!=="business"){
      return json(409,{error:"This PayPal marketplace route currently requires an approved registered-business seller profile and a PayPal Business account."});
    }
    const {data:existing,error:existingError}=await admin.from("marketplace_seller_paypal_accounts")
      .select("onboarding_status,merchant_id").eq("user_id",userId).maybeSingle();
    if(existingError)return json(503,{error:"Existing PayPal seller connection could not be checked."});
    if(existing?.onboarding_status==="verified"&&existing.merchant_id){
      return json(409,{error:"This seller already has a verified PayPal connection."});
    }
    const cfg=marketplacePayPalConfig();
    if(!cfg.clientId||!cfg.clientSecret||!cfg.attributionId){
      return json(503,{error:"Marketplace-specific PayPal partner credentials and attribution ID are not configured."});
    }
    const callback=new URL(returnUrl);
    callback.searchParams.set("marketplacePayPal","complete");
    callback.searchParams.set("state",callbackState);
    const requestedFeatures=["PAYMENT","REFUND","PARTNER_FEE","DELAY_FUNDS_DISBURSEMENT"];
    let referralResponse:Response;
    try {
      const token=await getMarketplacePayPalToken();
      referralResponse=await fetch(cfg.base+"/v2/customer/partner-referrals",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "PayPal-Partner-Attribution-Id":cfg.attributionId
        },
        body:JSON.stringify({
          tracking_id:userId,
          email:String(seller.contact_email||"").trim().toLowerCase(),
          partner_config_override:{
            return_url:callback.toString(),
            return_url_description:"Return to Minglora Seller Centre after PayPal verification"
          },
          operations:[{
            operation:"API_INTEGRATION",
            api_integration_preference:{
              rest_api_integration:{
                integration_method:"PAYPAL",
                integration_type:"THIRD_PARTY",
                third_party_details:{features:requestedFeatures}
              }
            }
          }],
          products:["EXPRESS_CHECKOUT"],
          legal_consents:[{type:"SHARE_DATA_CONSENT",granted:true}]
        })
      });
    } catch {
      return json(503,{error:"Minglora could not reach PayPal seller onboarding. No payout account was connected."});
    }
    const referral=await referralResponse.json().catch(()=>({}));
    if(!referralResponse.ok){
      return json(502,{error:"PayPal did not create the seller onboarding referral.",providerIssue:String(referral?.name||referral?.message||"PARTNER_REFERRAL_FAILED").slice(0,160)});
    }
    const actionLink=Array.isArray(referral?.links)?referral.links.find((item:any)=>item?.rel==="action_url"):null;
    let actionUrl="";
    try {
      const parsed=new URL(String(actionLink?.href||""));
      if(parsed.protocol==="https:"&&["www.paypal.com","www.sandbox.paypal.com","paypal.com","sandbox.paypal.com"].includes(parsed.hostname))actionUrl=parsed.toString();
    } catch {}
    if(!referral?.id||!actionUrl)return json(502,{error:"PayPal did not return a valid seller onboarding action URL."});
    const nonceHash=await sha256(callbackState);
    const {error:saveError}=await admin.from("marketplace_seller_paypal_accounts").upsert({
      user_id:userId,tracking_id:userId,partner_referral_id:String(referral.id),
      merchant_id:null,paypal_payer_id:null,paypal_account_email:null,
      onboarding_status:"started",account_type:"unknown",permissions_granted:false,
      consent_granted:true,primary_email_confirmed:false,payments_receivable:false,
      requested_features:requestedFeatures,granted_features:[],products:["EXPRESS_CHECKOUT"],
      callback_nonce_hash:nonceHash,last_checked_at:null,
      status_reason:"Seller has been redirected to PayPal to grant the requested marketplace permissions.",
      updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    if(saveError)return fail(saveError,"PayPal referral was created but Minglora could not save the onboarding state.");
    return json(201,{ok:true,trackingId:userId,partnerReferralId:String(referral.id),actionUrl,requestedFeatures});
  }

  if (action === "marketplace_paypal_seller_complete") {
    const userId=String(input.userId||"");
    const trackingId=String(input.trackingId||"");
    const merchantId=String(input.merchantId||"").trim();
    const callbackState=String(input.callbackState||"");
    const permissionsGranted=input.permissionsGranted===true;
    const consentGranted=input.consentGranted===true;
    const emailConfirmed=input.emailConfirmed===true;
    const accountType=String(input.accountType||"");
    if(!validUuid(userId)||trackingId!==userId||!merchantId||merchantId.length>64||
       callbackState.length<48||callbackState.length>160||!/^[a-zA-Z0-9_-]+$/.test(callbackState)||
       !permissionsGranted||!consentGranted||!emailConfirmed||accountType!=="BUSINESS_ACCOUNT"){
      return json(409,{error:"PayPal's seller onboarding return is incomplete. Complete the Business account setup, confirm the email and grant the requested permissions."});
    }
    const nonceHash=await sha256(callbackState);
    const {data:current,error:lookupError}=await admin.from("marketplace_seller_paypal_accounts")
      .select("tracking_id,callback_nonce_hash,onboarding_status,requested_features")
      .eq("user_id",userId).maybeSingle();
    if(lookupError)return json(503,{error:"Saved PayPal seller onboarding could not be checked."});
    if(!current||current.tracking_id!==trackingId||!current.callback_nonce_hash||
       !constantTimeEqual(current.callback_nonce_hash,nonceHash)||current.onboarding_status!=="started"){
      return json(403,{error:"The PayPal onboarding state has expired or does not match this seller."});
    }
    const {data:existingMerchant,error:merchantError}=await admin.from("marketplace_seller_paypal_accounts")
      .select("user_id").eq("merchant_id",merchantId).maybeSingle();
    if(merchantError)return json(503,{error:"PayPal merchant account ownership could not be checked."});
    if(existingMerchant&&existingMerchant.user_id!==userId)return json(409,{error:"That PayPal merchant account is already connected to a different Minglora seller."});
    const cfg=marketplacePayPalConfig();
    const partnerMerchantId=Deno.env.get("MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID")||"";
    if(!cfg.clientId||!cfg.clientSecret||!cfg.attributionId||!partnerMerchantId){
      return json(503,{error:"Marketplace PayPal partner credentials are not configured for merchant verification."});
    }
    let verifiedResponse:Response;
    try {
      const token=await getMarketplacePayPalToken();
      verifiedResponse=await fetch(cfg.base+"/v1/customer/partners/"+encodeURIComponent(partnerMerchantId)+"/merchant-integrations/"+encodeURIComponent(merchantId),{
        method:"GET",
        headers:{
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "PayPal-Partner-Attribution-Id":cfg.attributionId
        }
      });
    } catch {
      return json(503,{error:"Minglora could not verify the seller's PayPal merchant integration. The connection remains pending."});
    }
    const merchant=await verifiedResponse.json().catch(()=>({}));
    if(!verifiedResponse.ok)return json(502,{error:"PayPal could not confirm the seller's merchant integration.",providerIssue:String(merchant?.name||merchant?.message||"MERCHANT_STATUS_UNAVAILABLE").slice(0,160)});
    if(String(merchant?.merchant_id||"")!==merchantId||
       String(merchant?.tracking_id||"")!==userId||
       merchant?.payments_receivable!==true||
       merchant?.primary_email_confirmed!==true){
      return json(409,{error:"PayPal's merchant-integration status does not confirm this seller, receivable payments and a confirmed primary email."});
    }
    const primaryEmail=String(merchant?.primary_email||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail)||primaryEmail.length>254){
      return json(409,{error:"PayPal did not return a verified primary email for the seller. Payout setup remains pending."});
    }
    const products=Array.isArray(merchant?.products)?merchant.products:[];
    const express=products.find((item:any)=>String(item?.name||"").toUpperCase()==="EXPRESS_CHECKOUT");
    if(express&&String(express.status||"").toUpperCase()!=="ACTIVE"){
      return json(409,{error:"PayPal has not activated Express Checkout for this seller yet."});
    }
    const integrations=Array.isArray(merchant?.oauth_integrations)?merchant.oauth_integrations:[];
    const scopes=integrations.flatMap((integration:any)=>
      (Array.isArray(integration?.oauth_third_party)?integration.oauth_third_party:[])
        .flatMap((item:any)=>Array.isArray(item?.scopes)?item.scopes:[])
    );
    const paymentScope=scopes.some((scope:string)=>scope.includes("/services/payments/realtimepayment")||scope.includes("/services/payments/payment/authcapture"));
    const refundScope=scopes.some((scope:string)=>scope.includes("/services/payments/refund"));
    if(!paymentScope||!refundScope){
      return json(409,{error:"PayPal has not returned the required payment and refund permissions for this seller."});
    }
    const requested=current.requested_features||[];
    if(!["PAYMENT","REFUND","PARTNER_FEE","DELAY_FUNDS_DISBURSEMENT"].every((feature:string)=>requested.includes(feature))){
      return json(409,{error:"The saved PayPal referral did not request all marketplace payment, platform-fee and delayed-disbursement permissions."});
    }
    const stamp=new Date().toISOString();
    const {data,error}=await admin.from("marketplace_seller_paypal_accounts").update({
      merchant_id:merchantId,paypal_payer_id:null,paypal_account_email:primaryEmail,
      onboarding_status:"verified",account_type:"business",
      permissions_granted:true,consent_granted:true,primary_email_confirmed:true,
      payments_receivable:true,granted_features:requested,products:products.map((item:any)=>String(item?.name||"")).filter(Boolean),
      callback_nonce_hash:null,last_checked_at:stamp,
      status_reason:"PayPal's merchant-integrations API confirmed seller ownership, payment/refund scopes, receivable status and primary email.",
      updated_at:stamp
    }).eq("user_id",userId).select("user_id,onboarding_status,account_type,payments_receivable,primary_email_confirmed").single();
    if(error)return fail(error,"Verified PayPal seller connection could not be saved.");
    await admin.from("marketplace_seller_profiles").update({payout_status:"verified",updated_at:stamp}).eq("user_id",userId);
    await admin.from("marketplace_seller_verification_events").insert({
      seller_id:userId,actor_id:userId,event_type:"paypal_connected",
      reason:"PayPal merchant-integrations API verified the seller account and payment/refund permissions."
    });
    return json(200,{paypal:{status:data.onboarding_status,accountType:data.account_type,
      paymentsReceivable:data.payments_receivable,emailConfirmed:data.primary_email_confirmed}});
  }

  if (action === "marketplace_paypal_payment_prepare") {
    const buyerId=String(input.buyerId||""),orderId=String(input.orderId||"");
    const paymentMethod=String(input.paymentMethod||"paypal").toLowerCase();
    const returnUrl=String(input.returnUrl||""),cancelUrl=String(input.cancelUrl||"");
    if(!validUuid(buyerId)||!validUuid(orderId))return json(400,{error:"Invalid Marketplace order reference."});
    if(paymentMethod!=="paypal")return json(400,{error:"Use PayPal hosted checkout. Supported card options, if eligible, are presented by PayPal."});
    if(!/^https:\/\//i.test(returnUrl)||!/^https:\/\//i.test(cancelUrl))return json(400,{error:"Secure HTTPS return and cancel URLs are required."});
    const {data:order,error:orderError}=await admin.from("marketplace_orders")
      .select("id,buyer_id,currency,status,payment_status,total_minor,source_quote_id")
      .eq("id",orderId).eq("buyer_id",buyerId).maybeSingle();
    if(orderError)return json(503,{error:"Marketplace order could not be loaded."});
    if(!order)return json(404,{error:"Marketplace order not found."});
    if(order.status!=="awaiting_payment"||!["not_started","pending","failed"].includes(order.payment_status)){
      return json(409,{error:"This Marketplace order is not awaiting payment."});
    }
    const supportedCurrencies=new Set(["AUD","BRL","CAD","CNY","CZK","DKK","EUR","HKD","ILS","MYR","MXN","NZD","NOK","PHP","PLN","GBP","RUB","SGD","SEK","CHF","THB","USD"]);
    if(!supportedCurrencies.has(String(order.currency||"").trim().toUpperCase())){
      return json(409,{error:"PayPal Checkout does not support this order currency. A verified FX quote into a supported transaction currency is required; no conversion or charge was attempted."});
    }
    const {data:config,error:configError}=await admin.from("marketplace_payment_configuration")
      .select("provider,marketplace_approval_status,checkout_enabled,payouts_enabled,tax_calculation_enabled,delayed_disbursement_enabled")
      .eq("singleton",true).maybeSingle();
    if(configError||!config)return json(503,{error:"Marketplace payment configuration could not be loaded."});
    const blockers=[];
    const envConfigured=Boolean(
      Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_ID")&&
      Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_SECRET")&&
      Deno.env.get("MARKETPLACE_PAYPAL_PARTNER_MERCHANT_ID")&&
      Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")&&
      Deno.env.get("MARKETPLACE_PAYPAL_WEBHOOK_ID")
    );
    const envEnabled=(Deno.env.get("MARKETPLACE_PAYPAL_ENABLED")||"").toLowerCase()==="true";
    const partnerApproved=(Deno.env.get("MARKETPLACE_PAYPAL_PARTNER_APPROVED")||"").toLowerCase()==="true";
    const delayedApproved=(Deno.env.get("MARKETPLACE_PAYPAL_DELAYED_DISBURSEMENT_APPROVED")||"").toLowerCase()==="true";
    const liveApproved=(Deno.env.get("MARKETPLACE_PAYPAL_LIVE_APPROVED")||"").toLowerCase()==="true";
    if(config.provider!=="paypal")blockers.push("PayPal is not selected as the Marketplace payment provider.");
    if(config.marketplace_approval_status!=="approved"||!partnerApproved)blockers.push("PayPal Marketplace partner approval is pending.");
    if(!config.checkout_enabled)blockers.push("Marketplace buyer checkout is disabled.");
    if(!config.payouts_enabled)blockers.push("Marketplace seller settlement is disabled.");
    if(!config.tax_calculation_enabled||!order.source_quote_id)blockers.push("A completed tax and customs calculation is required.");
    if(!config.delayed_disbursement_enabled||!delayedApproved)blockers.push("PayPal delayed seller disbursement has not been approved and enabled.");
    if(!envConfigured||!envEnabled)blockers.push("Marketplace-specific PayPal credentials and integration approval flags are not fully configured.");
    if(MARKETPLACE_PAYPAL_MODE==="live"&&!liveApproved)blockers.push("Production PayPal Marketplace processing has not been approved.");
    if(blockers.length)return json(409,{error:"Marketplace PayPal checkout is not ready.",blockers});

    const {data:sellerOrders,error:sellerOrdersError}=await admin.from("marketplace_seller_orders")
      .select("id,seller_id,gross_minor,commission_minor,seller_net_minor,status,payout_status")
      .eq("order_id",orderId).order("seller_id",{ascending:true});
    if(sellerOrdersError)return json(503,{error:"Marketplace seller orders could not be loaded."});
    if(!sellerOrders?.length||sellerOrders.length>10)return json(409,{error:"PayPal multi-seller checkout supports one to ten verified seller orders."});
    if(sellerOrders.length>1){
      return json(409,{error:"One secure PayPal Auth Assertion is available per delayed-disbursement request. This cart contains multiple sellers; split checkout by seller until PayPal approves and Minglora verifies the multi-seller delayed-settlement flow. No payment was created."});
    }
    const sumGross=sellerOrders.reduce((total,row)=>total+Number(row.gross_minor||0),0);
    if(sumGross!==Number(order.total_minor))return json(409,{error:"Seller order totals do not match the buyer order total. Tax and fulfilment must be allocated before payment."});
    const sellerIds=sellerOrders.map(row=>row.seller_id);
    const [sellerResult,accountResult]=await Promise.all([
      admin.from("marketplace_seller_profiles").select("user_id,status,identity_status,seller_type,payout_status").in("user_id",sellerIds),
      admin.from("marketplace_seller_paypal_accounts").select("user_id,merchant_id,paypal_account_email,onboarding_status,account_type,permissions_granted,consent_granted,payments_receivable,primary_email_confirmed,granted_features").in("user_id",sellerIds)
    ]);
    if(sellerResult.error||accountResult.error)return json(503,{error:"Seller payment eligibility could not be loaded."});
    const sellers=new Map((sellerResult.data||[]).map((row:any)=>[row.user_id,row]));
    const accounts=new Map((accountResult.data||[]).map((row:any)=>[row.user_id,row]));
    const paymentSellers=[];
    for(const sellerOrder of sellerOrders){
      const seller=sellers.get(sellerOrder.seller_id),account=accounts.get(sellerOrder.seller_id);
      if(!seller||seller.status!=="approved"||seller.identity_status!=="verified"||
         seller.payout_status!=="verified"||!account||account.onboarding_status!=="verified"||
         !account.merchant_id||account.account_type!=="business"||!account.permissions_granted||!account.consent_granted||
         !account.payments_receivable||!account.primary_email_confirmed||
         !["PAYMENT","REFUND","PARTNER_FEE","DELAY_FUNDS_DISBURSEMENT"].every(feature=>(account.granted_features||[]).includes(feature))){
        return json(409,{error:"Every seller must have an approved Minglora identity and a verified PayPal merchant connection with payment, refund, platform-fee and delayed-disbursement permissions."});
      }
      paymentSellers.push({
        sellerOrderId:sellerOrder.id,
        merchantId:account.merchant_id,
        sellerEmail:account.paypal_account_email,
        grossMinor:Number(sellerOrder.gross_minor),
        platformFeeMinor:Number(sellerOrder.commission_minor),
        currency:order.currency,
        description:"Minglora seller order "+sellerOrder.id.slice(0,8)
      });
    }

    const {data:existingAttempt,error:attemptError}=await admin.from("marketplace_payment_attempts")
      .select("id,provider_order_id,provider_approval_url,status,provider_request_id,payment_method")
      .eq("order_id",orderId).eq("provider","paypal").eq("payment_method","paypal")
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(attemptError)return json(503,{error:"Existing Marketplace PayPal payment attempt could not be checked."});
    if(existingAttempt?.provider_order_id&&existingAttempt.provider_approval_url&&["created","approved"].includes(existingAttempt.status)){
      return json(200,{attemptId:existingAttempt.id,providerOrderId:existingAttempt.provider_order_id,
        approvalUrl:existingAttempt.provider_approval_url,requestId:existingAttempt.provider_request_id,
        currency:order.currency,totalMinor:order.total_minor,sellerOrders:paymentSellers,paymentMethod,reused:true});
    }

    let attempt=existingAttempt;
    if(!attempt){
      const requestId="MINGLORA-MARKETPLACE-"+crypto.randomUUID();
      const {data:created,error:insertError}=await admin.from("marketplace_payment_attempts")
        .insert({
          order_id:orderId,provider:"paypal",status:"created",amount_minor:Number(order.total_minor),
          currency:order.currency,provider_request_id:requestId,attempted_at:new Date().toISOString(),
          provider_status:"PAYMENT_ORDER_PENDING",failure_code:"",payment_method:"paypal"
        }).select("id,provider_request_id").single();
      if(insertError)return fail(insertError,"Marketplace PayPal payment attempt could not be created.");
      attempt=created;
    }
    const purchase_units=paymentSellers.map(seller=>{
      const gross=(seller.grossMinor/100).toFixed(2);
      const fee=seller.platformFeeMinor>0?(seller.platformFeeMinor/100).toFixed(2):null;
      if(seller.platformFeeMinor<0||seller.platformFeeMinor>seller.grossMinor)throw new Error("Marketplace commission is outside the allowed seller-order amount.");
      const unit:any={
        reference_id:seller.sellerOrderId,
        custom_id:orderId,
        description:seller.description,
        payee:{email_address:seller.sellerEmail},
        amount:{currency_code:order.currency,value:gross},
        payment_instruction:{disbursement_mode:"DELAYED"}
      };
      if(fee)unit.payment_instruction.platform_fees=[{amount:{currency_code:order.currency,value:fee}}];
      return unit;
    });
    let providerResponse:Response;
    try {
      const token=await getMarketplacePayPalToken();
      providerResponse=await fetch(MARKETPLACE_PAYPAL_BASE+"/v2/checkout/orders",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "PayPal-Partner-Attribution-Id":Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"",
          ...(paymentSellers.length===1?{"PayPal-Auth-Assertion":marketplacePayPalAuthAssertion(paymentSellers[0].sellerEmail)}:{}),
          "PayPal-Request-Id":String(attempt.provider_request_id).slice(0,108)
        },
        body:JSON.stringify({
          intent:"CAPTURE",
          purchase_units,
          application_context:{
            brand_name:"Minglora",
            user_action:"PAY_NOW",
            shipping_preference:"NO_PREFERENCE",
            return_url:returnUrl,
            cancel_url:cancelUrl
          }
        })
      });
    } catch {
      return json(503,{error:"Minglora could not reach PayPal to create the payment order. Retry this order; the same provider request ID is retained."});
    }
    const providerData=await providerResponse.json().catch(()=>({}));
    if(!providerResponse.ok){
      await admin.from("marketplace_payment_attempts").update({
        status:"failed",failure_code:String(providerData?.name||"PAYPAL_ORDER_CREATE_FAILED").slice(0,120),
        provider_status:String(providerData?.name||"PAYPAL_ORDER_CREATE_FAILED").slice(0,120),
        updated_at:new Date().toISOString()
      }).eq("id",attempt.id);
      return json(502,{error:"PayPal could not create the marketplace payment order.",providerIssue:String(providerData?.name||providerData?.message||"PAYPAL_ORDER_CREATE_FAILED").slice(0,160)});
    }
    const providerOrderId=String(providerData?.id||"");
    const approval=Array.isArray(providerData?.links)?providerData.links.find((item:any)=>["approve","payer-action"].includes(item?.rel)):null;
    let approvalUrl="";
    try {
      const parsedUrl=new URL(String(approval?.href||""));
      if(parsedUrl.protocol==="https:"&&["www.paypal.com","www.sandbox.paypal.com","paypal.com","sandbox.paypal.com"].includes(parsedUrl.hostname))approvalUrl=parsedUrl.toString();
    } catch {}
    if(!providerOrderId||!approvalUrl){
      return json(502,{error:"PayPal did not return a valid hosted checkout approval URL."});
    }
    const {data:saved,error:saveError}=await admin.from("marketplace_payment_attempts").update({
      provider_order_id:providerOrderId,provider_approval_url:approvalUrl,status:"created",
      provider_status:String(providerData?.status||"CREATED"),updated_at:new Date().toISOString()
    }).eq("id",attempt.id).select("id,provider_order_id,provider_approval_url,status,provider_request_id").single();
    if(saveError)return fail(saveError,"PayPal order was created but its reference could not be saved in Minglora.");
    return json(200,{
      attemptId:saved.id,providerOrderId:saved.provider_order_id,approvalUrl:saved.provider_approval_url,
      requestId:saved.provider_request_id,currency:order.currency,totalMinor:order.total_minor,
      sellerOrders:paymentSellers,paymentMethod,reused:false
    });
  }

  if (action === "marketplace_paypal_capture_execute") {
    const buyerId=String(input.buyerId||""),orderId=String(input.orderId||""),providerOrderId=String(input.providerOrderId||"");
    if(!validUuid(buyerId)||!validUuid(orderId)||!providerOrderId||providerOrderId.length>128){
      return json(400,{error:"Invalid Marketplace PayPal capture reference."});
    }
    const {data:order,error:orderError}=await admin.from("marketplace_orders")
      .select("id,buyer_id,currency,status,payment_status,total_minor")
      .eq("id",orderId).eq("buyer_id",buyerId).maybeSingle();
    if(orderError)return json(503,{error:"Marketplace order could not be loaded."});
    if(!order)return json(404,{error:"Marketplace order not found."});
    const {data:attempt,error:attemptError}=await admin.from("marketplace_payment_attempts")
      .select("id,provider_order_id,status,provider_request_id")
      .eq("order_id",orderId).eq("provider","paypal").eq("provider_order_id",providerOrderId)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(attemptError)return json(503,{error:"Marketplace payment attempt could not be loaded."});
    if(!attempt)return json(404,{error:"PayPal payment order does not belong to this buyer order."});
    if(["captured","partially_captured"].includes(attempt.status)){
      return json(200,{ok:true,alreadyCaptured:true,orderId,capturedMinor:order.total_minor,paymentStatus:order.payment_status});
    }
    if(order.status!=="awaiting_payment"||!["not_started","pending","failed"].includes(order.payment_status)){
      return json(409,{error:"This Marketplace order is not awaiting payment."});
    }
    const {data:sellerOrders,error:sellerOrdersError}=await admin.from("marketplace_seller_orders")
      .select("id,seller_id,gross_minor,commission_minor")
      .eq("order_id",orderId);
    if(sellerOrdersError||!sellerOrders?.length)return json(503,{error:"Marketplace seller orders are unavailable for capture reconciliation."});
    if(sellerOrders.length>1){
      return json(409,{error:"Multi-seller delayed disbursement capture is disabled until PayPal confirms the multi-merchant identity and settlement flow. No capture was attempted."});
    }
    let authAssertion="";
    if(sellerOrders.length===1){
      const {data:payee,error:payeeError}=await admin.from("marketplace_seller_paypal_accounts")
        .select("paypal_account_email").eq("user_id",sellerOrders[0].seller_id).maybeSingle();
      if(payeeError||!payee?.paypal_account_email)return json(409,{error:"The verified PayPal seller identity could not be loaded for capture."});
      authAssertion=marketplacePayPalAuthAssertion(String(payee.paypal_account_email));
    }
    let captureResponse:Response|undefined;
    let providerOrder:any=null;
    try {
      const token=await getMarketplacePayPalToken();
      captureResponse=await fetch(MARKETPLACE_PAYPAL_BASE+"/v2/checkout/orders/"+encodeURIComponent(providerOrderId)+"/capture",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "PayPal-Partner-Attribution-Id":Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"",
          ...(authAssertion?{"PayPal-Auth-Assertion":authAssertion}:{}),
          "PayPal-Request-Id":("MINGLORA-MARKETPLACE-CAPTURE-"+attempt.id).slice(0,108)
        },
        body:"{}"
      });
      providerOrder=await captureResponse.json().catch(()=>null);
    } catch {
      // Network outcomes are ambiguous. Query the provider before allowing another capture.
      try {
        const token=await getMarketplacePayPalToken();
        const response=await fetch(MARKETPLACE_PAYPAL_BASE+"/v2/checkout/orders/"+encodeURIComponent(providerOrderId),{
          headers:{
            "Authorization":"Bearer "+token,
            "PayPal-Partner-Attribution-Id":Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"",
            ...(authAssertion?{"PayPal-Auth-Assertion":authAssertion}:{})
          }
        });
        providerOrder=await response.json().catch(()=>null);
        if(!response.ok)return json(202,{ok:false,processing:true,orderId,notice:"Payment status is being verified with PayPal. Do not submit another payment."});
      } catch {
        return json(202,{ok:false,processing:true,orderId,notice:"PayPal's response is uncertain. Minglora will not submit a duplicate charge."});
      }
    }
    if(!providerOrder||!Array.isArray(providerOrder.purchase_units)){
      return json(202,{ok:false,processing:true,orderId,notice:"PayPal has not returned the final capture details yet."});
    }
    const rows:any[]=[];
    const expected=new Map(sellerOrders.map((row:any)=>[row.id,row]));
    const seen=new Set<string>();
    for(const unit of providerOrder.purchase_units){
      const sellerOrderId=String(unit?.reference_id||"");
      const sellerOrder=expected.get(sellerOrderId);
      if(!sellerOrder||seen.has(sellerOrderId))return json(409,{error:"PayPal returned an unknown or duplicate seller order reference."});
      seen.add(sellerOrderId);
      const captures=Array.isArray(unit?.payments?.captures)?unit.payments.captures:[];
      if(captures.length!==1)return json(202,{ok:false,processing:true,orderId,notice:"A seller capture is still pending provider confirmation."});
      const capture=captures[0],status=String(capture?.status||"").toUpperCase();
      if(status==="DECLINED"){
        rows.push({sellerOrderId,status:"declined",providerStatus:"DECLINED",failureCode:String(capture?.error?.details?.[0]?.issue||"PAYMENT_DECLINED").slice(0,120)});
        continue;
      }
      if(status!=="COMPLETED"||!capture?.id)return json(202,{ok:false,processing:true,orderId,notice:"A seller capture has not reached a final provider state."});
      const currency=String(capture?.amount?.currency_code||"").toUpperCase();
      const amountMinor=Math.round(Number(capture?.amount?.value||0)*100);
      const breakdown=capture?.seller_receivable_breakdown||{};
      const processorFeeMinor=breakdown.paypal_fee?.value==null?0:Math.round(Number(breakdown.paypal_fee.value)*100);
      const sellerNetMinor=breakdown.net_amount?.value==null
        ? Number(sellerOrder.gross_minor)-Number(sellerOrder.commission_minor)-processorFeeMinor
        : Math.round(Number(breakdown.net_amount.value)*100);
      if(currency!==String(order.currency).toUpperCase()||amountMinor!==Number(sellerOrder.gross_minor)||
         String(capture?.disbursement_mode||"").toUpperCase()!=="DELAYED"||
         !Number.isSafeInteger(processorFeeMinor)||processorFeeMinor<0||
         sellerNetMinor!==Number(sellerOrder.gross_minor)-Number(sellerOrder.commission_minor)-processorFeeMinor||
         sellerNetMinor<=0){
        return json(409,{error:"PayPal capture amount, currency, delayed disbursement or seller net did not reconcile to Minglora's order."});
      }
      rows.push({
        sellerOrderId,providerCaptureId:String(capture.id),amountMinor,
        platformFeeMinor:Number(sellerOrder.commission_minor),processorFeeMinor,
        sellerNetMinor,status:"captured",providerStatus:"COMPLETED"
      });
    }
    if(seen.size!==expected.size)return json(202,{ok:false,processing:true,orderId,notice:"PayPal has not returned every seller capture result yet."});
    const {data:result,error:reconcileError}=await admin.rpc("complete_marketplace_paypal_capture",{
      p_buyer_id:buyerId,p_order_id:orderId,p_attempt_id:attempt.id,
      p_provider_order_id:providerOrderId,p_capture_rows:rows
    });
    if(reconcileError)return fail(reconcileError,"PayPal capture completed, but Minglora could not reconcile the seller order breakdown.");
    return json(200,{ok:true,orderId,result});
  }

  if (action === "marketplace_paypal_order_saved") {
    const buyerId=String(input.buyerId||""),orderId=String(input.orderId||""),attemptId=String(input.attemptId||"");
    const providerOrderId=String(input.providerOrderId||""),approvalUrl=String(input.approvalUrl||"");
    if(!validUuid(buyerId)||!validUuid(orderId)||!validUuid(attemptId)||
       !providerOrderId||providerOrderId.length>128||!/^https:\/\//i.test(approvalUrl)){
      return json(400,{error:"Invalid PayPal order reference."});
    }
    const {data:order,error:orderError}=await admin.from("marketplace_orders")
      .select("id").eq("id",orderId).eq("buyer_id",buyerId).maybeSingle();
    if(orderError||!order)return json(404,{error:"Marketplace order not found."});
    const {data,error}=await admin.from("marketplace_payment_attempts").update({
      provider_order_id:providerOrderId,provider_approval_url:approvalUrl,status:"created",
      provider_status:"PAYPAL_ORDER_CREATED",updated_at:new Date().toISOString()
    }).eq("id",attemptId).eq("order_id",orderId).eq("provider","paypal")
      .select("id,provider_order_id,provider_approval_url,status").single();
    if(error)return fail(error,"PayPal order reference could not be saved.");
    return json(200,{attemptId:data.id,providerOrderId:data.provider_order_id,approvalUrl:data.provider_approval_url,status:data.status});
  }

  if (action === "marketplace_paypal_capture_record") {
    const buyerId=String(input.buyerId||""),orderId=String(input.orderId||""),attemptId=String(input.attemptId||"");
    const providerOrderId=String(input.providerOrderId||"");
    const captureRows=Array.isArray(input.captureRows)?input.captureRows:[];
    if(!validUuid(buyerId)||!validUuid(orderId)||!validUuid(attemptId)||!providerOrderId||!captureRows.length){
      return json(400,{error:"Invalid PayPal capture reconciliation request."});
    }
    const {data,error}=await admin.rpc("complete_marketplace_paypal_capture",{
      p_buyer_id:buyerId,p_order_id:orderId,p_attempt_id:attemptId,
      p_provider_order_id:providerOrderId,p_capture_rows:captureRows
    });
    if(error)return fail(error,"PayPal capture could not be reconciled to the Marketplace order.");
    return json(200,{result:data});
  }

  if (action === "marketplace_paypal_payment_failed") {
    const buyerId=String(input.buyerId||""),orderId=String(input.orderId||""),attemptId=String(input.attemptId||"");
    const failureCode=String(input.failureCode||"PAYPAL_PAYMENT_FAILED").slice(0,120);
    if(!validUuid(buyerId)||!validUuid(orderId)||!validUuid(attemptId))return json(400,{error:"Invalid payment failure reference."});
    const {data:order,error:orderError}=await admin.from("marketplace_orders")
      .select("id").eq("id",orderId).eq("buyer_id",buyerId).maybeSingle();
    if(orderError||!order)return json(404,{error:"Marketplace order not found."});
    const {data,error}=await admin.from("marketplace_payment_attempts").update({
      status:"failed",failure_code:failureCode,provider_status:failureCode,updated_at:new Date().toISOString()
    }).eq("id",attemptId).eq("order_id",orderId).eq("provider","paypal")
      .select("id,status").single();
    if(error)return fail(error,"Payment attempt failure could not be recorded.");
    return json(200,{attempt:data});
  }


  if (action === "marketplace_paypal_webhook_receive") {
    const event=input.event;
    const headers=input.headers&&typeof input.headers==="object"?input.headers:{};
    if(!event||typeof event!=="object"||Array.isArray(event)||
       !event.id||!event.event_type||typeof event.resource!=="object"){
      return json(400,{error:"Invalid PayPal Marketplace webhook payload."});
    }
    const webhookId=Deno.env.get("MARKETPLACE_PAYPAL_WEBHOOK_ID")||"";
    if(!webhookId)return json(503,{error:"Marketplace PayPal webhook ID is not configured."});
    const transmission={
      auth_algo:String(headers.authAlgo||""),
      cert_url:String(headers.certUrl||""),
      transmission_id:String(headers.transmissionId||""),
      transmission_sig:String(headers.transmissionSig||""),
      transmission_time:String(headers.transmissionTime||""),
      webhook_id:webhookId,
      webhook_event:event
    };
    if(Object.values(transmission).some(value=>!value))return json(400,{error:"Required PayPal signature headers are missing."});
    let verificationResponse:Response;
    try{
      const token=await getMarketplacePayPalToken();
      verificationResponse=await fetch(MARKETPLACE_PAYPAL_BASE+"/v1/notifications/verify-webhook-signature",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify(transmission)
      });
    }catch{
      return json(503,{error:"Minglora could not verify the PayPal Marketplace webhook. PayPal should retry."});
    }
    const verification=await verificationResponse.json().catch(()=>({}));
    if(!verificationResponse.ok||verification?.verification_status!=="SUCCESS"){
      return json(401,{error:"PayPal Marketplace webhook signature was not verified."});
    }

    const eventId=String(event.id).slice(0,128);
    const eventType=String(event.event_type).slice(0,128);
    const resource=event.resource||{};
    const {data:inserted,error:storeError}=await admin.from("marketplace_webhook_events").upsert({
      provider:"paypal",provider_event_id:eventId,event_type:eventType,
      signature_verified:true,processing_status:"processing",payload:event,
      received_at:new Date().toISOString()
    },{onConflict:"provider,provider_event_id",ignoreDuplicates:true})
      .select("id,processing_status").maybeSingle();
    if(storeError)return fail(storeError,"Verified Marketplace PayPal webhook could not be persisted.");
    if(!inserted){
      const {data:existing,error:existingError}=await admin.from("marketplace_webhook_events")
        .select("id,processing_status").eq("provider","paypal").eq("provider_event_id",eventId).maybeSingle();
      if(existingError||!existing)return json(503,{error:"Duplicate Marketplace webhook could not be checked."});
      if(existing.processing_status==="processed"||existing.processing_status==="ignored"){
        return json(200,{received:true,duplicate:true,eventId,status:existing.processing_status});
      }
      const {data:claimed,error:claimError}=await admin.from("marketplace_webhook_events")
        .update({processing_status:"processing",signature_verified:true,payload:event,event_type:eventType})
        .eq("id",existing.id).in("processing_status",["received","failed"])
        .select("id").maybeSingle();
      if(claimError)return fail(claimError,"Failed Marketplace webhook could not be claimed for retry.");
      if(!claimed)return json(202,{received:true,duplicate:true,processing:true,eventId,notice:"This PayPal event is already being processed."});
    }

    try{
      if(eventType==="MERCHANT.PARTNER-CONSENT.REVOKED"){
        const merchantId=String(resource.merchant_id||resource.merchantId||"");
        if(!merchantId)throw new Error("PayPal consent-revocation event did not identify the merchant.");
        const {data:account,error:accountError}=await admin.from("marketplace_seller_paypal_accounts")
          .select("user_id").eq("merchant_id",merchantId).maybeSingle();
        if(accountError)throw new Error("Could not find the Minglora seller for the PayPal merchant.");
        if(account){
          const stamp=new Date().toISOString();
          const {error:updateError}=await admin.from("marketplace_seller_paypal_accounts").update({
            onboarding_status:"restricted",permissions_granted:false,payments_receivable:false,
            granted_features:[],last_checked_at:stamp,
            status_reason:"PayPal reported that this seller revoked Minglora's marketplace partner consent.",
            updated_at:stamp
          }).eq("user_id",account.user_id);
          if(updateError)throw new Error("Could not restrict the seller's PayPal connection.");
          await admin.from("marketplace_seller_profiles").update({payout_status:"restricted",updated_at:stamp}).eq("user_id",account.user_id);
          await admin.from("marketplace_seller_verification_events").insert({
            seller_id:account.user_id,actor_id:account.user_id,event_type:"paypal_consent_revoked",
            reason:"PayPal partner-consent revocation webhook was signature verified."
          });
        }
      } else if(eventType==="MERCHANT.ONBOARDING.COMPLETED"){
        // Webhook establishes event authenticity; final seller eligibility is still
        // set by the OAuth return + merchant-integrations status verification path.
        const merchantId=String(resource.merchant_id||"");
        const trackingId=String(resource.tracking_id||"");
        if(merchantId&&trackingId){
          const {data:account,error:accountError}=await admin.from("marketplace_seller_paypal_accounts")
            .select("user_id,tracking_id,onboarding_status").eq("tracking_id",trackingId).maybeSingle();
          if(accountError)throw new Error("Could not load the seller account for PayPal onboarding completion.");
          if(account&&account.onboarding_status!=="verified"){
            const {error:updateError}=await admin.from("marketplace_seller_paypal_accounts").update({
              merchant_id:merchantId,onboarding_status:"pending",
              status_reason:"PayPal reports onboarding complete; Minglora is checking the merchant-integrations API response.",
              updated_at:new Date().toISOString()
            }).eq("user_id",account.user_id);
            if(updateError)throw new Error("Could not save the PayPal merchant reference for onboarding verification.");
          }
        }
      } else if(eventType==="PAYMENT.CAPTURE.COMPLETED"){
        // Reconcile completed capture events even when the buyer closes the return tab.
        const captureId=String(resource.id||"");
        const providerOrderId=String(resource.supplementary_data?.related_ids?.order_id||resource.order_id||"");
        if(!captureId||!providerOrderId)throw new Error("PayPal capture event is missing its capture or order reference.");
        const {data:attempt,error:attemptError}=await admin.from("marketplace_payment_attempts")
          .select("id,order_id,provider_order_id,status")
          .eq("provider","paypal").eq("provider_order_id",providerOrderId)
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(attemptError)throw new Error("Could not match the completed PayPal capture to a Minglora payment attempt.");
        if(!attempt){
          await admin.from("marketplace_webhook_events").update({
            processing_status:"ignored",processed_at:new Date().toISOString()
          }).eq("provider","paypal").eq("provider_event_id",eventId);
          return json(200,{received:true,ignored:true,eventId,reason:"No Minglora payment attempt matches this PayPal order."});
        }
        if(["captured","partially_captured","failed"].includes(attempt.status)){
          await admin.from("marketplace_webhook_events").update({
            processing_status:"processed",processed_at:new Date().toISOString()
          }).eq("provider","paypal").eq("provider_event_id",eventId);
          return json(200,{received:true,duplicate:true,eventId,orderId:attempt.order_id});
        }
        const {data:order,error:orderError}=await admin.from("marketplace_orders")
          .select("id,buyer_id,currency,status,payment_status,total_minor")
          .eq("id",attempt.order_id).maybeSingle();
        if(orderError||!order)throw new Error("Could not load the Minglora order for PayPal capture reconciliation.");
        const {data:sellerOrders,error:sellerOrdersError}=await admin.from("marketplace_seller_orders")
          .select("id,seller_id,gross_minor,commission_minor").eq("order_id",order.id);
        if(sellerOrdersError||!sellerOrders?.length)throw new Error("Could not load seller orders for PayPal capture reconciliation.");
        if(sellerOrders.length!==1)throw new Error("Automatic capture-webhook reconciliation is limited to one seller per delayed-disbursement order.");
        const {data:sellerAccount,error:sellerAccountError}=await admin.from("marketplace_seller_paypal_accounts")
          .select("paypal_account_email").eq("user_id",sellerOrders[0].seller_id).maybeSingle();
        if(sellerAccountError||!sellerAccount?.paypal_account_email)throw new Error("The verified PayPal seller email is not available for capture reconciliation.");
        const accessToken=await getMarketplacePayPalToken();
        const providerResponse=await fetch(MARKETPLACE_PAYPAL_BASE+"/v2/checkout/orders/"+encodeURIComponent(providerOrderId),{
          headers:{
            "Authorization":"Bearer "+accessToken,
            "PayPal-Partner-Attribution-Id":Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"",
            "PayPal-Auth-Assertion":marketplacePayPalAuthAssertion(String(sellerAccount.paypal_account_email))
          }
        });
        const providerOrder=await providerResponse.json().catch(()=>({}));
        if(!providerResponse.ok)throw new Error("PayPal could not verify the order associated with the capture event.");
        const unit=(providerOrder.purchase_units||[]).find((row:any)=>String(row.reference_id||"")===sellerOrders[0].id);
        const captures=Array.isArray(unit?.payments?.captures)?unit.payments.captures:[];
        const capture=captures.find((row:any)=>String(row.id||"")===captureId&&String(row.status||"").toUpperCase()==="COMPLETED");
        if(!capture)throw new Error("The exact capture ID from the webhook was not confirmed in the PayPal order.");
        const currency=String(capture.amount?.currency_code||"").toUpperCase();
        const amountMinor=Math.round(Number(capture.amount?.value||0)*100);
        const breakdown=capture.seller_receivable_breakdown||{};
        const processorFeeMinor=breakdown.paypal_fee?.value==null?0:Math.round(Number(breakdown.paypal_fee.value)*100);
        const sellerNetMinor=breakdown.net_amount?.value==null
          ? Number(sellerOrders[0].gross_minor)-Number(sellerOrders[0].commission_minor)-processorFeeMinor
          : Math.round(Number(breakdown.net_amount.value)*100);
        const disbursementMode=String(capture.disbursement_mode||unit?.payment_instruction?.disbursement_mode||"").toUpperCase();
        if(currency!==String(order.currency).toUpperCase()||
           amountMinor!==Number(sellerOrders[0].gross_minor)||
           disbursementMode!=="DELAYED"||
           !Number.isSafeInteger(processorFeeMinor)||processorFeeMinor<0||
           sellerNetMinor!==Number(sellerOrders[0].gross_minor)-Number(sellerOrders[0].commission_minor)-processorFeeMinor||
           sellerNetMinor<=0){
          throw new Error("PayPal capture amount, currency, delayed disbursement or seller net did not reconcile to Minglora.");
        }
        const {error:reconcileError}=await admin.rpc("complete_marketplace_paypal_capture",{
          p_buyer_id:order.buyer_id,p_order_id:order.id,p_attempt_id:attempt.id,
          p_provider_order_id:providerOrderId,
          p_capture_rows:[{
            sellerOrderId:sellerOrders[0].id,providerCaptureId:captureId,
            amountMinor,platformFeeMinor:Number(sellerOrders[0].commission_minor),
            processorFeeMinor,sellerNetMinor,status:"captured",providerStatus:"COMPLETED"
          }]
        });
        if(reconcileError)throw new Error("The completed PayPal capture could not be posted to Minglora's ledger.");
      } else if([
        "PAYMENT.PAYOUTS-ITEM.SUCCEEDED","PAYMENT.PAYOUTS-ITEM.FAILED",
        "PAYMENT.PAYOUTS-ITEM.BLOCKED","PAYMENT.PAYOUTS-ITEM.RETURNED",
        "PAYMENT.PAYOUTS-ITEM.UNCLAIMED","PAYMENT.PAYOUTS-ITEM.HELD"
      ].includes(eventType)){
        const payoutItemId=String(resource.payout_item_id||resource.payout_item?.payout_item_id||"");
        if(payoutItemId){
          const {data:payout,error:payoutError}=await admin.from("marketplace_payouts")
            .select("id,status,provider_disbursement_id,seller_order_id")
            .eq("provider_disbursement_id",payoutItemId).maybeSingle();
          if(payoutError)throw new Error("Could not match the PayPal payout event to a Minglora seller payout.");
          if(payout){
            const {error:auditError}=await admin.from("marketplace_payout_events").upsert({
              payout_id:payout.id,provider_event_id:eventId,event_type:eventType,
              signature_verified:true,payload:event,received_at:new Date().toISOString()
            },{onConflict:"provider_event_id",ignoreDuplicates:true});
            if(auditError)throw new Error("Verified PayPal payout event could not be saved to the payout audit trail.");
            const status=String(resource.transaction_status||"").toUpperCase();
            if(eventType==="PAYMENT.PAYOUTS-ITEM.SUCCEEDED"||status==="SUCCESS"){
              const {error:confirmError}=await admin.rpc("confirm_marketplace_payout",{
                p_payout_id:payout.id,
                p_provider_disbursement_id:payoutItemId,
                p_provider_status:"SUCCESS",
                p_response_snapshot:event
              });
              if(confirmError)throw new Error("Could not reconcile the confirmed seller payout.");
            }else if(eventType==="PAYMENT.PAYOUTS-ITEM.HELD"||status==="ONHOLD"){
              const {error:updateError}=await admin.from("marketplace_payouts").update({
                status:"held",provider_disbursement_status:status||eventType,
                response_snapshot:event,last_attempt_at:new Date().toISOString()
              }).eq("id",payout.id);
              if(updateError)throw new Error("Could not place the seller payout on provider hold.");
              const {error:sellerOrderError}=await admin.from("marketplace_seller_orders")
                .update({payout_status:"held",updated_at:new Date().toISOString()}).eq("id",payout.seller_order_id);
              if(sellerOrderError)throw new Error("Could not place the seller order payout on hold.");
            }else if(["PAYMENT.PAYOUTS-ITEM.FAILED","PAYMENT.PAYOUTS-ITEM.BLOCKED","PAYMENT.PAYOUTS-ITEM.RETURNED","PAYMENT.PAYOUTS-ITEM.UNCLAIMED"].includes(eventType)){
              const payoutStatus=eventType==="PAYMENT.PAYOUTS-ITEM.RETURNED"?"returned":"failed";
              const {error:updateError}=await admin.from("marketplace_payouts").update({
                status:payoutStatus,provider_disbursement_status:status||eventType,
                response_snapshot:event,last_attempt_at:new Date().toISOString()
              }).eq("id",payout.id);
              if(updateError)throw new Error("Could not update the failed seller payout.");
              const {error:sellerOrderError}=await admin.from("marketplace_seller_orders")
                .update({payout_status:"failed",updated_at:new Date().toISOString()})
                .eq("id",payout.seller_order_id);
              if(sellerOrderError)throw new Error("Could not update the seller order payout state after provider failure.");
            }else{
              await admin.from("marketplace_payouts").update({
                status:"processing",provider_disbursement_status:status||eventType,
                response_snapshot:event,last_attempt_at:new Date().toISOString()
              }).eq("id",payout.id);
            }
            const {error:payoutEventDoneError}=await admin.from("marketplace_payout_events").update({
              processed_at:new Date().toISOString()
            }).eq("provider_event_id",eventId);
            if(payoutEventDoneError)throw new Error("Could not mark the verified payout audit event processed.");
          }
        }
      }
      const {error:doneError}=await admin.from("marketplace_webhook_events").update({
        processing_status:"processed",processed_at:new Date().toISOString()
      }).eq("provider","paypal").eq("provider_event_id",eventId);
      if(doneError)throw new Error("Could not mark the Marketplace webhook event processed.");
      return json(200,{received:true,processed:true,eventId,eventType});
    }catch(error){
      await admin.from("marketplace_webhook_events").update({
        processing_status:"failed"
      }).eq("provider","paypal").eq("provider_event_id",eventId);
      return json(500,{error:String(error?.message||"Marketplace webhook processing failed").slice(0,240),eventId});
    }
  }

  if (action === "marketplace_paypal_webhook_record") {
    const eventId=String(input.eventId||""),eventType=String(input.eventType||"");
    const payload=input.payload;
    if(!eventId||eventId.length>128||!eventType||eventType.length>128||
       !payload||typeof payload!=="object"||Array.isArray(payload)||input.signatureVerified!==true){
      return json(400,{error:"Only signature-verified PayPal webhook events can be recorded."});
    }
    const {data,error}=await admin.from("marketplace_webhook_events").upsert({
      provider:"paypal",provider_event_id:eventId,event_type:eventType,
      signature_verified:true,processing_status:"received",payload,
      received_at:new Date().toISOString()
    },{onConflict:"provider,provider_event_id",ignoreDuplicates:true}).select("id,processing_status").maybeSingle();
    if(error)return fail(error,"PayPal webhook event could not be stored.");
    return json(200,{received:true,duplicate:!data,eventId});
  }


  if (action === "marketplace_refund_request") {
    const buyerId=String(input.buyerId||"");
    const sellerOrderId=String(input.sellerOrderId||"");
    const amountMinor=Number(input.amountMinor);
    const reason=String(input.reason||"").trim();
    const idempotencyKey=String(input.idempotencyKey||"");
    if(!validUuid(buyerId)||!validUuid(sellerOrderId)||
       !Number.isSafeInteger(amountMinor)||amountMinor<1||
       reason.length<10||reason.length>1000||
       idempotencyKey.length<8||idempotencyKey.length>128){
      return json(400,{error:"Provide a valid seller order, refund amount, reason and unique request key."});
    }
    const {data,error}=await admin.rpc("request_marketplace_refund",{
      p_buyer_id:buyerId,p_seller_order_id:sellerOrderId,
      p_amount_minor:amountMinor,p_reason:reason,p_idempotency_key:idempotencyKey
    });
    if(error)return fail(error,"Marketplace refund request could not be recorded.");
    return json(201,{refund:data});
  }

  if (action === "marketplace_refunds_admin_list") {
    const {data,error}=await admin.from("marketplace_refunds")
      .select("id,order_id,seller_order_id,case_id,provider,provider_refund_reference,amount_minor,currency,status,reason,failure_code,provider_status,requested_by,approved_by,approved_at,created_at,updated_at,completed_at")
      .order("created_at",{ascending:false}).limit(100);
    if(error)return json(503,{error:"Marketplace refund queue could not be loaded."});
    return json(200,{refunds:data||[]});
  }

  if (action === "marketplace_refund_approve") {
    const refundId=String(input.refundId||""),actorId=String(input.actorId||"");
    if(!validUuid(refundId)||!validUuid(actorId))return json(400,{error:"Invalid refund approval reference."});
    const {data:config,error:configError}=await admin.from("marketplace_payment_configuration")
      .select("provider,marketplace_approval_status").eq("singleton",true).maybeSingle();
    if(configError||!config)return json(503,{error:"Marketplace refund provider configuration is unavailable."});
    if(config.provider!=="paypal"||config.marketplace_approval_status!=="approved"||
       (Deno.env.get("MARKETPLACE_PAYPAL_ENABLED")||"").toLowerCase()!=="true"||
       (Deno.env.get("MARKETPLACE_PAYPAL_PARTNER_APPROVED")||"").toLowerCase()!=="true"){
      return json(409,{error:"PayPal Marketplace refund processing is not approved and enabled."});
    }
    const {data:claim,error:claimError}=await admin.rpc("claim_marketplace_refund",{
      p_refund_id:refundId,p_actor_id:actorId
    });
    if(claimError)return fail(claimError,"Marketplace refund could not be approved.");
    if(claim?.status==="succeeded"||claim?.idempotent){
      return json(200,{paid:true,refundId,status:"succeeded",idempotent:true});
    }
    if(!claim?.captureId||!claim?.sellerEmail||!claim?.idempotencyKey||
       !Number.isSafeInteger(Number(claim.amountMinor))){
      return json(409,{error:"The approved refund is missing a verified PayPal capture, seller email or amount."});
    }
    let providerResponse:Response;
    try{
      const token=await getMarketplacePayPalToken();
      providerResponse=await fetch(MARKETPLACE_PAYPAL_BASE+"/v2/payments/captures/"+encodeURIComponent(String(claim.captureId))+"/refund",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "Prefer":"return=representation",
          "PayPal-Partner-Attribution-Id":Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"",
          "PayPal-Auth-Assertion":marketplacePayPalAuthAssertion(String(claim.sellerEmail)),
          "PayPal-Request-Id":("MINGLORA-REFUND-"+String(refundId)).slice(0,108)
        },
        body:JSON.stringify({
          amount:{
            value:(Number(claim.amountMinor)/100).toFixed(2),
            currency_code:String(claim.currency).toUpperCase()
          },
          invoice_id:"MINGLORA-REFUND-"+String(refundId),
          custom_id:String(claim.orderId),
          note_to_payer:"Minglora Marketplace refund"
        })
      });
    }catch{
      // The provider may have received the request. Keep the refund processing and
      // reuse the exact same request ID on retry to avoid issuing a second refund.
      return json(202,{accepted:true,processing:true,refundId,notice:"PayPal's response is uncertain. Minglora will verify the same refund request before retrying."});
    }
    const providerPayload=await providerResponse.json().catch(()=>({}));
    if(!providerResponse.ok){
      const providerCode=String(providerPayload?.name||providerPayload?.details?.[0]?.issue||"PAYPAL_REFUND_FAILED");
      const {data:finalized,error:finalizeError}=await admin.rpc("finalize_marketplace_refund",{
        p_refund_id:refundId,p_provider_refund_reference:"",
        p_provider_status:"FAILED",p_amount_minor:Number(claim.amountMinor),
        p_currency:String(claim.currency),p_response_snapshot:{httpStatus:providerResponse.status,providerCode,payload:providerPayload}
      });
      if(finalizeError)return fail(finalizeError,"PayPal rejected the refund and Minglora could not release the refund hold.");
      return json(502,{error:"PayPal did not accept the marketplace refund.",providerCode,refund:finalized});
    }
    const providerRefundId=String(providerPayload?.id||"");
    const providerStatus=String(providerPayload?.status||"").toUpperCase();
    const paidAmount=Math.round(Number(providerPayload?.amount?.value||0)*100);
    const paidCurrency=String(providerPayload?.amount?.currency_code||"").toUpperCase();
    if(!providerRefundId||paidAmount!==Number(claim.amountMinor)||paidCurrency!==String(claim.currency).toUpperCase()){
      return json(202,{accepted:true,processing:true,refundId,providerRefundId:providerRefundId||null,
        notice:"PayPal accepted a response, but the refund ID, amount or currency is not yet fully verified. The refund remains on hold for reconciliation."});
    }
    const {data:finalized,error:finalizeError}=await admin.rpc("finalize_marketplace_refund",{
      p_refund_id:refundId,p_provider_refund_reference:providerRefundId,
      p_provider_status:providerStatus,p_amount_minor:paidAmount,
      p_currency:paidCurrency,p_response_snapshot:providerPayload
    });
    if(finalizeError)return fail(finalizeError,"PayPal responded to the refund but Minglora could not finalize the financial ledger.");
    const status=String(finalized?.status||providerStatus).toLowerCase();
    return json(status==="succeeded"?200:202,{
      accepted:true,paid:status==="succeeded",processing:status==="processing",
      refundId,providerRefundId,status,refund:finalized
    });
  }

  if (action === "marketplace_paypal_payout_release") {
    const payoutId=String(input.payoutId||""),sellerId=String(input.sellerId||"");
    if(!validUuid(payoutId)||!validUuid(sellerId))return json(400,{error:"Invalid seller payout reference."});
    const {data:config,error:configError}=await admin.from("marketplace_payment_configuration")
      .select("provider,marketplace_approval_status,payouts_enabled,delayed_disbursement_enabled")
      .eq("singleton",true).maybeSingle();
    if(configError||!config)return json(503,{error:"Marketplace payout configuration is unavailable."});
    if(config.provider!=="paypal"||config.marketplace_approval_status!=="approved"||
       !config.payouts_enabled||!config.delayed_disbursement_enabled){
      return json(409,{error:"Independent seller disbursement is not approved and enabled."});
    }
    const {data:claim,error:claimError}=await admin.rpc("claim_marketplace_payout",{
      p_payout_id:payoutId,p_seller_id:sellerId
    });
    if(claimError)return fail(claimError,"Seller payout could not be claimed.");
    if(claim?.status==="paid")return json(200,{paid:true,idempotent:true,payoutId});
    if(!claim?.providerCaptureId||!claim?.requestId||!claim?.sellerEmail)return json(409,{error:"The delayed PayPal capture reference, verified seller email or payout request ID is missing."});
    let response: Response;
    try {
      const token=await getMarketplacePayPalToken();
      response=await fetch(MARKETPLACE_PAYPAL_BASE+"/v1/payments/referenced-payouts-items",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Content-Type":"application/json",
          "PayPal-Partner-Attribution-Id":Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")||"",
          "PayPal-Request-Id":String(claim.requestId).slice(0,108)
        },
        body:JSON.stringify({reference_id:String(claim.providerCaptureId),reference_type:"TRANSACTION_ID"})
      });
    } catch {
      return json(503,{error:"PayPal referenced disbursement could not be reached. The payout remains processing for safe reconciliation."});
    }
    const providerPayload=await response.json().catch(()=>({}));
    if(!response.ok){
      await admin.from("marketplace_payouts").update({
        provider_disbursement_status:"SUBMISSION_ERROR",
        response_snapshot:providerPayload||{},
        last_attempt_at:new Date().toISOString()
      }).eq("id",payoutId).eq("seller_id",sellerId);
      return json(502,{error:"PayPal did not accept the seller disbursement request.",providerStatus:response.status});
    }
    const payoutItemId=String(providerPayload?.payout_item_id||providerPayload?.payout_item?.payout_item_id||providerPayload?.id||"");
    const providerStatus=String(providerPayload?.transaction_status||providerPayload?.status||"PENDING").toUpperCase();
    await admin.from("marketplace_payouts").update({
      provider_disbursement_id:payoutItemId||null,
      provider_disbursement_status:providerStatus,
      response_snapshot:providerPayload||{},
      last_attempt_at:new Date().toISOString()
    }).eq("id",payoutId).eq("seller_id",sellerId);
    if(["SUCCESS","SUCCEEDED","COMPLETED"].includes(providerStatus)&&payoutItemId){
      const {data:confirmation,error:confirmationError}=await admin.rpc("confirm_marketplace_payout",{
        p_payout_id:payoutId,p_provider_disbursement_id:payoutItemId,
        p_provider_status:providerStatus,p_response_snapshot:providerPayload||{}
      });
      if(confirmationError)return fail(confirmationError,"PayPal accepted the disbursement but Minglora could not reconcile the confirmation.");
      return json(200,{paid:true,payoutId,confirmation});
    }
    return json(202,{accepted:true,paid:false,processing:true,payoutId,providerDisbursementId:payoutItemId||null,providerStatus});
  }

  if (action === "marketplace_paypal_payout_webhook") {
    const payoutId=String(input.payoutId||""),providerEventId=String(input.providerEventId||"");
    const providerDisbursementId=String(input.providerDisbursementId||"");
    const eventType=String(input.eventType||""),providerStatus=String(input.providerStatus||"").toUpperCase();
    const payload=input.payload;
    if(!validUuid(payoutId)||!providerEventId||providerEventId.length>160||
       !providerDisbursementId||providerDisbursementId.length>160||!eventType||eventType.length>160||
       input.signatureVerified!==true||!payload||typeof payload!=="object"||Array.isArray(payload)){
      return json(400,{error:"Only signature-verified payout events with known payout references can be reconciled."});
    }
    const {data:payout,error:payoutError}=await admin.from("marketplace_payouts")
      .select("id,seller_id,status").eq("id",payoutId).maybeSingle();
    if(payoutError||!payout)return json(404,{error:"Marketplace payout was not found."});
    const {data:event,error:eventError}=await admin.from("marketplace_payout_events").upsert({
      payout_id:payoutId,provider_event_id:providerEventId,event_type:eventType,
      signature_verified:true,payload,received_at:new Date().toISOString(),processed_at:new Date().toISOString()
    },{onConflict:"provider_event_id",ignoreDuplicates:true}).select("id").maybeSingle();
    if(eventError)return fail(eventError,"Verified PayPal payout event could not be saved.");
    if(["PAYMENT.PAYOUTS-ITEM.SUCCEEDED","PAYMENT.PAYOUTSBATCH.SUCCESS"].includes(eventType)||
       ["SUCCESS","SUCCEEDED","COMPLETED"].includes(providerStatus)){
      const {data:confirmation,error:confirmError}=await admin.rpc("confirm_marketplace_payout",{
        p_payout_id:payoutId,p_provider_disbursement_id:providerDisbursementId,
        p_provider_status:"SUCCESS",p_response_snapshot:payload
      });
      if(confirmError)return fail(confirmError,"Verified PayPal payout success could not be reconciled.");
      return json(200,{received:true,paid:true,payoutId,confirmation,duplicate:!event});
    }
    if(["PAYMENT.PAYOUTS-ITEM.FAILED","PAYMENT.PAYOUTS-ITEM.BLOCKED","PAYMENT.PAYOUTS-ITEM.RETURNED"].includes(eventType)){
      await admin.from("marketplace_payouts").update({
        status:"failed",provider_disbursement_id:providerDisbursementId,
        provider_disbursement_status:providerStatus||eventType,
        response_snapshot:payload,last_attempt_at:new Date().toISOString()
      }).eq("id",payoutId);
    }
    return json(200,{received:true,paid:false,payoutId,duplicate:!event});
  }

  if (action === "marketplace_financial_reconcile") {
    const {data,error}=await admin.rpc("marketplace_financial_reconciliation_snapshot");
    if(error)return fail(error,"Marketplace financial reconciliation snapshot failed.");
    return json(200,{snapshot:data});
  }


  if (action === "marketplace_seller_payouts") {
    const sellerId=String(input.sellerId||"");
    if(!validUuid(sellerId))return json(400,{error:"Invalid seller account."});
    const {data,error}=await admin.from("marketplace_payouts")
      .select("id,seller_order_id,amount_minor,currency,status,provider_disbursement_status,initiated_at,completed_at,failure_code")
      .eq("seller_id",sellerId).order("initiated_at",{ascending:false}).limit(100);
    if(error)return json(503,{error:"Marketplace seller payouts could not be loaded."});
    const sellerOrderIds=[...new Set((data||[]).map((row:any)=>row.seller_order_id).filter(Boolean))];
    const {data:orders,error:ordersError}=sellerOrderIds.length
      ? await admin.from("marketplace_seller_orders").select("id,status,payout_status").in("id",sellerOrderIds)
      : {data:[],error:null};
    if(ordersError)return json(503,{error:"Seller order payout eligibility could not be loaded."});
    const orderById=new Map((orders||[]).map((row:any)=>[row.id,row]));
    const payouts=(data||[]).map((row:any)=>({
      ...row,
      seller_order_status:orderById.get(row.seller_order_id)?.status||"unknown",
      seller_order_payout_status:orderById.get(row.seller_order_id)?.payout_status||"not_eligible"
    }));
    return json(200,{payouts});
  }

  if (action === "marketplace_cart_get") {
    const buyerId=String(input.buyerId||"");
    if(!validUuid(buyerId))return json(400,{error:"Invalid buyer account."});
    let {data:cart,error:cartError}=await admin.from("marketplace_carts")
      .select("id,buyer_id,currency,status,created_at,updated_at")
      .eq("buyer_id",buyerId).eq("status","active").maybeSingle();
    if(cartError)return json(503,{error:"Marketplace cart could not be loaded."});
    if(!cart){
      const {data:created,error:createError}=await admin.from("marketplace_carts")
        .insert({buyer_id:buyerId,status:"active"}).select("id,buyer_id,currency,status,created_at,updated_at").single();
      if(createError){
        const retry=await admin.from("marketplace_carts").select("id,buyer_id,currency,status,created_at,updated_at")
          .eq("buyer_id",buyerId).eq("status","active").maybeSingle();
        if(retry.error||!retry.data)return json(503,{error:"Marketplace cart could not be created."});
        cart=retry.data;
      }else cart=created;
    }
    const {data:cartRows,error:rowsError}=await admin.from("marketplace_cart_items")
      .select("cart_id,listing_id,quantity,fulfillment_method,added_at")
      .eq("cart_id",cart.id).order("added_at",{ascending:false});
    if(rowsError)return json(503,{error:"Marketplace cart items could not be loaded."});
    const listingIds=(cartRows||[]).map((row:any)=>row.listing_id);
    const {data:listings,error:listingsError}=listingIds.length
      ? await admin.from("marketplace_listings")
          .select("id,seller_id,title,description,kind,price_type,price_minor,currency,category,condition,location_label,status,quantity,reserved_quantity,fulfillment_options,tags")
          .in("id",listingIds)
      : {data:[],error:null};
    if(listingsError)return json(503,{error:"Marketplace cart listing details could not be loaded."});
    const listingById=new Map((listings||[]).map((row:any)=>[row.id,row]));
    const items=(cartRows||[]).map((row:any)=>{
      const listing=listingById.get(row.listing_id);
      return {
        listingId:row.listing_id,quantity:row.quantity,fulfillmentMethod:row.fulfillment_method,addedAt:row.added_at,
        available:Boolean(listing&&listing.status==="active"&&listing.kind==="product"&&listing.price_type==="fixed"),
        listing:listing?{
          id:listing.id,sellerId:listing.seller_id,title:listing.title,description:listing.description,
          kind:listing.kind,priceType:listing.price_type,priceMinor:listing.price_minor,currency:listing.currency,
          category:listing.category,condition:listing.condition,location:listing.location_label,
          status:listing.status,availableQuantity:Math.max(0,Number(listing.quantity||0)-Number(listing.reserved_quantity||0)),
          fulfillment:listing.fulfillment_options||[],tags:listing.tags||[]
        }:null
      };
    });
    return json(200,{cart:{id:cart.id,currency:cart.currency,status:cart.status,updatedAt:cart.updated_at},items});
  }

  if (action === "marketplace_cart_add" || action === "marketplace_cart_update") {
    const buyerId=String(input.buyerId||""),listingId=String(input.listingId||"");
    const quantity=Number(input.quantity),fulfillmentMethod=String(input.fulfillmentMethod||"");
    if(!validUuid(buyerId)||!validUuid(listingId)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100){
      return json(400,{error:"Choose a valid product and quantity from 1 to 100."});
    }
    if(!["pickup","local_delivery","shipping"].includes(fulfillmentMethod)){
      return json(400,{error:"Choose a valid product fulfilment method."});
    }
    const {data:listing,error:listingError}=await admin.from("marketplace_listings")
      .select("id,seller_id,kind,price_type,price_minor,currency,status,quantity,reserved_quantity,fulfillment_options")
      .eq("id",listingId).maybeSingle();
    if(listingError)return json(503,{error:"Product availability could not be checked."});
    if(!listing||listing.status!=="active"||listing.kind!=="product"||listing.price_type!=="fixed"||Number(listing.price_minor||0)<=0){
      return json(409,{error:"Only active, fixed-price products can be added to the cart. Services use appointment requests."});
    }
    if(listing.seller_id===buyerId)return json(403,{error:"You cannot buy your own listing from your seller account."});
    if(!(listing.fulfillment_options||[]).includes(fulfillmentMethod)){
      return json(409,{error:"That fulfilment method is not available for this product."});
    }
    const available=Math.max(0,Number(listing.quantity||0)-Number(listing.reserved_quantity||0));
    if(available<1)return json(409,{error:"This product is currently out of stock."});
    const {data:cart,error:cartError}=await admin.from("marketplace_carts")
      .select("id,currency").eq("buyer_id",buyerId).eq("status","active").maybeSingle();
    if(cartError)return json(503,{error:"Marketplace cart could not be loaded."});
    let activeCart=cart;
    if(!activeCart){
      const {data:created,error:createError}=await admin.from("marketplace_carts")
        .insert({buyer_id:buyerId,status:"active",currency:listing.currency})
        .select("id,currency").single();
      if(createError){
        const retry=await admin.from("marketplace_carts").select("id,currency")
          .eq("buyer_id",buyerId).eq("status","active").maybeSingle();
        if(retry.error||!retry.data)return json(503,{error:"Marketplace cart could not be created."});
        activeCart=retry.data;
      }else activeCart=created;
    }
    if(activeCart.currency&&String(activeCart.currency).trim().toUpperCase()!==String(listing.currency||"").trim().toUpperCase()){
      return json(409,{error:"Your cart currently uses "+String(activeCart.currency).trim().toUpperCase()+". Create a separate order for products in a different currency; Minglora will not apply an unverified exchange rate."});
    }
    const {data:existing,error:existingError}=await admin.from("marketplace_cart_items")
      .select("quantity").eq("cart_id",activeCart.id).eq("listing_id",listingId).maybeSingle();
    if(existingError)return json(503,{error:"Existing cart quantity could not be checked."});
    const nextQuantity=action==="marketplace_cart_add"?Number(existing?.quantity||0)+quantity:quantity;
    if(nextQuantity>100||nextQuantity>available)return json(409,{error:"The requested quantity exceeds available stock ("+available+" available)."});
    const {error:saveError}=await admin.from("marketplace_cart_items").upsert({
      cart_id:activeCart.id,listing_id:listingId,quantity:nextQuantity,fulfillment_method:fulfillmentMethod
    },{onConflict:"cart_id,listing_id"});
    if(saveError)return json(503,{error:"Marketplace cart item could not be saved."});
    if(!activeCart.currency){
      const {error:currencyError}=await admin.from("marketplace_carts").update({
        currency:listing.currency,updated_at:new Date().toISOString()
      }).eq("id",activeCart.id).eq("buyer_id",buyerId);
      if(currencyError)return json(503,{error:"Marketplace cart currency could not be saved."});
    }else{
      await admin.from("marketplace_carts").update({updated_at:new Date().toISOString()})
        .eq("id",activeCart.id).eq("buyer_id",buyerId);
    }
    return json(200,{ok:true,quantity:nextQuantity,listingId});
  }

  if (action === "marketplace_cart_remove" || action === "marketplace_cart_clear") {
    const buyerId=String(input.buyerId||"");
    const listingId=String(input.listingId||"");
    if(!validUuid(buyerId)||(action==="marketplace_cart_remove"&&!validUuid(listingId))){
      return json(400,{error:"Invalid cart item reference."});
    }
    const {data:cart,error:cartError}=await admin.from("marketplace_carts")
      .select("id").eq("buyer_id",buyerId).eq("status","active").maybeSingle();
    if(cartError)return json(503,{error:"Marketplace cart could not be loaded."});
    if(!cart)return json(200,{ok:true,removed:0});
    let query=admin.from("marketplace_cart_items").delete().eq("cart_id",cart.id);
    if(action==="marketplace_cart_remove")query=query.eq("listing_id",listingId);
    const {data:removed,error:removeError}=await query.select("listing_id");
    if(removeError)return json(503,{error:"Marketplace cart item could not be removed."});
    const {data:remaining,error:remainingError}=await admin.from("marketplace_cart_items")
      .select("listing_id").eq("cart_id",cart.id).limit(1);
    if(remainingError)return json(503,{error:"Marketplace cart state could not be refreshed."});
    if(!remaining?.length){
      const {error:clearCurrencyError}=await admin.from("marketplace_carts")
        .update({currency:null,updated_at:new Date().toISOString()}).eq("id",cart.id).eq("buyer_id",buyerId);
      if(clearCurrencyError)return json(503,{error:"Marketplace cart currency could not be cleared."});
    }
    return json(200,{ok:true,removed:(removed||[]).length});
  }

  if (action === "marketplace_seller_get") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid seller account."});
    const [sellerResult,paypalResult]=await Promise.all([
      admin.from("marketplace_seller_profiles").select("user_id,seller_type,store_name,description,country_code,contact_email,status,identity_status,payout_status,terms_version,terms_accepted_at,created_at,updated_at").eq("user_id",userId).maybeSingle(),
      admin.from("marketplace_seller_paypal_accounts").select("onboarding_status,account_type,permissions_granted,consent_granted,primary_email_confirmed,payments_receivable,requested_features,granted_features,products,last_checked_at,status_reason").eq("user_id",userId).maybeSingle()
    ]);
    if(sellerResult.error)return json(503,{error:"Seller profile could not be loaded."});
    if(paypalResult.error)return json(503,{error:"PayPal seller connection status could not be loaded."});
    const data=sellerResult.data,paypal=paypalResult.data;
    return json(200,{
      seller:data?{
        userId:data.user_id,sellerType:data.seller_type,storeName:data.store_name,description:data.description,
        countryCode:data.country_code,contactEmail:data.contact_email,status:data.status,
        identityStatus:data.identity_status,payoutStatus:data.payout_status,termsVersion:data.terms_version,
        termsAcceptedAt:data.terms_accepted_at,createdAt:data.created_at,updatedAt:data.updated_at
      }:null,
      paypal:paypal?{
        status:paypal.onboarding_status,accountType:paypal.account_type,
        permissionsGranted:paypal.permissions_granted,consentGranted:paypal.consent_granted,
        emailConfirmed:paypal.primary_email_confirmed,paymentsReceivable:paypal.payments_receivable,
        requestedFeatures:paypal.requested_features,grantedFeatures:paypal.granted_features,
        products:paypal.products,lastCheckedAt:paypal.last_checked_at,reason:paypal.status_reason
      }:{status:"not_started",accountType:"unknown",permissionsGranted:false,consentGranted:false,
        emailConfirmed:false,paymentsReceivable:false,requestedFeatures:[],grantedFeatures:[],products:[]}
    });
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
    if(!validUuid(userId)||!validUuid(listing.id)||String(listing.sellerId||"")!==userId){
      return json(400,{error:"Invalid Marketplace listing owner or ID."});
    }
    const mediaIds=[...new Set((Array.isArray(listing.mediaIds)?listing.mediaIds:[]).map(String))];
    if(mediaIds.length>8||mediaIds.some((id:string)=>!validUuid(id))){
      return json(400,{error:"A listing may contain up to eight valid Marketplace photo IDs."});
    }
    const {data,error}=await admin.rpc("sync_marketplace_listing",{
      p_seller_id:userId,p_listing:listing,p_media_ids:mediaIds
    });
    if(error)return fail(error,"Marketplace listing could not be saved.");
    return json(200,{listing:data});
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
    const allMediaIds=[...new Set((mediaResult.data||[]).map((row:any)=>row.asset_id))];
    const {data:assets,error:assetsError}=allMediaIds.length
      ?await admin.from("media_assets")
        .select("id,owner_id,storage_key,storage_bucket,mime_type,media_type,byte_size,asset_status,processing_status,attached_to")
        .in("id",allMediaIds)
      :{data:[],error:null};
    if(assetsError)return json(503,{error:"Marketplace listing photos could not be loaded."});
    const listingById=new Map(listings.map((row:any)=>[row.id,row]));
    const assetById=new Map((assets||[]).map((asset:any)=>[asset.id,asset]));
    const signedMediaMap=new Map<string,any[]>();
    await Promise.all((mediaResult.data||[]).map(async (media:any)=>{
      const listing=listingById.get(media.listing_id),asset=assetById.get(media.asset_id);
      if(!listing||!asset||asset.owner_id!==listing.seller_id||asset.slot!=="marketplace"||
         asset.asset_status!=="attached"||asset.processing_status!=="ready"||
         asset.attached_to!=="marketplace:"+listing.id||asset.storage_bucket!=="minglora-post-media")return;
      const {data,error}=await admin.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_key,3600);
      if(error||!data?.signedUrl)return;
      const current=signedMediaMap.get(listing.id)||[];
      current.push({id:asset.id,mimeType:asset.mime_type,mediaType:asset.media_type,url:data.signedUrl,byteSize:asset.byte_size});
      signedMediaMap.set(listing.id,current);
    }));
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
        mediaIds:mediaMap.get(row.id)||[],media:signedMediaMap.get(row.id)||[],seller:{
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
      .select("provider,marketplace_approval_status,checkout_enabled,payouts_enabled,tax_calculation_enabled,delayed_disbursement_enabled,card_payments_enabled")
      .eq("singleton",true).maybeSingle();
    if(error||!data)return json(503,{error:"Marketplace payment configuration is unavailable."});
    const blockers=[];
    const envConfigured=Boolean(
      Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_ID")&&
      Deno.env.get("MARKETPLACE_PAYPAL_CLIENT_SECRET")&&
      Deno.env.get("MARKETPLACE_PAYPAL_ATTRIBUTION_ID")&&
      Deno.env.get("MARKETPLACE_PAYPAL_WEBHOOK_ID")
    );
    const envEnabled=(Deno.env.get("MARKETPLACE_PAYPAL_ENABLED")||"").toLowerCase()==="true";
    const partnerApproved=(Deno.env.get("MARKETPLACE_PAYPAL_PARTNER_APPROVED")||"").toLowerCase()==="true";
    const delayedApproved=(Deno.env.get("MARKETPLACE_PAYPAL_DELAYED_DISBURSEMENT_APPROVED")||"").toLowerCase()==="true";
    const liveApproved=(Deno.env.get("MARKETPLACE_PAYPAL_LIVE_APPROVED")||"").toLowerCase()==="true";
    const cardApproved=(Deno.env.get("MARKETPLACE_PAYPAL_ADVANCED_CARDS_APPROVED")||"").toLowerCase()==="true";
    if(data.marketplace_approval_status!=="approved")blockers.push("Marketplace provider approval has not been confirmed.");
    if(!data.checkout_enabled)blockers.push("Buyer checkout is disabled.");
    if(!data.payouts_enabled)blockers.push("Seller payouts are disabled.");
    if(!data.tax_calculation_enabled)blockers.push("Tax and customs calculation is not configured.");
    if(!data.delayed_disbursement_enabled)blockers.push("Delayed seller disbursement is not approved and enabled.");
    if(!data.provider)blockers.push("No marketplace payment provider is configured.");
    if(!envConfigured)blockers.push("Marketplace-specific PayPal credentials, attribution ID and webhook ID are not configured.");
    if(!envEnabled)blockers.push("Marketplace PayPal transactions are disabled.");
    if(!partnerApproved)blockers.push("PayPal has not approved Minglora as a marketplace partner.");
    if(!delayedApproved)blockers.push("PayPal delayed disbursement has not been approved for the marketplace.");
    if(MARKETPLACE_PAYPAL_MODE==="live"&&!liveApproved)blockers.push("Production PayPal Marketplace use is not approved.");
    if(data.card_payments_enabled&&!cardApproved)blockers.push("PayPal Advanced Credit and Debit Card Payments underwriting is not approved.");
    const baseReady=Boolean(data.marketplace_approval_status==="approved"&&data.provider==="paypal"&&data.checkout_enabled&&data.payouts_enabled&&data.tax_calculation_enabled&&data.delayed_disbursement_enabled&&envConfigured&&envEnabled&&partnerApproved&&delayedApproved&&(MARKETPLACE_PAYPAL_MODE!=="live"||liveApproved));
    return json(200,{
      enabled:baseReady,
      orderCreationEnabled:baseReady,
      payoutsEnabled:Boolean(baseReady&&data.payouts_enabled),
      hostedCardOptionsAvailable:baseReady,
      cardPaymentsEnabled:Boolean(baseReady&&data.card_payments_enabled&&cardApproved),
      provider:data.provider||null,blockers
    });
  }


  if (action === "marketplace_order_create") {
    const buyerId=String(input.buyerId||""),quoteId=String(input.quoteId||""),idempotencyKey=String(input.idempotencyKey||"");
    if(!validUuid(buyerId)||!validUuid(quoteId)||idempotencyKey.length<8||idempotencyKey.length>128){
      return json(400,{error:"A valid checkout quote and idempotency key are required."});
    }
    const {data,error}=await admin.rpc("create_marketplace_order_idempotent",{
      p_buyer_id:buyerId,p_quote_id:quoteId,p_idempotency_key:idempotencyKey
    });
    if(error)return fail(error,"Marketplace order could not be created.");
    return json(201,{order:data,notice:"Order created. Payment is not confirmed until the approved payment provider verifies capture."});
  }

  if (action === "marketplace_orders_list") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid account."});
    const [buyerOrders,sellerOrders]=await Promise.all([
      admin.from("marketplace_orders").select("id,buyer_id,currency,status,payment_status,item_subtotal_minor,fulfillment_minor,tax_minor,total_minor,created_at,updated_at")
        .eq("buyer_id",userId).order("created_at",{ascending:false}).limit(100),
      admin.from("marketplace_seller_orders").select("id,order_id,seller_id,status,gross_minor,commission_minor,seller_net_minor,payout_status,created_at,updated_at")
        .eq("seller_id",userId).order("created_at",{ascending:false}).limit(100)
    ]);
    if(buyerOrders.error||sellerOrders.error)return json(503,{error:"Marketplace orders could not be loaded."});
    const sellerByOrder=new Map((sellerOrders.data||[]).map((row:any)=>[row.order_id,row]));
    const ids=[...new Set([...(buyerOrders.data||[]).map((row:any)=>row.id),...(sellerOrders.data||[]).map((row:any)=>row.order_id)])];
    const headers=new Map((buyerOrders.data||[]).map((row:any)=>[row.id,row]));
    if(ids.length){
      const {data,error}=await admin.from("marketplace_orders")
        .select("id,buyer_id,currency,status,payment_status,item_subtotal_minor,fulfillment_minor,tax_minor,total_minor,created_at,updated_at")
        .in("id",ids);
      if(error)return json(503,{error:"Marketplace order details could not be loaded."});
      for(const row of data||[])headers.set(row.id,row);
    }
    const orders=[...headers.values()].map((row:any)=>{
      const seller=sellerByOrder.get(row.id);
      return {
        id:row.id,buyerId:row.buyer_id,currency:row.currency,status:row.status,paymentStatus:row.payment_status,
        itemSubtotalMinor:row.item_subtotal_minor,fulfillmentMinor:row.fulfillment_minor,taxMinor:row.tax_minor,
        totalMinor:row.total_minor,createdAt:row.created_at,updatedAt:row.updated_at,
        role:row.buyer_id===userId?"buyer":"seller",
        sellerOrder:seller?{id:seller.id,status:seller.status,grossMinor:seller.gross_minor,
          commissionMinor:seller.commission_minor,sellerNetMinor:seller.seller_net_minor,
          payoutStatus:seller.payout_status}:null
      };
    }).sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
    return json(200,{orders});
  }

  if (action === "marketplace_order_get") {
    const userId=String(input.userId||""),orderId=String(input.orderId||"");
    if(!validUuid(userId)||!validUuid(orderId))return json(400,{error:"Invalid order reference."});
    const {data:order,error:orderError}=await admin.from("marketplace_orders")
      .select("id,buyer_id,currency,status,payment_status,item_subtotal_minor,fulfillment_minor,tax_minor,total_minor,discount_minor,refunded_minor,created_at,updated_at")
      .eq("id",orderId).maybeSingle();
    if(orderError)return json(503,{error:"Order could not be loaded."});
    if(!order)return json(404,{error:"Order not found."});
    const isBuyer=order.buyer_id===userId;
    const {data:sellerOrders,error:sellerError}=await admin.from("marketplace_seller_orders")
      .select("id,order_id,seller_id,status,gross_minor,commission_minor,processor_fee_minor,seller_net_minor,refunded_minor,payout_status,created_at,updated_at")
      .eq("order_id",orderId).eq(isBuyer?"order_id":"seller_id",isBuyer?orderId:userId);
    if(sellerError)return json(503,{error:"Seller order details could not be loaded."});
    if(!isBuyer&&!(sellerOrders||[]).length)return json(403,{error:"You are not a participant in this order."});
    const sellerOrderIds=(sellerOrders||[]).map((row:any)=>row.id);
    const [itemsResult,fulfilmentResult,eventsResult]=await Promise.all([
      sellerOrderIds.length?admin.from("marketplace_order_items").select("id,seller_order_id,listing_id,title_snapshot,quantity,unit_price_minor,line_total_minor").in("seller_order_id",sellerOrderIds):Promise.resolve({data:[],error:null}),
      sellerOrderIds.length?admin.from("marketplace_fulfillments").select("id,seller_order_id,method,status,carrier,tracking_reference,tracking_url,dispatched_at,delivered_at,created_at,updated_at").in("seller_order_id",sellerOrderIds):Promise.resolve({data:[],error:null}),
      admin.from("marketplace_order_events").select("id,event_type,from_status,to_status,note,created_at").eq("order_id",orderId).order("created_at",{ascending:true}).limit(200)
    ]);
    if(itemsResult.error||fulfilmentResult.error||eventsResult.error)return json(503,{error:"Order activity could not be loaded."});
    const itemMap=new Map<string,any[]>();
    for(const item of itemsResult.data||[]){const items=itemMap.get(item.seller_order_id)||[];items.push({
      id:item.id,listingId:item.listing_id,title:item.title_snapshot,quantity:item.quantity,
      unitPriceMinor:item.unit_price_minor,lineTotalMinor:item.line_total_minor
    });itemMap.set(item.seller_order_id,items);}
    const fulfillMap=new Map<string,any[]>();
    for(const row of fulfilmentResult.data||[]){const items=fulfillMap.get(row.seller_order_id)||[];items.push({
      id:row.id,method:row.method,status:row.status,carrier:row.carrier,trackingReference:row.tracking_reference,
      trackingUrl:row.tracking_url,dispatchedAt:row.dispatched_at,deliveredAt:row.delivered_at
    });fulfillMap.set(row.seller_order_id,items);}
    const ownSellerOrders=(sellerOrders||[]).map((row:any)=>({
      id:row.id,sellerId:row.seller_id,status:row.status,grossMinor:row.gross_minor,
      commissionMinor:row.commission_minor,processorFeeMinor:row.processor_fee_minor,
      sellerNetMinor:row.seller_net_minor,refundedMinor:row.refunded_minor,payoutStatus:row.payout_status,
      items:itemMap.get(row.id)||[],fulfillments:fulfillMap.get(row.id)||[]
    }));
    return json(200,{order:{id:order.id,buyerId:order.buyer_id,currency:order.currency,status:order.status,
      paymentStatus:order.payment_status,itemSubtotalMinor:order.item_subtotal_minor,
      fulfillmentMinor:order.fulfillment_minor,taxMinor:order.tax_minor,discountMinor:order.discount_minor,
      totalMinor:order.total_minor,refundedMinor:order.refunded_minor,createdAt:order.created_at,
      updatedAt:order.updated_at,sellerOrders:ownSellerOrders,
      events:(eventsResult.data||[]).map((row:any)=>({id:row.id,type:row.event_type,fromStatus:row.from_status,toStatus:row.to_status,note:row.note,createdAt:row.created_at}))}});
  }

  if (action === "marketplace_order_cancel") {
    const userId=String(input.userId||""),orderId=String(input.orderId||"");
    if(!validUuid(userId)||!validUuid(orderId))return json(400,{error:"Invalid order cancellation."});
    const {data:order,error}=await admin.from("marketplace_orders")
      .select("id,buyer_id,status,payment_status").eq("id",orderId).maybeSingle();
    if(error)return json(503,{error:"Order could not be loaded."});
    if(!order||order.buyer_id!==userId)return json(404,{error:"Order not found."});
    if(order.status!=="awaiting_payment"||!["not_started","pending","failed"].includes(order.payment_status)){
      return json(409,{error:"This order can no longer be cancelled through this action."});
    }
    const {data,count,error:releaseError}=await admin.rpc("release_marketplace_unpaid_order_inventory",{
      p_order_id:orderId,p_reason:"buyer_cancelled_before_payment"
    });
    if(releaseError)return fail(releaseError,"Order inventory could not be released.");
    return json(200,{ok:true,releasedReservations:data||0,status:"cancelled",message:"Order cancelled and reserved stock released. No payment was taken."});
  }

  if (action === "marketplace_inventory_expire") {
    const {data,error}=await admin.rpc("expire_marketplace_inventory_reservations");
    if(error)return fail(error,"Expired Marketplace stock reservations could not be released.");
    return json(200,{ok:true,releasedReservations:data||0});
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
    const category=String(job.category||""),employmentType=String(job.employmentType||""),workplaceType=String(job.workplaceType||"");
    const location=String(job.location||"").trim().slice(0,160),currency=String(job.currency||"JMD").toUpperCase();
    const salaryMin=job.salaryMinMinor==null?null:Number(job.salaryMinMinor);
    const salaryMax=job.salaryMaxMinor==null?null:Number(job.salaryMaxMinor);
    const allowedCategories=["technology","administration","customer_service","sales_marketing","finance","healthcare","education","construction_trades","transport_logistics","hospitality","creative_media","other"];
    const allowedEmployment=["full_time","part_time","contract","temporary","internship","freelance"];
    const allowedWorkplace=["onsite","hybrid","remote"];
    const allowedCurrencies=["JMD","USD","CAD","GBP","EUR","TTD","BBD","GYD"];
    if(title.length<5||companyName.length<2||description.length<50||description.length>6000||
       !allowedCategories.includes(category)||!allowedEmployment.includes(employmentType)||
       !allowedWorkplace.includes(workplaceType)||(workplaceType!=="remote"&&location.length<2)||
       !allowedCurrencies.includes(currency)||!Number.isFinite(deadline.getTime())||deadline<=new Date()||
       (salaryMin!==null&&(!Number.isSafeInteger(salaryMin)||salaryMin<0))||
       (salaryMax!==null&&(!Number.isSafeInteger(salaryMax)||salaryMax<0))||
       (salaryMin!==null&&salaryMax!==null&&salaryMax<salaryMin)){
      return json(400,{error:"Job posting details, salary, location or application deadline are invalid."});
    }
    const {data,error}=await admin.from("marketplace_job_postings").insert({
      employer_id:employerId,company_name:companyName,title,description,category,
      employment_type:employmentType,workplace_type:workplaceType,location_label:location,
      currency,salary_min_minor:salaryMin,salary_max_minor:salaryMax,
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
    const {data:pending,error:lookupError}=await admin.from("marketplace_job_postings")
      .select("id,application_deadline").eq("id",input.jobId).eq("status","pending_review").maybeSingle();
    if(lookupError)return json(503,{error:"Pending job vacancy could not be loaded."});
    if(!pending)return json(404,{error:"Pending job vacancy not found."});
    if(input.status==="open"&&new Date(pending.application_deadline)<=new Date()){
      return json(409,{error:"The application deadline has passed. Edit and resubmit this vacancy with a future deadline."});
    }
    const {data,error}=await admin.from("marketplace_job_postings").update({
      status:input.status,reviewed_by:actorId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq("id",input.jobId).eq("status","pending_review").select("*").maybeSingle();
    if(error)return fail(error,"Job moderation decision could not be saved.");
    if(!data)return json(409,{error:"The vacancy was reviewed by another request. Refresh the queue."});
    const {error:auditError}=await admin.from("audit_log").insert({
      actor_id:actorId,action:"job_posting_"+String(input.status),target_type:"job_posting",
      target_id:String(input.jobId),metadata:{reason:String(input.reason).slice(0,1000)}
    });
    if(auditError)return json(503,{error:"Vacancy decision saved but the audit event could not be written."});
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

  if (action === "streambay_cleanup") {
    const { data: assets, error: assetLookupError } = await admin
      .from("media_assets")
      .select("id,storage_bucket,storage_key")
      .like("attached_to", "streambay:%");
    if (assetLookupError) return json(503, { error: "StreamBay media inventory could not be read." });

    const allowedBuckets = new Set([
      "minglora-avatars", "minglora-covers", "minglora-post-media", "minglora-stories",
      "minglora-message-attachments", "minglora-group-media", "minglora-page-media",
      "minglora-ringtones", "minglora-short-videos", "minglora-marketplace-media",
      "minglora-live-thumbnails", "minglora-data-exports"
    ]);
    const grouped = new Map<string, string[]>();
    const assetIds: string[] = [];
    for (const asset of assets || []) {
      assetIds.push(String(asset.id));
      if (!asset.storage_bucket || !asset.storage_key) continue;
      if (!allowedBuckets.has(asset.storage_bucket) || String(asset.storage_key).includes("..")) {
        return json(409, { error: "A StreamBay media record contains an invalid storage reference; no metadata was deleted." });
      }
      const paths = grouped.get(asset.storage_bucket) || [];
      paths.push(asset.storage_key);
      grouped.set(asset.storage_bucket, paths);
    }

    let deletedStorageObjects = 0;
    for (const [bucket, paths] of grouped) {
      for (let offset = 0; offset < paths.length; offset += 1000) {
        const batch = paths.slice(offset, offset + 1000);
        const { error } = await admin.storage.from(bucket).remove(batch);
        if (error) return json(502, { error: "StreamBay files could not be fully removed from Storage." });
        deletedStorageObjects += batch.length;
      }
    }

    let deletedMediaRecords = 0;
    if (assetIds.length) {
      const { data: deleted, error } = await admin.from("media_assets")
        .delete().in("id", assetIds).select("id");
      if (error) return json(503, { error: "StreamBay media metadata could not be fully removed." });
      deletedMediaRecords = (deleted || []).length;
    }

    const stateKeys = [
      "streambayChannels", "streambayVideos", "streambayComments", "streambaySubscriptions",
      "streambayLikes", "streambayHistory", "streambayPlaylists", "streambayPlaylistItems",
      "streambayWatchLater"
    ];
    const { data: current, error: stateReadError } = await admin
      .from("minglora_runtime_state")
      .select("state,revision")
      .eq("state_key", "primary")
      .maybeSingle();
    if (stateReadError || !current) return json(503, { error: "Minglora application state could not be read for StreamBay cleanup." });

    const state = current.state || {};
    let removedRuntimeKeys = 0;
    for (const key of stateKeys) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        delete state[key];
        removedRuntimeKeys++;
      }
    }
    let removedRuntimeAssets = 0;
    if (Array.isArray(state.mediaAssets)) {
      const before = state.mediaAssets.length;
      state.mediaAssets = state.mediaAssets.filter((asset: any) => !String(asset?.attachedTo || "").startsWith("streambay:"));
      removedRuntimeAssets = before - state.mediaAssets.length;
    }

    let revision = Number(current.revision);
    if (removedRuntimeKeys || removedRuntimeAssets) {
      const { data: saved, error } = await admin.from("minglora_runtime_state")
        .update({ state, revision: revision + 1, updated_at: new Date().toISOString() })
        .eq("state_key", "primary")
        .eq("revision", revision)
        .select("revision")
        .maybeSingle();
      if (error || !saved) return json(409, { error: "StreamBay data cleanup needs a retry because Minglora state changed concurrently." });
      revision = Number(saved.revision);
    }

    return json(200, {
      ok: true,
      deletedStorageObjects,
      deletedMediaRecords,
      removedRuntimeKeys,
      removedRuntimeAssets,
      revision
    });
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
