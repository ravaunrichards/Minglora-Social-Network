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
    "internal_activity_feed",
    "streambay_cleanup", "load", "save", "health", "media_sign", "media_upload_prepare", "media_upload_complete", "media_delete",
    "live_broadcast_create", "live_broadcast_end", "live_chat_list", "live_chat_send", "live_chat_delete",
    "live_participant_mark_connected", "live_participant_mark_left", "live_speaker_request", "live_speaker_requests_list", "live_speaker_request_status",
    "live_speaker_request_review", "live_speaker_mark_connected", "live_speaker_mark_left",
    "economy_catalog", "economy_wallet", "economy_refunded_gift_ids", "economy_purchase_create", "economy_purchase_get",
    "economy_purchase_settle", "economy_send_gift", "economy_send_social_gift", "economy_live_reward_create",
    "economy_live_reward_list", "economy_live_reward_join", "economy_live_reward_claim", "economy_live_reward_settle",
    "economy_creator_earnings", "economy_marketing_budget", "economy_marketing_funding", "economy_marketing_funding_order_create", "economy_marketing_funding_order_get", "economy_marketing_funding_order_settle", "economy_marketing_grant",
    "economy_exchange_creator_earnings", "economy_owner_issuance", "economy_admin_member_credit", "economy_admin_member_search", "economy_admin_campaign_wallet", "economy_admin_campaign_allocate", "economy_admin_creator_earnings", "economy_admin_campaign_history",
    "economy_admin_promotional_fund_status", "economy_admin_promotional_fund_order_create", "economy_admin_promotional_fund_order_get", "economy_admin_promotional_fund_order_settle",
    "economy_promotional_gift_wallet", "economy_send_admin_promotional_gift",
    "economy_get_payout_account", "economy_set_payout_account", "economy_unlink_payout_account", "economy_request_payout",
    "economy_update_payout", "economy_payout_webhook", "economy_admin_platform_payout_account_set",
    "economy_admin_platform_payout_request", "economy_admin_platform_payout_update", "relationship_follow", "relationship_unfollow",
    "auth_register_user", "account_deletion_request",
    "profile_verification_get", "profile_verification_submit", "profile_verification_admin_members", "profile_verification_admin_set", "profile_verification_admin_queue", "profile_verification_admin_review", "profile_verification_alert_mark_read",
    "subscription_creator_get", "subscription_apply", "subscription_admin_queue", "subscription_admin_review",
    "subscription_tier_store", "subscription_enable", "subscription_checkout_prepare",
    "subscription_checkout_attach", "subscription_my", "subscription_access_check", "subscription_cancel_lookup",
    "subscription_cancel_mark", "subscription_paypal_webhook",
    "subscription_bonus_review",
  ];
  if (!supportedActions.includes(String(action))) {
    return json(400, { error: "Unsupported action." });
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const validUuid = (value: unknown) => uuidPattern.test(String(value || ""));
  const fail = (error: any, fallback: string) =>
    json(409, { error: String(error?.message || fallback).slice(0, 240) });

  const payPalMoneyMinor = (money: any, expectedCurrency: string): number | null => {
    if (!money || typeof money !== "object") return null;
    const moneyCurrency = String(money.currency_code || money.currency || "").toUpperCase();
    const rawAmount = money.value ?? money.total;
    if (moneyCurrency !== expectedCurrency || rawAmount === undefined || rawAmount === null) return null;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const minor = Math.round(amount * 100);
    return Number.isSafeInteger(minor) ? minor : null;
  };

  if (action === "internal_activity_feed") {
    const requestedLimit = Math.floor(Number(input.limit || 50));
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
    const afterId = Math.max(0, Math.floor(Number(input.afterId || 0)));
    let eventQuery = admin
      .from("minglora_internal_activity")
      .select("id,occurred_at,event_type,source_table,operation,record_id,actor_id,collections")
      .order("id", { ascending: afterId > 0 })
      .limit(limit);
    if (afterId > 0) eventQuery = eventQuery.gt("id", afterId);
    const { data: events, error: eventError } = await eventQuery;
    if (eventError) return json(503, { error: "Minglora's internal activity journal is unavailable." });

    const { data: runtime, error: runtimeError } = await admin
      .from("minglora_runtime_state")
      .select("state,revision,updated_at")
      .eq("state_key", "primary")
      .maybeSingle();
    if (runtimeError || !runtime) return json(503, { error: "Minglora runtime health could not be read." });

    const state = runtime.state || {};
    const activeByStatus = (items: any[], active: string[]) => (Array.isArray(items) ? items : [])
      .filter((item: any) => active.includes(String(item?.status || "").toLowerCase())).length;
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const activeSessions = sessions.filter((item: any) => {
      const expiry = Date.parse(String(item?.expiresAt || item?.expires_at || ""));
      return Number.isFinite(expiry) && expiry > Date.now();
    }).length;
    const liveBroadcastQuery = await admin
      .from("live_broadcasts")
      .select("id", { count: "exact", head: true })
      .eq("status", "live");
    if (liveBroadcastQuery.error) return json(503, { error: "Minglora LIVE status could not be checked." });

    const cursor = (events || []).reduce((max: number, event: any) => Math.max(max, Number(event.id) || 0), afterId);
    return json(200, {
      events: events || [],
      cursor,
      snapshot: {
        revision: Number(runtime.revision || 0),
        updatedAt: runtime.updated_at || null,
        syncedAt: new Date().toISOString(),
        registeredMembers: Array.isArray(state.users) ? state.users.length : 0,
        activeSessions,
        activeCalls: activeByStatus(state.calls, ["ringing", "active", "connected", "in_progress"]),
        activeLiveSessions: activeByStatus(state.liveSessions, ["live", "active", "broadcasting"]),
        activeDatabaseBroadcasts: Number(liveBroadcastQuery.count || 0),
        activeMeetings: Array.isArray(state.meetWaveRooms) ? state.meetWaveRooms.filter((item: any) =>
          !["ended", "completed", "closed", "cancelled", "expired"].includes(String(item?.status || "").toLowerCase())
        ).length : 0
      }
    });
  }

  if (action === "economy_refunded_gift_ids") {
    const { data: refundRows, error: refundError } = await admin
      .from("coin_ledger")
      .select("reference_id,created_at")
      .eq("entry_type", "refund")
      .not("reference_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (refundError) return json(503, { error: "Minglora could not load refunded gift references." });
    const references = [...new Set((refundRows || [])
      .map((row: any) => String(row.reference_id || ""))
      .filter((id: string) => uuidPattern.test(id)))];
    if (!references.length) return json(200, { giftIds: [] });
    const confirmedIds: string[] = [];
    for (let offset = 0; offset < references.length; offset += 200) {
      const batch = references.slice(offset, offset + 200);
      const { data: gifts, error: giftError } = await admin.from("live_gift_transactions")
        .select("id").in("id", batch);
      if (giftError) return json(503, { error: "Minglora could not verify refunded LIVE Gifts." });
      for (const gift of gifts || []) confirmedIds.push(String(gift.id));
    }
    return json(200, { giftIds: [...new Set(confirmedIds)] });
  }

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
    const { data: usernameOwner, error: usernameLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (usernameLookupError) {
      return json(503, { error: "Minglora could not verify username availability. Please try again." });
    }
    if (usernameOwner) {
      return json(409, { error: "That username is already taken. Choose another username.", code: "username_already_taken" });
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
      const providerCode = String(error?.code || "").toLowerCase();
      const emailDuplicate = providerCode === "email_exists" ||
        /user already registered|email.*(already|exists|registered)|(already|exists|registered).*email/i.test(message);
      const usernameDuplicate = /profiles_username_lower_uq|username/i.test(message);
      if (emailDuplicate) {
        return json(409, { error: "An account with this email already exists. Log in instead.", code: "email_already_registered" });
      }
      if (usernameDuplicate) {
        return json(409, { error: "That username is already taken. Choose another username.", code: "username_already_taken" });
      }
      const duplicate = /already|exists|registered|duplicate/i.test(message);
      return json(duplicate ? 409 : 503, {
        error: duplicate ? "The email or username is already in use. Check both and try again." : message,
        code: duplicate ? "registration_identifier_conflict" : "registration_failed"
      });
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
    if (error) return json(503, { error: "Minglora could not update the creator payout from PayPal's event." });
    const platformPatch: Record<string, unknown> = { status };
    if (status === "paid") platformPatch.paid_at = new Date().toISOString();
    if (status === "failed") {
      platformPatch.failure_code = "PAYPAL_PAYOUT_FAILED";
      platformPatch.failure_message = "PayPal reported that the platform payout failed. The amount is no longer reserved.";
    }
    const { data: platformData, error: platformError } = await admin.from("minglora_platform_payouts")
      .update(platformPatch)
      .eq("paypal_batch_id", batchId)
      .in("status", ["requested", "processing"])
      .select("id,status,amount_minor");
    if (platformError) return json(503, { error: "Creator payout status was updated, but the platform payout status could not be reconciled." });
    return json(200, {
      updated: (data || []).length + (platformData || []).length,
      creatorPayoutsUpdated: (data || []).length,
      platformPayoutsUpdated: (platformData || []).length
    });
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
    const packagesPromise = admin.from("coin_packages")
      .select("code,name,coin_amount,price_minor,currency")
      .eq("active", true)
      .order("sort_order")
      .order("code");

    // PostgREST commonly caps a single response at 1,000 rows. Fetch the
    // complete active gift catalogue in stable, non-overlapping pages.
    const gifts: any[] = [];
    const pageSize = 1000;
    let giftsError: any = null;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin.from("live_gift_catalog")
        .select("code,name,category,emoji,animation_key,coin_price,image_url,model_url,animation_preset,sound_preset,animation_duration_ms,asset_version")
        .eq("active", true)
        .order("sort_order")
        .order("code")
        .range(offset, offset + pageSize - 1);
      if (error) {
        giftsError = error;
        break;
      }
      const page = data || [];
      gifts.push(...page);
      if (page.length < pageSize) break;
    }
    const packagesResult = await packagesPromise;
    if (packagesResult.error || giftsError) {
      console.error("[Minglora economy catalogue] Could not load every catalogue page.", {
        packagesError: packagesResult.error?.message || null,
        giftsError: giftsError?.message || null,
        loadedGiftCount: gifts.length
      });
      return json(503, { error: "Minglora coin and gift catalogue is unavailable. Please retry." });
    }
    return json(200, {
      packages: packagesResult.data || [],
      gifts,
      giftCount: gifts.length,
      currency: "USD",
      coinName: "Minglora Coins"
    });
  }

  if (action === "economy_wallet") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const [walletResult, ledgerResult] = await Promise.all([
      admin.from("coin_wallets").select("balance_coins,cash_balance_coins,marketing_balance_coins,promo_balance_coins,updated_at").eq("user_id", userId).maybeSingle(),
      admin.from("coin_ledger").select("id,delta_coins,balance_after,entry_type,description,cash_delta_coins,marketing_delta_coins,promo_delta_coins,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100)
    ]);
    if (walletResult.error || ledgerResult.error) return json(503, { error: "Minglora wallet could not be loaded." });
    return json(200, { wallet: walletResult.data || { balance_coins: 0 }, ledger: ledgerResult.data || [] });
  }

  if (action === "economy_marketing_budget") {
    const { data, error } = await admin.rpc("minglora_get_marketing_budget");
    if (error) return fail(error, "Minglora marketing budget could not be loaded.");
    return json(200, { budget: data || {} });
  }

  if (action === "economy_marketing_funding_order_create") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalOrderId = String(input.paypalOrderId || "");
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    const note = String(input.note || "").trim().slice(0, 240);
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(requestId) ||
        paypalOrderId.length < 5 || paypalOrderId.length > 160 ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 50000000) {
      return json(400, { error: "Invalid Minglora marketing funding order." });
    }
    const { data, error } = await admin.rpc("minglora_create_marketing_funding_order", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail,
      p_paypal_order_id: paypalOrderId, p_amount_minor: amountMinor,
      p_request_id: requestId, p_note: note
    });
    if (error) return fail(error, "Minglora marketing funding order could not be recorded.");
    return json(201, { order: data || null });
  }

  if (action === "economy_marketing_funding_order_get") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalOrderId = String(input.paypalOrderId || "");
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" ||
        paypalOrderId.length < 5 || paypalOrderId.length > 160) {
      return json(400, { error: "Invalid marketing funding order lookup." });
    }
    const { data, error } = await admin.rpc("minglora_get_marketing_funding_order", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail, p_paypal_order_id: paypalOrderId
    });
    if (error) return fail(error, "Minglora marketing funding order could not be verified.");
    return json(200, { order: data || null });
  }

  if (action === "economy_marketing_funding_order_settle") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalOrderId = String(input.paypalOrderId || "");
    const paypalCaptureId = String(input.paypalCaptureId || "");
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(requestId) ||
        paypalOrderId.length < 5 || paypalOrderId.length > 160 ||
        paypalCaptureId.length < 5 || paypalCaptureId.length > 160 ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 50000000) {
      return json(400, { error: "Invalid confirmed PayPal marketing funding capture." });
    }
    const { data, error } = await admin.rpc("minglora_settle_marketing_funding_order", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail,
      p_paypal_order_id: paypalOrderId, p_paypal_capture_id: paypalCaptureId,
      p_amount_minor: amountMinor, p_request_id: requestId
    });
    if (error) return fail(error, "Confirmed marketing funding could not be settled.");
    return json(200, { settlement: data || null });
  }

  if (action === "economy_marketing_funding") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    const fundingReference = String(input.fundingReference || "").trim();
    const note = String(input.note || "").trim().slice(0, 240);
    if (!validUuid(adminUserId) || !validUuid(requestId) ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 100 ||
        fundingReference.length < 6 || fundingReference.length > 160 ||
        adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com") {
      return json(400, { error: "Enter a valid verified funding amount and external transaction reference." });
    }
    const { data, error } = await admin.rpc("minglora_record_marketing_funding", {
      p_admin_user_id: adminUserId,
      p_admin_email: adminEmail,
      p_amount_minor: amountMinor,
      p_request_id: requestId,
      p_funding_reference: fundingReference,
      p_note: note
    });
    if (error) return fail(error, "Minglora could not record marketing funding.");
    return json(200, { funding: data });
  }

  if (action === "economy_marketing_grant") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const memberUsername = String(input.memberUsername || "").trim().replace(/^@/, "").toLowerCase();
    const amountCoins = Number(input.amountCoins);
    const requestId = String(input.requestId || "");
    const note = String(input.note || "").trim().slice(0, 240);
    if (!validUuid(adminUserId) || !validUuid(requestId) ||
        !/^[a-z0-9_]{3,30}$/.test(memberUsername) ||
        !Number.isSafeInteger(amountCoins) || amountCoins < 1 ||
        adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com") {
      return json(400, { error: "Enter a valid Minglora username and a positive Coin grant." });
    }
    const { data: member, error: memberError } = await admin
      .from("profiles")
      .select("id,username")
      .eq("username", memberUsername)
      .maybeSingle();
    if (memberError) return json(503, { error: "Minglora could not find that member account." });
    if (!member?.id) return json(404, { error: "Minglora member was not found." });

    const { data, error } = await admin.rpc("minglora_grant_marketing_coins", {
      p_admin_user_id: adminUserId,
      p_admin_email: adminEmail,
      p_member_user_id: member.id,
      p_amount_coins: amountCoins,
      p_request_id: requestId,
      p_note: note
    });
    if (error) return fail(error, "Marketing Coins could not be granted from the funded budget.");
    return json(200, { grant: data });
  }

  if (action === "economy_admin_member_credit") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const memberLookup = String(input.memberLookup || "").trim().replace(/^@/, "").toLowerCase();
    const amountCoins = Number(input.amountCoins);
    const requestId = String(input.requestId || "");
    const note = String(input.note || "").trim().slice(0, 240);
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" || adminEmail !== "creatorhubcreatornetwork@gmail.com" ||
        !memberLookup || memberLookup.length > 80 || !validUuid(requestId) ||
        !Number.isSafeInteger(amountCoins) || amountCoins < 1) {
      return json(400, { error: "Invalid admin member-credit details." });
    }

    const { data: ownerProfile, error: ownerLookupError } = await admin
      .from("profiles")
      .select("verification_status,verification_badge")
      .eq("id", adminUserId)
      .maybeSingle();
    if (ownerLookupError) return json(503, { error: "Owner verification could not be checked." });
    if (!ownerProfile || ownerProfile.verification_status !== "verified" ||
        ownerProfile.verification_badge !== "blue") {
      return json(403, { error: "Only the verified Creator Hub owner may credit member wallets." });
    }

    let memberQuery = admin.from("profiles").select("id,username");
    if (validUuid(memberLookup)) memberQuery = memberQuery.eq("id", memberLookup);
    else if (/^[a-z0-9_]{3,30}$/.test(memberLookup)) memberQuery = memberQuery.eq("username", memberLookup);
    else return json(400, { error: "Enter a valid Minglora username or account ID." });
    const { data: member, error: memberLookupError } = await memberQuery.maybeSingle();
    if (memberLookupError) return json(503, { error: "Minglora could not look up that member." });
    if (!member?.id || !member.username) return json(404, { error: "No Minglora member was found for that username or account ID." });
    if (member.id === adminUserId) return json(400, { error: "Use owner issuance for your own Coin wallet." });

    const { data, error } = await admin.rpc("minglora_admin_credit_member_coins", {
      p_admin_user_id: adminUserId,
      p_admin_email: adminEmail,
      p_member_user_id: member.id,
      p_amount_coins: amountCoins,
      p_request_id: requestId,
      p_note: note
    });
    if (error) return fail(error, "Minglora could not credit the member wallet.");
    return json(200, { credit: data });
  }

  if (action === "economy_admin_campaign_wallet") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    if (adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" || adminEmail !== "creatorhubcreatornetwork@gmail.com") return json(403, { error: "Only the Creator Hub administrator can view the campaign wallet." });
    const { data, error } = await admin.rpc("admin_campaign_coins_get_wallet", { p_admin_user_id: adminUserId, p_admin_email: adminEmail });
    if (error) return fail(error, "Admin Campaign Coins wallet could not be loaded.");
    return json(200, data || {});
  }

  if (action === "economy_admin_campaign_allocate") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const memberLookup = String(input.memberLookup || "").trim().replace(/^@/, "").toLowerCase();
    const amountCoins = Number(input.amountCoins);
    const requestId = String(input.requestId || "");
    const note = String(input.note || "").trim().slice(0, 500);
    if (adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" || adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(requestId) || !/^[a-z0-9_]{3,30}$/.test(memberLookup) || !Number.isSafeInteger(amountCoins) || amountCoins < 1 || amountCoins > 1000000000000) return json(400, { error: "Enter a valid member username, Coin amount and request reference." });
    const { data: member, error: memberError } = await admin.from("profiles").select("id,username,display_name").eq("username", memberLookup).maybeSingle();
    if (memberError) return json(503, { error: "Minglora could not look up that member." });
    if (!member?.id) return json(404, { error: "Minglora member was not found." });
    const { data, error } = await admin.rpc("admin_campaign_coins_allocate", { p_admin_user_id: adminUserId, p_admin_email: adminEmail, p_member_user_id: member.id, p_amount_coins: amountCoins, p_request_id: requestId, p_campaign_name: "Minglora Admin Promotional Gift Campaign", p_note: note });
    if (error) return fail(error, "Admin Campaign Coins could not be allocated.");
    return json(200, { allocation: data, member: { id: member.id, username: member.username, displayName: member.display_name || "" } });
  }

  if (action === "economy_admin_promotional_fund_status") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com") {
      return json(403, { error: "Only the Creator Hub administrator can view the promotional gift reserve." });
    }
    const { data, error } = await admin.rpc("minglora_get_admin_promotional_gift_fund", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail
    });
    if (error) return fail(error, "Promotional gift cash reserve could not be loaded.");
    const { data: ledger, error: ledgerError } = await admin.from("minglora_promotional_gift_fund_ledger")
      .select("id,event_type,reference_id,paypal_order_id,paypal_capture_id,funded_delta_minor,spent_delta_minor,note,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (ledgerError) return json(503, { error: "Promotional gift funding history could not be loaded." });
    return json(200, { fund: data || {}, ledger: ledger || [] });
  }

  if (action === "economy_admin_promotional_fund_order_create") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalOrderId = String(input.paypalOrderId || "");
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(requestId) ||
        paypalOrderId.length < 5 || paypalOrderId.length > 160 ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 50000000) {
      return json(400, { error: "Invalid promotional gift PayPal funding order." });
    }
    const { data, error } = await admin.rpc("minglora_create_promotional_gift_funding_order", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail,
      p_paypal_order_id: paypalOrderId, p_amount_minor: amountMinor, p_request_id: requestId
    });
    if (error) return fail(error, "Promotional gift funding order could not be recorded.");
    return json(201, { result: data });
  }

  if (action === "economy_admin_promotional_fund_order_get") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalOrderId = String(input.paypalOrderId || "");
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || paypalOrderId.length < 5 || paypalOrderId.length > 160) {
      return json(400, { error: "Invalid promotional gift funding order lookup." });
    }
    const { data, error } = await admin.rpc("minglora_get_promotional_gift_funding_order", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail, p_paypal_order_id: paypalOrderId
    });
    if (error) return fail(error, "Promotional gift funding order could not be verified.");
    return json(200, { order: data || null });
  }

  if (action === "economy_admin_promotional_fund_order_settle") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalOrderId = String(input.paypalOrderId || "");
    const paypalCaptureId = String(input.paypalCaptureId || "");
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(requestId) ||
        paypalOrderId.length < 5 || paypalOrderId.length > 160 ||
        paypalCaptureId.length < 5 || paypalCaptureId.length > 160 ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 100) {
      return json(400, { error: "Invalid confirmed PayPal promotional gift funding capture." });
    }
    const { data, error } = await admin.rpc("minglora_settle_promotional_gift_funding_order", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail,
      p_paypal_order_id: paypalOrderId, p_paypal_capture_id: paypalCaptureId,
      p_amount_minor: amountMinor, p_request_id: requestId
    });
    if (error) return fail(error, "Verified promotional gift funding could not be settled.");
    return json(200, { settlement: data });
  }

  if (action === "economy_admin_creator_earnings") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    if (!validUuid(adminUserId) ||
        adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com") {
      return json(403, { error: "Only the Creator Hub owner can view creator gift revenue." });
    }

    const [ownerResult, staffResult] = await Promise.all([
      admin.from("profiles")
        .select("verification_status,verification_badge")
        .eq("id", adminUserId)
        .maybeSingle(),
      admin.from("minglora_platform_staff")
        .select("user_id")
        .eq("user_id", adminUserId)
        .eq("role", "owner")
        .eq("active", true)
        .contains("permissions", ["platform:admin"])
        .limit(1)
        .maybeSingle()
    ]);
    if (ownerResult.error || staffResult.error) {
      return json(503, { error: "Minglora owner permissions could not be verified." });
    }
    if (ownerResult.data?.verification_status !== "verified" ||
        ownerResult.data?.verification_badge !== "blue" ||
        !staffResult.data?.user_id) {
      return json(403, { error: "The verified Creator Hub owner permission is not active." });
    }

    const readAllPages = async (table: string, columns: string, orderBy = "created_at") => {
      const rows: any[] = [];
      const pageSize = 1000;
      for (let offset = 0; offset < 100000; offset += pageSize) {
        const { data, error } = await admin.from(table)
          .select(columns)
          .order(orderBy, { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) return { rows: null, error };
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return { rows, error: null };
    };

    const [
      ledgerResult, payoutsResult, platformFinanceResult, platformPayoutAccountResult, platformPayoutsResult,
      creatorPayoutAccountsResult, promotionalWalletsResult, promotionalWalletLedgerResult,
      promotionalFundResult, promotionalFundLedgerResult, promotionalCashBackingsResult
    ] = await Promise.all([
      readAllPages("creator_earnings_ledger",
        "id,creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor,currency,status,created_at,funding_source"),
      readAllPages("creator_payouts",
        "id,creator_id,amount_minor,currency,status,created_at,paid_at,paypal_batch_id"),
      admin.rpc("minglora_get_platform_gift_earnings", {
        p_admin_user_id: adminUserId, p_admin_email: adminEmail
      }),
      admin.from("minglora_platform_payout_accounts")
        .select("paypal_email,updated_at").eq("id", true).maybeSingle(),
      admin.from("minglora_platform_payouts")
        .select("id,amount_minor,currency,paypal_email,status,paypal_batch_id,created_at,submitted_at,paid_at,failure_code,failure_message")
        .order("created_at", { ascending: false }).limit(100),
      admin.from("creator_payout_accounts")
        .select("user_id,paypal_email,updated_at"),
      readAllPages("admin_promotional_gift_wallets",
        "user_id,available_coins,lifetime_allocated_coins,lifetime_spent_coins,updated_at", "updated_at"),
      readAllPages("admin_promotional_gift_wallet_ledger",
        "id,request_id,user_id,actor_user_id,delta_coins,balance_after,event_type,reference_id,note,created_at"),
      admin.from("minglora_promotional_gift_fund")
        .select("funded_minor,spent_minor,updated_at").eq("id", true).maybeSingle(),
      readAllPages("minglora_promotional_gift_fund_ledger",
        "id,request_id,event_type,reference_id,paypal_order_id,paypal_capture_id,funded_delta_minor,spent_delta_minor,note,actor_user_id,created_at"),
      readAllPages("minglora_promotional_gift_cash_backings",
        "id,gift_transaction_id,creator_id,gift_coin_amount,backing_minor,creator_share_minor,platform_share_minor,fund_ledger_id,actor_user_id,created_at")
    ]);
    if (ledgerResult.error || payoutsResult.error || platformFinanceResult.error ||
        platformPayoutAccountResult.error || platformPayoutsResult.error ||
        creatorPayoutAccountsResult.error || promotionalWalletsResult.error ||
        promotionalWalletLedgerResult.error || promotionalFundResult.error ||
        promotionalFundLedgerResult.error || promotionalCashBackingsResult.error) {
      console.error("[Minglora admin creator earnings] Financial report read failed.", {
        ledgerError: ledgerResult.error?.message || null,
        payoutsError: payoutsResult.error?.message || null,
        platformFinanceError: platformFinanceResult.error?.message || null,
        platformPayoutAccountError: platformPayoutAccountResult.error?.message || null,
        platformPayoutsError: platformPayoutsResult.error?.message || null,
        creatorPayoutAccountsError: creatorPayoutAccountsResult.error?.message || null,
        promotionalWalletsError: promotionalWalletsResult.error?.message || null,
        promotionalWalletLedgerError: promotionalWalletLedgerResult.error?.message || null,
        promotionalFundError: promotionalFundResult.error?.message || null,
        promotionalFundLedgerError: promotionalFundLedgerResult.error?.message || null,
        promotionalCashBackingsError: promotionalCashBackingsResult.error?.message || null
      });
      return json(503, { error: "Creator withdrawals, promotional wallet activity, cash backing or platform withdrawal history could not be loaded." });
    }

    const allLedger = ledgerResult.rows || [];
    const eligibleFundingSources = new Set(["cash", "marketing", "mixed", "admin_promotional"]);
    const ledger = allLedger.filter((row: any) => eligibleFundingSources.has(String(row.funding_source || "")));
    const excludedPromotionalLedger = allLedger.filter((row: any) => String(row.funding_source || "") === "promo");
    const payouts = payoutsResult.rows || [];
    const platformFinance = platformFinanceResult.data || {};
    const excludedPromotionalTotals = {
      giftCount: excludedPromotionalLedger.length,
      grossMinor: excludedPromotionalLedger.reduce((sum: number, row: any) => sum + Math.max(0, Math.round(Number(row.gross_minor || 0))), 0),
      creatorShareMinor: excludedPromotionalLedger.reduce((sum: number, row: any) => sum + Math.max(0, Math.round(Number(row.creator_share_minor || 0))), 0),
      platformShareMinor: excludedPromotionalLedger.reduce((sum: number, row: any) => sum + Math.max(0, Math.round(Number(row.platform_share_minor || 0))), 0)
    };
    const byCreator = new Map<string, any>();
    const totals = {
      giftCount: 0, grossMinor: 0, creatorShareMinor: 0, platformShareMinor: 0,
      availableLedgerMinor: 0, requestedPayoutMinor: 0, processingPayoutMinor: 0,
      pendingPayoutMinor: 0, paidPayoutMinor: 0, failedPayoutMinor: 0,
      splitMismatchCount: 0,
      excludedPromotionalGiftCount: excludedPromotionalTotals.giftCount,
      excludedPromotionalGrossMinor: excludedPromotionalTotals.grossMinor,
      excludedPromotionalCreatorShareMinor: excludedPromotionalTotals.creatorShareMinor,
      excludedPromotionalPlatformShareMinor: excludedPromotionalTotals.platformShareMinor
    };
    const ensureCreator = (creatorId: string) => {
      if (!byCreator.has(creatorId)) byCreator.set(creatorId, {
        creatorId, giftCount: 0, grossMinor: 0, creatorShareMinor: 0,
        platformShareMinor: 0, availableLedgerMinor: 0, requestedPayoutMinor: 0,
        processingPayoutMinor: 0, pendingPayoutMinor: 0, paidPayoutMinor: 0,
        failedPayoutMinor: 0, lastGiftAt: null
      });
      return byCreator.get(creatorId);
    };

    for (const row of ledger) {
      const creatorId = String(row.creator_id || "");
      if (!validUuid(creatorId)) continue;
      const item = ensureCreator(creatorId);
      const gross = Math.max(0, Math.round(Number(row.gross_minor || 0)));
      const creatorShare = Math.max(0, Math.round(Number(row.creator_share_minor || 0)));
      const platformShare = Math.max(0, Math.round(Number(row.platform_share_minor || 0)));
      item.giftCount += 1;
      item.grossMinor += gross;
      item.creatorShareMinor += creatorShare;
      item.platformShareMinor += platformShare;
      if (row.status === "available") item.availableLedgerMinor += creatorShare;
      if (!item.lastGiftAt || new Date(row.created_at || 0).getTime() > new Date(item.lastGiftAt).getTime()) {
        item.lastGiftAt = row.created_at || null;
      }
      totals.giftCount += 1;
      totals.grossMinor += gross;
      totals.creatorShareMinor += creatorShare;
      totals.platformShareMinor += platformShare;
      if (row.status === "available") totals.availableLedgerMinor += creatorShare;
      if (gross !== creatorShare + platformShare || Math.abs(creatorShare - platformShare) > 1) {
        totals.splitMismatchCount += 1;
      }
    }

    for (const payout of payouts) {
      const creatorId = String(payout.creator_id || "");
      if (!validUuid(creatorId)) continue;
      const item = ensureCreator(creatorId);
      const amount = Math.max(0, Math.round(Number(payout.amount_minor || 0)));
      const status = String(payout.status || "").toLowerCase();
      if (status === "requested") {
        item.requestedPayoutMinor += amount;
        item.pendingPayoutMinor += amount;
        totals.requestedPayoutMinor += amount;
        totals.pendingPayoutMinor += amount;
      } else if (status === "processing") {
        item.processingPayoutMinor += amount;
        item.pendingPayoutMinor += amount;
        totals.processingPayoutMinor += amount;
        totals.pendingPayoutMinor += amount;
      } else if (status === "paid") {
        item.paidPayoutMinor += amount;
        totals.paidPayoutMinor += amount;
      } else if (status === "failed") {
        item.failedPayoutMinor += amount;
        totals.failedPayoutMinor += amount;
      }
    }

    const promoWalletRows = promotionalWalletsResult.data || [];
    const promoWalletLedgerRows = promotionalWalletLedgerResult.rows || [];
    const promoFundLedgerRows = promotionalFundLedgerResult.rows || [];
    const promoCashBackingRows = promotionalCashBackingsResult.rows || [];
    const payoutAccountRows = creatorPayoutAccountsResult.data || [];
    const profileIds = [...new Set([
      ...byCreator.keys(),
      ...payouts.map((row: any) => String(row.creator_id || "")),
      ...promoWalletRows.map((row: any) => String(row.user_id || "")),
      ...promoWalletLedgerRows.flatMap((row: any) => [String(row.user_id || ""), String(row.actor_user_id || "")]),
      ...promoFundLedgerRows.map((row: any) => String(row.actor_user_id || "")),
      ...promoCashBackingRows.flatMap((row: any) => [String(row.creator_id || ""), String(row.actor_user_id || "")])
    ].filter(validUuid))];
    const profiles: any[] = [];
    for (let offset = 0; offset < profileIds.length; offset += 100) {
      const batch = profileIds.slice(offset, offset + 100);
      if (!batch.length) continue;
      const { data, error } = await admin.from("profiles")
        .select("id,username,display_name").in("id", batch);
      if (error) return json(503, { error: "Creator and promotional member account names could not be loaded." });
      profiles.push(...(data || []));
    }
    const profileById = new Map(profiles.map((profile: any) => [profile.id, profile]));
    const payoutAccountById = new Map(payoutAccountRows.map((account: any) => [account.user_id, account]));
    const creators = [...byCreator.values()].map((item: any) => {
      const profile: any = profileById.get(item.creatorId) || {};
      return {
        ...item, username: profile.username || "",
        displayName: profile.display_name || profile.username || "Unavailable creator"
      };
    }).sort((a: any, b: any) => b.grossMinor - a.grossMinor);
    const creatorPayouts = payouts.map((payout: any) => {
      const profile: any = profileById.get(payout.creator_id) || {};
      const account: any = payoutAccountById.get(payout.creator_id) || {};
      return {
        id: payout.id, creatorId: payout.creator_id,
        username: profile.username || "",
        displayName: profile.display_name || profile.username || "Unavailable creator",
        amountMinor: Number(payout.amount_minor || 0), currency: payout.currency || "USD",
        status: payout.status, paypalEmail: account.paypal_email || "",
        paypalBatchId: payout.paypal_batch_id || null,
        createdAt: payout.created_at || null, paidAt: payout.paid_at || null
      };
    });
    const promotionalWalletTotals = promoWalletRows.reduce((totals: any, wallet: any) => ({
      availableCoins: totals.availableCoins + Math.max(0, Number(wallet.available_coins || 0)),
      lifetimeAllocatedCoins: totals.lifetimeAllocatedCoins + Math.max(0, Number(wallet.lifetime_allocated_coins || 0)),
      lifetimeSpentCoins: totals.lifetimeSpentCoins + Math.max(0, Number(wallet.lifetime_spent_coins || 0))
    }), { availableCoins: 0, lifetimeAllocatedCoins: 0, lifetimeSpentCoins: 0 });
    const promotionalWallets = promoWalletRows.map((wallet: any) => {
      const profile: any = profileById.get(wallet.user_id) || {};
      return {
        userId: wallet.user_id, username: profile.username || "",
        displayName: profile.display_name || profile.username || "Unavailable member",
        availableCoins: Number(wallet.available_coins || 0),
        lifetimeAllocatedCoins: Number(wallet.lifetime_allocated_coins || 0),
        lifetimeSpentCoins: Number(wallet.lifetime_spent_coins || 0),
        updatedAt: wallet.updated_at || null
      };
    });
    const promotionalWalletLedger = promoWalletLedgerRows.map((row: any) => {
      const member: any = profileById.get(row.user_id) || {};
      const actor: any = profileById.get(row.actor_user_id) || {};
      return {
        id: row.id, userId: row.user_id,
        memberUsername: member.username || "",
        memberDisplayName: member.display_name || member.username || "Unavailable member",
        actorUsername: actor.username || "",
        deltaCoins: Number(row.delta_coins || 0),
        balanceAfter: Number(row.balance_after || 0),
        eventType: row.event_type || "activity", referenceId: row.reference_id || null,
        note: row.note || "", createdAt: row.created_at || null
      };
    });
    const promotionalFund = promotionalFundResult.data || {};
    const promotionalCashFundedMinor = Math.max(0, Number(promotionalFund.funded_minor || 0));
    const promotionalCashSpentMinor = Math.max(0, Number(promotionalFund.spent_minor || 0));
    const promotionalCashReserve = {
      fundedMinor: promotionalCashFundedMinor,
      spentMinor: promotionalCashSpentMinor,
      availableMinor: Math.max(0, promotionalCashFundedMinor - promotionalCashSpentMinor),
      updatedAt: promotionalFund.updated_at || null,
      ledger: promoFundLedgerRows.map((row: any) => {
        const actor: any = profileById.get(row.actor_user_id) || {};
        return {
          id: row.id, eventType: row.event_type || "activity",
          fundedDeltaMinor: Number(row.funded_delta_minor || 0),
          spentDeltaMinor: Number(row.spent_delta_minor || 0),
          note: row.note || "", actorUsername: actor.username || "",
          paypalOrderId: row.paypal_order_id || null,
          paypalCaptureId: row.paypal_capture_id || null,
          createdAt: row.created_at || null
        };
      })
    };
    const promotionalCashBackings = {
      giftCount: promoCashBackingRows.length,
      giftCoins: promoCashBackingRows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.gift_coin_amount || 0)), 0),
      backingMinor: promoCashBackingRows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.backing_minor || 0)), 0),
      creatorShareMinor: promoCashBackingRows.reduce((sum: number, row: any) => sum + Math.max(0, Math.round(Number(row.creator_share_minor || 0))), 0),
      platformShareMinor: promoCashBackingRows.reduce((sum: number, row: any) => sum + Math.max(0, Math.round(Number(row.platform_share_minor || 0))), 0),
      records: promoCashBackingRows.slice(0, 150).map((row: any) => {
        const creator: any = profileById.get(row.creator_id) || {};
        return {
          id: row.id, creatorId: row.creator_id,
          creatorUsername: creator.username || "",
          creatorDisplayName: creator.display_name || creator.username || "Unavailable creator",
          giftCoins: Number(row.gift_coin_amount || 0), backingMinor: Number(row.backing_minor || 0),
          creatorShareMinor: Number(row.creator_share_minor || 0),
          platformShareMinor: Number(row.platform_share_minor || 0),
          createdAt: row.created_at || null
        };
      })
    };

    return json(200, {
      asOf: new Date().toISOString(),
      currency: "USD",
      creatorSharePercent: 50,
      platformSharePercent: 50,
      payoutScope: "cash_backed_creator_earnings_only",
      platformFinance,
      platformPayoutAccount: platformPayoutAccountResult.data || null,
      platformPayouts: platformPayoutsResult.data || [],
      creatorPayouts,
      promotionalWalletTotals,
      promotionalWallets,
      promotionalWalletLedger,
      promotionalCashReserve,
      promotionalCashBackings,
      excludedPromotionalActivity: excludedPromotionalTotals,
      totals: {
        ...totals,
        creatorCount: creators.filter((creator: any) => creator.giftCount > 0).length,
        payoutCount: payouts.length
      },
      creators: creators.slice(0, 100)
    });
  }

  if (action === "economy_admin_platform_payout_account_set") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const paypalEmail = String(input.paypalEmail || "").trim().toLowerCase();
    const paypalEmailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$/i;
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" ||
        paypalEmail.length > 127 || !paypalEmailPattern.test(paypalEmail)) {
      return json(400, { error: "Enter a valid PayPal receiving email address." });
    }
    const [ownerResult, staffResult] = await Promise.all([
      admin.from("profiles").select("verification_status,verification_badge")
        .eq("id", adminUserId).maybeSingle(),
      admin.from("minglora_platform_staff").select("user_id")
        .eq("user_id", adminUserId).eq("role", "owner").eq("active", true)
        .contains("permissions", ["platform:admin"]).limit(1).maybeSingle()
    ]);
    if (ownerResult.error || staffResult.error) return json(503, { error: "Minglora owner permissions could not be verified." });
    if (ownerResult.data?.verification_status !== "verified" ||
        ownerResult.data?.verification_badge !== "blue" || !staffResult.data?.user_id) {
      return json(403, { error: "The verified Creator Hub owner permission is not active." });
    }
    const { data, error } = await admin.from("minglora_platform_payout_accounts")
      .upsert({ id: true, paypal_email: paypalEmail, updated_by: adminUserId, updated_at: new Date().toISOString() },
        { onConflict: "id" })
      .select("paypal_email,updated_at").single();
    if (error) return fail(error, "Minglora's PayPal receiving email could not be saved.");
    return json(200, { payoutAccount: data });
  }

  if (action === "economy_admin_platform_payout_request") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !Number.isSafeInteger(amountMinor) ||
        amountMinor < 100 || !validUuid(requestId)) {
      return json(400, { error: "Enter a valid Minglora platform withdrawal amount and request reference." });
    }
    const { data, error } = await admin.rpc("minglora_request_platform_payout", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail,
      p_amount_minor: amountMinor, p_request_id: requestId
    });
    if (error) return fail(error, "Minglora could not reserve the requested platform share.");
    return json(201, { payout: data });
  }

  if (action === "economy_admin_platform_payout_update") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const payoutId = String(input.payoutId || "");
    const status = String(input.status || "");
    const paypalBatchId = input.paypalBatchId ? String(input.paypalBatchId) : null;
    const failureCode = input.failureCode ? String(input.failureCode) : null;
    const failureMessage = input.failureMessage ? String(input.failureMessage) : null;
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(payoutId) ||
        !["processing", "paid", "failed"].includes(status)) {
      return json(400, { error: "Invalid Minglora platform payout update." });
    }
    const { data, error } = await admin.rpc("minglora_update_platform_payout", {
      p_admin_user_id: adminUserId, p_admin_email: adminEmail, p_payout_id: payoutId,
      p_status: status, p_paypal_batch_id: paypalBatchId,
      p_failure_code: failureCode, p_failure_message: failureMessage
    });
    if (error) return fail(error, "Minglora could not update the platform withdrawal record.");
    return json(200, { payout: data });
  }

  if (action === "economy_admin_campaign_history") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    if (adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" || adminEmail !== "creatorhubcreatornetwork@gmail.com") return json(403, { error: "Only the Creator Hub administrator can view campaign history." });
    const { data: rows, error } = await admin.from("admin_campaign_coins_ledger").select("id,member_user_id,delta_coins,balance_after,campaign_name,note,created_at").eq("admin_user_id", adminUserId).eq("event_type", "allocation").order("created_at", { ascending: false }).limit(100);
    if (error) return json(503, { error: "Admin Campaign Coins history could not be loaded." });
    const memberIds = [...new Set((rows || []).map((row: any) => row.member_user_id).filter(Boolean))];
    const { data: profiles, error: profilesError } = memberIds.length ? await admin.from("profiles").select("id,username,display_name").in("id", memberIds) : { data: [], error: null };
    if (profilesError) return json(503, { error: "Campaign recipient details could not be loaded." });
    const byId = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    return json(200, { items: (rows || []).map((row: any) => { const member = byId.get(row.member_user_id); return { id: row.id, memberUsername: member?.username || "", memberDisplayName: member?.display_name || "", amountCoins: Math.abs(Number(row.delta_coins || 0)), note: row.note || row.campaign_name || "", createdAt: row.created_at, balanceAfter: row.balance_after }; }) });
  }

  if (action === "economy_admin_member_search") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const rawSearch = String(input.search || "").trim().slice(0, 80);
    const search = rawSearch.replace(/^@/, "").trim();

    if (!validUuid(adminUserId) ||
        adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com") {
      return json(403, { error: "Only the Creator Hub administrative account can search Minglora members." });
    }

    // Recheck the owner profile and platform-staff grant in Supabase. The
    // Render route separately enforces the signed-in MFA reviewer session.
    const [ownerResult, staffResult] = await Promise.all([
      admin.from("profiles")
        .select("verification_status,verification_badge")
        .eq("id", adminUserId)
        .maybeSingle(),
      admin.from("minglora_platform_staff")
        .select("user_id")
        .eq("user_id", adminUserId)
        .eq("role", "owner")
        .eq("active", true)
        .contains("permissions", ["platform:admin"])
        .limit(1)
        .maybeSingle()
    ]);
    if (ownerResult.error || staffResult.error) {
      return json(503, { error: "Minglora administrator permissions could not be verified." });
    }
    if (ownerResult.data?.verification_status !== "verified" ||
        ownerResult.data?.verification_badge !== "blue" ||
        !staffResult.data?.user_id) {
      return json(403, { error: "The verified Creator Hub owner permission is not active." });
    }

    const columns = "id,username,display_name,avatar_url,created_at";
    const newestMembers = () => admin.from("profiles")
      .select(columns)
      .neq("id", adminUserId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);

    let profiles: any[] = [];
    if (!search) {
      const { data, error } = await newestMembers();
      if (error) return json(503, { error: "Minglora member profiles could not be loaded." });
      profiles = data || [];
    } else {
      // Pass the search term as a bound filter value and escape SQL wildcard
      // characters so a typed "%" or "_" does not turn into a broad search.
      const pattern = "%" + search.replace(/[\\%_]/g, (character: string) => "\\" + character) + "%";
      const [usernameResult, displayNameResult] = await Promise.all([
        newestMembers().ilike("username", pattern),
        newestMembers().ilike("display_name", pattern)
      ]);
      if (usernameResult.error || displayNameResult.error) {
        return json(503, { error: "Minglora member search could not be completed." });
      }
      const byId = new Map<string, any>();
      for (const profile of [...(usernameResult.data || []), ...(displayNameResult.data || [])]) {
        if (profile?.id) byId.set(String(profile.id), profile);
      }
      profiles = [...byId.values()]
        .sort((a, b) => {
          const dateDifference = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
          return dateDifference || String(a.username || "").localeCompare(String(b.username || ""));
        })
        .slice(0, 50);
    }

    return json(200, {
      members: profiles.map((profile: any) => ({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name || "",
        avatarUrl: profile.avatar_url || "",
        joinedAt: profile.created_at || null
      }))
    });
  }

  if (action === "economy_owner_issuance") {
    const ownerId = String(input.ownerId || "");
    const ownerEmail = String(input.ownerEmail || "").trim().toLowerCase();
    const amountCoins = Number(input.amountCoins);
    const requestId = String(input.requestId || "");
    const note = String(input.note || "").trim().slice(0, 240);
    if (!validUuid(ownerId) || ownerId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" || ownerEmail !== "creatorhubcreatornetwork@gmail.com" ||
        !validUuid(requestId) || !Number.isSafeInteger(amountCoins) || amountCoins < 1) {
      return json(400, { error: "Invalid verified owner Coin issuance details." });
    }
    const { data, error } = await admin.rpc("minglora_issue_verified_owner_coins", {
      p_owner_user_id: ownerId, p_owner_email: ownerEmail,
      p_amount_coins: amountCoins, p_request_id: requestId, p_note: note
    });
    if (error) return fail(error, "Minglora could not issue Coins to the verified owner wallet.");
    return json(200, { issuance: data });
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

  if (action === "economy_live_reward_settle") {
    const broadcastId = input.broadcastId ? String(input.broadcastId) : null;
    if (broadcastId && !validUuid(broadcastId)) return json(400, { error: "Invalid LIVE broadcast reference." });
    const { data, error } = await admin.rpc("minglora_settle_live_reward_drops", { p_broadcast_id: broadcastId });
    if (error) return fail(error, "Minglora could not settle LIVE reward drops.");
    return json(200, { settlement: data || { settledCount: 0, refundedCoins: 0 } });
  }

  if (action === "economy_live_reward_create") {
    const creatorId = String(input.creatorId || "");
    const broadcastId = String(input.broadcastId || "");
    const requestId = String(input.requestId || "");
    const kind = String(input.kind || "");
    const totalCoins = Number(input.totalCoins);
    const winnerCount = Number(input.winnerCount);
    const countdownSeconds = Number(input.countdownSeconds);
    const participationMethod = String(input.participationMethod || "tap");
    const keyword = String(input.keyword || "").trim().toLowerCase();
    if (!validUuid(creatorId) || !validUuid(broadcastId) || !validUuid(requestId) ||
        !["goody_bag", "treasure_box"].includes(kind) ||
        !Number.isSafeInteger(totalCoins) || totalCoins < 1 || totalCoins > 1000000 ||
        !Number.isSafeInteger(winnerCount) || winnerCount < 1 || winnerCount > 100 ||
        winnerCount > totalCoins ||
        !Number.isSafeInteger(countdownSeconds) || countdownSeconds < 30 || countdownSeconds > 600 ||
        !["tap", "comment"].includes(participationMethod) ||
        (participationMethod === "comment" && (keyword.length < 1 || keyword.length > 40)) ||
        keyword.length > 40) {
      return json(400, { error: "Check the reward type, coin pool, winners, countdown and entry condition." });
    }
    const { data, error } = await admin.rpc("minglora_create_live_reward_drop", {
      p_creator_id: creatorId,
      p_broadcast_id: broadcastId,
      p_request_id: requestId,
      p_kind: kind,
      p_total_coins: totalCoins,
      p_winner_count: winnerCount,
      p_countdown_seconds: countdownSeconds,
      p_participation_method: participationMethod,
      p_keyword: keyword
    });
    if (error) return fail(error, "Minglora could not create this LIVE reward drop.");
    return json(201, { result: data });
  }

  if (action === "economy_live_reward_list") {
    const userId = String(input.userId || "");
    const broadcastId = String(input.broadcastId || "");
    if (!validUuid(userId) || !validUuid(broadcastId)) return json(400, { error: "Invalid LIVE reward list request." });
    const { data: broadcast, error: broadcastError } = await admin
      .from("live_broadcasts").select("id,status").eq("id", broadcastId).maybeSingle();
    if (broadcastError) return json(503, { error: "Minglora could not verify this LIVE reward room." });
    if (!broadcast) return json(404, { error: "LIVE reward room was not found." });

    const { data: settlement, error: settlementError } = await admin.rpc(
      "minglora_settle_live_reward_drops", { p_broadcast_id: broadcastId }
    );
    if (settlementError) return fail(settlementError, "Minglora could not update LIVE reward timers.");

    const { data: drops, error: dropsError } = await admin
      .from("live_reward_drops")
      .select("id,broadcast_id,creator_id,kind,total_coins,winner_count,countdown_seconds,participation_method,keyword,status,opens_at,closes_at,settled_at,created_at")
      .eq("broadcast_id", broadcastId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (dropsError) return json(503, { error: "Minglora could not load this LIVE reward list." });

    const dropIds = (drops || []).map((drop: any) => drop.id);
    let entries: any[] = [];
    if (dropIds.length) {
      const { data, error } = await admin
        .from("live_reward_participants")
        .select("drop_id,user_id,joined_at,claim_order,reward_coins")
        .in("drop_id", dropIds);
      if (error) return json(503, { error: "Minglora could not load LIVE reward entries." });
      entries = data || [];
    }

    const formatted = (drops || []).map((drop: any) => {
      const people = entries.filter((entry: any) => entry.drop_id === drop.id);
      const own = people.find((entry: any) => entry.user_id === userId) || null;
      return {
        id: drop.id,
        broadcastId: drop.broadcast_id,
        kind: drop.kind,
        totalCoins: Number(drop.total_coins),
        winnerCount: Number(drop.winner_count),
        countdownSeconds: Number(drop.countdown_seconds),
        participationMethod: drop.participation_method,
        keyword: drop.keyword,
        status: drop.status,
        opensAt: drop.opens_at,
        closesAt: drop.closes_at,
        createdAt: drop.created_at,
        settledAt: drop.settled_at,
        participantCount: people.length,
        viewerJoined: Boolean(own),
        viewerClaimOrder: own?.claim_order == null ? null : Number(own.claim_order),
        viewerRewardCoins: Number(own?.reward_coins || 0),
        winners: people.filter((entry: any) => Number(entry.claim_order || 0) > 0)
          .sort((a: any, b: any) => Number(a.claim_order) - Number(b.claim_order))
          .map((entry: any) => ({
            claimOrder: Number(entry.claim_order),
            rewardCoins: Number(entry.reward_coins || 0)
          }))
      };
    });
    return json(200, { drops: formatted, settlement: settlement || null });
  }

  if (action === "economy_live_reward_join" || action === "economy_live_reward_claim") {
    const userId = String(input.userId || "");
    const dropId = String(input.dropId || "");
    const broadcastId = String(input.broadcastId || "");
    const keyword = String(input.keyword || "").trim().toLowerCase();
    if (!validUuid(userId) || !validUuid(dropId) || !validUuid(broadcastId) || keyword.length > 40) {
      return json(400, { error: "Invalid LIVE reward entry." });
    }
    const { data: rewardDrop, error: lookupError } = await admin
      .from("live_reward_drops")
      .select("id,broadcast_id,kind")
      .eq("id", dropId)
      .maybeSingle();
    if (lookupError) return json(503, { error: "Minglora could not verify this reward drop." });
    if (!rewardDrop || rewardDrop.broadcast_id !== broadcastId ||
        (action === "economy_live_reward_join" && rewardDrop.kind !== "goody_bag") ||
        (action === "economy_live_reward_claim" && rewardDrop.kind !== "treasure_box")) {
      return json(404, { error: "This reward drop does not belong to the current LIVE room." });
    }
    const functionName = action === "economy_live_reward_join"
      ? "minglora_join_live_goody_bag"
      : "minglora_claim_live_treasure_box";
    const { data, error } = await admin.rpc(functionName, {
      p_user_id: userId,
      p_drop_id: dropId,
      p_keyword: keyword
    });
    if (error) return fail(error, "Minglora could not confirm your LIVE reward entry.");
    return json(200, { result: data });
  }

  if (action === "economy_send_gift") {
    const senderId = String(input.senderId || ""), broadcastId = String(input.broadcastId || "");
    const giftCode = String(input.giftCode || "");
    const recipientUserId = String(input.recipientUserId || "");
    if (!validUuid(senderId) || !validUuid(broadcastId) || !validUuid(recipientUserId) || !/^[a-z0-9_-]{1,60}$/.test(giftCode)) {
      return json(400, { error: "Invalid LIVE gift request." });
    }
    const { data, error } = await admin.rpc("minglora_send_live_gift", {
      p_sender_id: senderId, p_broadcast_id: broadcastId, p_gift_code: giftCode,
      p_recipient_id: recipientUserId
    });
    if (error) return fail(error, "Minglora could not send the LIVE gift.");

    // Artwork is presentation metadata, not part of the payment decision.
    // Enrich only after the gift RPC confirms the transaction; never turn an
    // artwork lookup failure into a failed/duplicated gift payment.
    const gift = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : { gift: data };
    const { data: artwork, error: artworkError } = await admin
      .from("live_gift_catalog")
      .select("name,emoji,image_url,model_url,coin_price")
      .eq("code", giftCode)
      .maybeSingle();
    if (artworkError) {
      console.warn("[Minglora LIVE gift] Gift artwork lookup was unavailable.", {
        giftCode,
        message: String(artworkError.message || "catalogue lookup failed").slice(0, 160)
      });
    } else if (artwork) {
      gift.giftName = gift.giftName || artwork.name;
      gift.emoji = gift.emoji || artwork.emoji;
      gift.imageUrl = gift.imageUrl || artwork.image_url || "";
      gift.modelUrl = gift.modelUrl || artwork.model_url || "";
      gift.coinPrice = Number(gift.coinPrice || artwork.coin_price || 0);
    }
    return json(200, { gift });
  }

  if (action === "economy_send_social_gift") {
    const senderId = String(input.senderId || "");
    const recipientUsername = String(input.recipientUsername || "").trim().replace(/^@/, "").toLowerCase();
    const giftCode = String(input.giftCode || "");
    const contextType = String(input.contextType || "user");
    const contextId = input.contextId == null ? null : String(input.contextId);

    // Social profile gifts are direct member-to-member transfers. The SQL
    // routine performs the wallet debit, gift transaction, 50/50 earnings
    // split and creator ledger credit atomically.
    if (!validUuid(senderId) ||
        !/^[a-z0-9_]{3,30}$/.test(recipientUsername) ||
        !/^[a-z0-9_-]{1,60}$/.test(giftCode) ||
        contextType !== "user" ||
        contextId !== null) {
      return json(400, { error: "Invalid social gift request." });
    }

    const { data, error } = await admin.rpc("minglora_send_social_gift", {
      p_sender_id: senderId,
      p_recipient_username: recipientUsername,
      p_gift_code: giftCode,
      p_context_type: "user",
      p_context_id: null
    });
    if (error) return fail(error, "Minglora could not send the social gift.");

    const gift = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : { gift: data };
    const { data: artwork, error: artworkError } = await admin
      .from("live_gift_catalog")
      .select("name,emoji,image_url,model_url,coin_price")
      .eq("code", giftCode)
      .maybeSingle();
    if (artworkError) {
      console.warn("[Minglora social gift] Gift artwork lookup was unavailable.", {
        giftCode,
        message: String(artworkError.message || "catalogue lookup failed").slice(0, 160)
      });
    } else if (artwork) {
      gift.giftName = gift.giftName || artwork.name;
      gift.emoji = gift.emoji || artwork.emoji;
      gift.imageUrl = gift.imageUrl || artwork.image_url || "";
      gift.modelUrl = gift.modelUrl || artwork.model_url || "";
      gift.coinPrice = Number(gift.coinPrice || artwork.coin_price || 0);
    }
    return json(200, { gift });
  }

  if (action === "economy_promotional_gift_wallet") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const { data, error } = await admin.rpc("minglora_get_promotional_gift_fund", { p_user_id: userId });
    if (error) return json(503, { error: "Promotional gift wallet could not be loaded." });
    return json(200, { wallet: data || {} });
  }

  if (action === "economy_send_admin_promotional_gift") {
    const senderId = String(input.senderId || "");
    const giftCode = String(input.giftCode || "");
    const broadcastId = input.broadcastId == null ? null : String(input.broadcastId);
    const recipientUsername = input.recipientUsername == null
      ? null
      : String(input.recipientUsername || "").trim().replace(/^@/, "").toLowerCase();
    if (!validUuid(senderId) || !/^[a-z0-9_-]{1,60}$/.test(giftCode) ||
        (broadcastId !== null && !validUuid(broadcastId)) ||
        (broadcastId === null && !/^[a-z0-9_]{3,30}$/.test(String(recipientUsername || "")))) {
      return json(400, { error: "Invalid Admin Promotional Gift request." });
    }
    const { data, error } = await admin.rpc("minglora_send_admin_promotional_gift", {
      p_sender_id: senderId, p_gift_code: giftCode,
      p_broadcast_id: broadcastId, p_recipient_username: recipientUsername
    });
    if (error) return fail(error, "Promotional gift could not be sent or the USD reserve is insufficient.");
    const gift = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : { gift: data };
    const { data: artwork, error: artworkError } = await admin.from("live_gift_catalog")
      .select("name,emoji,image_url,model_url,coin_price").eq("code", giftCode).maybeSingle();
    if (!artworkError && artwork) {
      gift.giftName = gift.giftName || artwork.name;
      gift.emoji = gift.emoji || artwork.emoji;
      gift.imageUrl = gift.imageUrl || artwork.image_url || "";
      gift.modelUrl = gift.modelUrl || artwork.model_url || "";
      gift.coinPrice = Number(gift.coinPrice || artwork.coin_price || 0);
    }
    return json(200, { gift });
  }

  if (action === "subscription_creator_get") {
    const creatorId = String(input.userId || ""), viewerId = String(input.viewerId || "");
    if (!validUuid(creatorId)) return json(400, { error: "Invalid creator account." });
    const viewerQuery = validUuid(viewerId) && viewerId !== creatorId
      ? admin.from("creator_subscriptions").select("id,status,current_period_end,cancel_at_period_end,created_at")
          .eq("creator_id", creatorId).eq("subscriber_id", viewerId)
          .in("status", ["incomplete", "active", "past_due"]).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [settingsResult, tierResult, countResult, viewerResult] = await Promise.all([
      admin.from("subscription_creator_settings").select("*").eq("creator_id", creatorId).maybeSingle(),
      admin.from("subscription_tiers").select("id,creator_id,name,description,currency,price_minor,billing_interval,benefits,is_active,paypal_plan_id").eq("creator_id", creatorId).eq("is_active", true).maybeSingle(),
      admin.from("creator_subscriptions").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).in("status", ["active", "past_due"]).gt("current_period_end", new Date().toISOString()),
      viewerQuery
    ]);
    if (settingsResult.error || tierResult.error || countResult.error || viewerResult.error) return json(503, { error: "Creator subscription settings are unavailable." });
    return json(200, {
      settings: settingsResult.data || null,
      tier: tierResult.data || null,
      activeSubscribers: countResult.count || 0,
      viewerSubscription: viewerResult.data || null
    });
  }
  if (action === "subscription_apply") {
    const creatorId = String(input.userId || ""), note = String(input.applicationNote || "").trim();
    if (!validUuid(creatorId) || note.length > 1200) return json(400, { error: "Enter a valid subscription creator application." });
    const { data: existing, error: lookupError } = await admin.from("subscription_creator_settings")
      .select("application_status").eq("creator_id", creatorId).maybeSingle();
    if (lookupError) return json(503, { error: "Minglora could not check your creator application." });
    if (existing?.application_status === "approved") return json(409, { error: "Your creator subscription application is already approved." });
    if (existing?.application_status === "suspended") return json(403, { error: "This creator account is suspended from subscriptions." });
    const { data, error } = await admin.from("subscription_creator_settings").upsert({
      creator_id: creatorId, application_status: "pending", application_note: note,
      subscriptions_enabled: false, rejection_reason: null, approved_by: null, approved_at: null
    }, { onConflict: "creator_id" }).select("*").single();
    if (error) return fail(error, "Minglora could not submit your creator application.");
    return json(200, { settings: data });
  }

  if (action === "subscription_admin_queue") {
    const { data, error } = await admin.from("subscription_creator_settings")
      .select("creator_id,application_status,application_note,created_at,updated_at")
      .eq("application_status", "pending").order("created_at", { ascending: true }).limit(200);
    if (error) return json(503, { error: "Creator subscription applications are unavailable." });
    const creatorIds = (data || []).map((row: any) => row.creator_id);
    const { data: profiles, error: profileError } = creatorIds.length
      ? await admin.from("profiles").select("id,username").in("id", creatorIds)
      : { data: [], error: null };
    if (profileError) return json(503, { error: "Creator application profile details are unavailable." });
    const usernameById = new Map((profiles || []).map((profile: any) => [profile.id, profile.username]));
    return json(200, { applications: (data || []).map((row: any) => ({ ...row, username: usernameById.get(row.creator_id) || null })) });
  }

  if (action === "subscription_admin_review") {
    const creatorId = String(input.creatorId || ""), reviewerId = String(input.reviewerId || "");
    const status = String(input.status || ""), reason = String(input.reason || "").trim();
    if (!validUuid(creatorId) || !validUuid(reviewerId) || !["approved", "rejected", "suspended"].includes(status) || reason.length > 1000) {
      return json(400, { error: "Invalid creator subscription review." });
    }
    const patch: Record<string, unknown> = {
      application_status: status, subscriptions_enabled: false,
      approved_by: status === "approved" ? reviewerId : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      rejection_reason: status === "approved" ? null : (reason || null),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await admin.from("subscription_creator_settings").update(patch)
      .eq("creator_id", creatorId).select("*").maybeSingle();
    if (error) return fail(error, "Minglora could not save the creator subscription review.");
    if (!data) return json(404, { error: "Creator application not found." });
    return json(200, { settings: data });
  }

  if (action === "subscription_tier_store") {
    const creatorId = String(input.creatorId || ""), productId = String(input.paypalProductId || ""), planId = String(input.paypalPlanId || "");
    const priceMinor = Number(input.priceMinor), currency = String(input.currency || "USD").toUpperCase();
    const name = String(input.name || "Monthly membership").trim(), description = String(input.description || "").trim();
    const benefits = Array.isArray(input.benefits) ? input.benefits.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 8) : [];
    if (!validUuid(creatorId) || !/^PROD-[A-Z0-9]+$/i.test(productId) || !/^P-[A-Z0-9]+$/i.test(planId) ||
        currency !== "USD" || !Number.isSafeInteger(priceMinor) || priceMinor < 299 || priceMinor > 9999 ||
        name.length < 2 || name.length > 48 || description.length > 500 || benefits.some((item: string) => item.length > 100)) {
      return json(400, { error: "Enter a valid monthly price, title, benefits and PayPal plan." });
    }
    const { data: settings, error: settingsError } = await admin.from("subscription_creator_settings")
      .select("application_status").eq("creator_id", creatorId).maybeSingle();
    if (settingsError) return json(503, { error: "Creator approval status could not be checked." });
    if (settings?.application_status !== "approved") return json(403, { error: "Minglora must approve this creator before a subscription price can be published." });
    const { data: current, error: currentError } = await admin.from("subscription_tiers")
      .select("id").eq("creator_id", creatorId).eq("is_active", true).maybeSingle();
    if (currentError) return json(503, { error: "Current subscription tier could not be loaded." });
    let result;
    if (current?.id) {
      result = await admin.from("subscription_tiers").update({
        name, description, currency, price_minor: priceMinor, billing_interval: "month",
        benefits, paypal_product_id: productId, paypal_plan_id: planId, is_active: true, updated_at: new Date().toISOString()
      }).eq("id", current.id).eq("creator_id", creatorId).select("*").single();
    } else {
      result = await admin.from("subscription_tiers").insert({
        creator_id: creatorId, name, description, currency, price_minor: priceMinor,
        billing_interval: "month", benefits, paypal_product_id: productId, paypal_plan_id: planId, is_active: true
      }).select("*").single();
    }
    if (result.error) return fail(result.error, "Minglora could not save this subscription tier.");
    return json(200, { tier: result.data });
  }

  if (action === "subscription_enable") {
    const creatorId = String(input.creatorId || ""), enabled = input.enabled === true;
    if (!validUuid(creatorId)) return json(400, { error: "Invalid creator account." });
    const { data: settings, error: settingsError } = await admin.from("subscription_creator_settings")
      .select("application_status").eq("creator_id", creatorId).maybeSingle();
    if (settingsError) return json(503, { error: "Creator approval status could not be checked." });
    if (enabled) {
      if (settings?.application_status !== "approved") return json(403, { error: "Minglora approval is required before subscriptions can be enabled." });
      const { data: tier, error: tierError } = await admin.from("subscription_tiers").select("id,paypal_plan_id")
        .eq("creator_id", creatorId).eq("is_active", true).maybeSingle();
      if (tierError) return json(503, { error: "Subscription tier could not be checked." });
      if (!tier?.paypal_plan_id) return json(409, { error: "Create a PayPal monthly subscription plan before enabling subscriptions." });
    }
    const { data, error } = await admin.from("subscription_creator_settings").upsert({
      creator_id: creatorId, subscriptions_enabled: enabled,
      application_status: settings?.application_status || "not_applied", updated_at: new Date().toISOString()
    }, { onConflict: "creator_id" }).select("*").single();
    if (error) return fail(error, "Minglora could not update subscription availability.");
    return json(200, { settings: data });
  }

  if (action === "subscription_checkout_prepare") {
    const subscriberId = String(input.subscriberId || ""), creatorId = String(input.creatorId || ""), localId = String(input.subscriptionId || "");
    if (!validUuid(subscriberId) || !validUuid(creatorId) || !validUuid(localId) || subscriberId === creatorId) {
      return json(400, { error: "Invalid subscription checkout." });
    }
    const [settingsResult, tierResult, existingResult] = await Promise.all([
      admin.from("subscription_creator_settings").select("application_status,subscriptions_enabled")
        .eq("creator_id", creatorId).maybeSingle(),
      admin.from("subscription_tiers").select("id,name,description,currency,price_minor,paypal_plan_id,benefits")
        .eq("creator_id", creatorId).eq("is_active", true).maybeSingle(),
      admin.from("creator_subscriptions").select("id,status,created_at")
        .eq("subscriber_id", subscriberId).eq("creator_id", creatorId)
        .in("status", ["incomplete", "active", "past_due"]).limit(1).maybeSingle()
    ]);
    if (settingsResult.error || tierResult.error || existingResult.error) return json(503, { error: "Subscription checkout could not be prepared." });
    if (settingsResult.data?.application_status !== "approved" || !settingsResult.data?.subscriptions_enabled || !tierResult.data?.paypal_plan_id) {
      return json(409, { error: "This creator is not currently accepting subscriptions." });
    }
    const existing = existingResult.data;
    if (existing?.status === "active" || existing?.status === "past_due") return json(409, { error: "You already have a subscription to this creator." });
    if (existing?.status === "incomplete" && Date.now() - new Date(existing.created_at).getTime() < 30 * 60 * 1000) {
      return json(409, { error: "A PayPal checkout for this creator is already waiting for approval. Finish it or try again later." });
    }
    if (existing?.id) await admin.from("creator_subscriptions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", existing.id);
    const { data, error } = await admin.from("creator_subscriptions").insert({
      id: localId, creator_id: creatorId, subscriber_id: subscriberId, tier_id: tierResult.data.id,
      status: "incomplete", currency: tierResult.data.currency, amount_minor: tierResult.data.price_minor,
      provider: "paypal", platform_share_bps: 3000, creator_share_bps: 7000
    }).select("id,creator_id,subscriber_id,tier_id,status,currency,amount_minor").single();
    if (error) return fail(error, "Minglora could not create the subscription checkout record.");
    return json(201, { subscription: data, tier: tierResult.data });
  }

  if (action === "subscription_checkout_attach") {
    const subscriberId = String(input.subscriberId || ""), subscriptionId = String(input.subscriptionId || ""), paypalSubscriptionId = String(input.paypalSubscriptionId || "");
    if (!validUuid(subscriberId) || !validUuid(subscriptionId) || !/^I-[A-Z0-9]+$/i.test(paypalSubscriptionId)) {
      return json(400, { error: "Invalid PayPal subscription reference." });
    }
    const { data, error } = await admin.from("creator_subscriptions").update({
      provider_subscription_id: paypalSubscriptionId, updated_at: new Date().toISOString()
    }).eq("id", subscriptionId).eq("subscriber_id", subscriberId).eq("status", "incomplete")
      .select("id,provider_subscription_id").single();
    if (error || !data) return fail(error, "Minglora could not link the PayPal subscription to this account.");
    return json(200, { subscription: data });
  }

  if (action === "subscription_my") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const [memberResult, creatorResult] = await Promise.all([
      admin.from("creator_subscriptions").select("id,creator_id,subscriber_id,tier_id,status,currency,amount_minor,current_period_start,current_period_end,cancel_at_period_end,provider_subscription_id,created_at")
        .eq("subscriber_id", userId).order("created_at", { ascending: false }).limit(100),
      admin.from("creator_subscriptions").select("id,creator_id,subscriber_id,tier_id,status,currency,amount_minor,current_period_start,current_period_end,cancel_at_period_end,provider_subscription_id,created_at")
        .eq("creator_id", userId).order("created_at", { ascending: false }).limit(100)
    ]);
    if (memberResult.error || creatorResult.error) return json(503, { error: "Your subscription list could not be loaded." });
    const all = [...(memberResult.data || []), ...(creatorResult.data || [])];
    const tierIds = [...new Set(all.map((row: any) => row.tier_id))];
    const userIds = [...new Set(all.map((row: any) => row.creator_id === userId ? row.subscriber_id : row.creator_id))];
    const [tiersResult, profilesResult] = await Promise.all([
      tierIds.length ? admin.from("subscription_tiers").select("id,name,description,benefits").in("id", tierIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? admin.from("profiles").select("id,username").in("id", userIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (tiersResult.error || profilesResult.error) return json(503, { error: "Subscription profile details could not be loaded." });
    return json(200, { subscriptions: all, tiers: tiersResult.data || [], members: profilesResult.data || [] });
  }

  if (action === "subscription_access_check") {
    const userId = String(input.userId || "");
    const creatorIds = Array.isArray(input.creatorIds) ? [...new Set(input.creatorIds.map((id: unknown) => String(id)))].filter(validUuid).slice(0, 100) : [];
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    if (!creatorIds.length) return json(200, { authorizedCreatorIds: [] });
    const nowIso = new Date().toISOString();
    const { data: active, error } = await admin.from("creator_subscriptions")
      .select("creator_id").eq("subscriber_id", userId).in("creator_id", creatorIds)
      .in("status", ["active", "past_due"]).gt("current_period_end", nowIso);
    if (error) return json(503, { error: "Subscriber access could not be checked." });
    const eligible = [...new Set((active || []).map((row: any) => row.creator_id))];
    if (!eligible.length) return json(200, { authorizedCreatorIds: [] });
    const { data: approved, error: settingsError } = await admin.from("subscription_creator_settings")
      .select("creator_id").in("creator_id", eligible).eq("application_status", "approved");
    if (settingsError) return json(503, { error: "Creator subscription status could not be checked." });
    return json(200, { authorizedCreatorIds: (approved || []).map((row: any) => row.creator_id) });
  }

  if (action === "subscription_cancel_lookup") {
    const userId = String(input.userId || ""), subscriptionId = String(input.subscriptionId || "");
    if (!validUuid(userId) || !validUuid(subscriptionId)) return json(400, { error: "Invalid subscription." });
    const { data, error } = await admin.from("creator_subscriptions")
      .select("id,provider_subscription_id,status,current_period_end,cancel_at_period_end")
      .eq("id", subscriptionId).eq("subscriber_id", userId).maybeSingle();
    if (error) return json(503, { error: "Subscription cancellation could not be prepared." });
    if (!data) return json(404, { error: "Subscription not found." });
    if (!data.provider_subscription_id || !["active", "past_due"].includes(data.status)) return json(409, { error: "This subscription cannot be canceled right now." });
    if (data.cancel_at_period_end) return json(200, { subscription: data, alreadyCanceled: true });
    return json(200, { subscription: data });
  }

  if (action === "subscription_cancel_mark") {
    const userId = String(input.userId || ""), subscriptionId = String(input.subscriptionId || "");
    if (!validUuid(userId) || !validUuid(subscriptionId)) return json(400, { error: "Invalid subscription." });
    const { data, error } = await admin.from("creator_subscriptions").update({
      cancel_at_period_end: true, canceled_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq("id", subscriptionId).eq("subscriber_id", userId).in("status", ["active", "past_due"])
      .select("id,status,current_period_end,cancel_at_period_end").single();
    if (error) return fail(error, "Minglora could not record your PayPal cancellation.");
    return json(200, { subscription: data });
  }


  if (action === "subscription_bonus_review") {
    const creatorId = String(input.creatorId || ""), reviewerId = String(input.reviewerId || "");
    const monthStart = String(input.monthStart || "");
    const followerCount = Number(input.followerCount);
    const qualifyingVideoViews = Number(input.qualifyingVideoViews);
    const subscriberOnlyVideoCount = Number(input.subscriberOnlyVideoCount);
    const reviewerNote = String(input.reviewerNote || "").trim().slice(0, 1000);
    if (!validUuid(creatorId) || !validUuid(reviewerId) ||
        !/^\d{4}-\d{2}-01$/.test(monthStart) ||
        !Number.isSafeInteger(followerCount) || followerCount < 0 ||
        !Number.isSafeInteger(qualifyingVideoViews) || qualifyingVideoViews < 0 ||
        !Number.isSafeInteger(subscriberOnlyVideoCount) || subscriberOnlyVideoCount < 0) {
      return json(400, { error: "Invalid monthly creator performance review." });
    }
    const eligible = followerCount >= 10000 && qualifyingVideoViews >= 100000 && subscriberOnlyVideoCount >= 3;
    const { error: reviewError } = await admin.from("subscription_creator_performance_reviews").upsert({
      creator_id: creatorId, month_start: monthStart, follower_count: followerCount,
      qualifying_video_views: qualifyingVideoViews, subscriber_only_video_count: subscriberOnlyVideoCount,
      bonus_eligible: eligible, reviewer_id: reviewerId, reviewer_note: reviewerNote,
      reviewed_at: new Date().toISOString()
    }, { onConflict: "creator_id,month_start" });
    if (reviewError) return fail(reviewError, "Monthly creator performance review could not be saved.");
    const { data: settings, error: settingsError } = await admin.from("subscription_creator_settings")
      .update({ performance_bonus_bps: eligible ? 2000 : 0, performance_bonus_month: monthStart, updated_at: new Date().toISOString() })
      .eq("creator_id", creatorId).select("creator_id,performance_bonus_bps,performance_bonus_month").maybeSingle();
    if (settingsError || !settings) return json(503, { error: "Creator subscription bonus settings could not be updated." });
    return json(200, { eligible, creatorShareBps: eligible ? 9000 : 7000, platformShareBps: eligible ? 1000 : 3000, review: settings });
  }

  if (action === "subscription_paypal_webhook") {
    const event = input.event as any, details = input.subscriptionDetails as any, transactionDetails = input.transactionDetails as any;
    const eventId = String(event?.id || ""), eventType = String(event?.event_type || "");
    const resource = event?.resource || {};
    const allowedEvents = new Set([
      "BILLING.SUBSCRIPTION.CREATED", "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.UPDATED",
      "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED",
      "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
      "PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED"
    ]);
    if (eventId.length < 5 || eventId.length > 160 || !allowedEvents.has(eventType)) {
      return json(400, { error: "Unsupported PayPal subscription event." });
    }
    const paypalSubId = String(details?.id || resource.billing_agreement_id || "");
    const customId = String(details?.custom_id || resource.custom_id || "");
    const insertResult = await admin.from("subscription_payment_events").insert({
      provider: "paypal", provider_event_id: eventId, provider_subscription_id: paypalSubId || null,
      event_type: eventType, payload: event, received_at: new Date().toISOString()
    }).select("id,processed_at").maybeSingle();
    let paymentEvent = insertResult.data;
    if (insertResult.error?.code === "23505") {
      const { data, error } = await admin.from("subscription_payment_events").select("id,processed_at")
        .eq("provider", "paypal").eq("provider_event_id", eventId).single();
      if (error) return json(503, { error: "PayPal event idempotency record could not be checked." });
      paymentEvent = data;
    } else if (insertResult.error) {
      return fail(insertResult.error, "PayPal subscription event could not be stored.");
    }
    if (paymentEvent?.processed_at) return json(200, { received: true, duplicate: true });
    let lookup = admin.from("creator_subscriptions")
      .select("id,creator_id,subscriber_id,tier_id,status,currency,amount_minor,current_period_start,current_period_end")
      .eq("provider", "paypal");
    let subResult: any = null;
    if (paypalSubId) subResult = await lookup.eq("provider_subscription_id", paypalSubId).maybeSingle();
    if ((!subResult || !subResult.data) && validUuid(customId)) {
      subResult = await admin.from("creator_subscriptions")
        .select("id,creator_id,subscriber_id,tier_id,status,currency,amount_minor,current_period_start,current_period_end")
        .eq("id", customId).maybeSingle();
    }
    if (subResult?.error) return json(503, { error: "PayPal event subscription could not be matched." });
    if (!subResult?.data) {
      await admin.from("subscription_payment_events").update({ processing_error: "No matching local subscription record." }).eq("id", paymentEvent.id);
      return json(202, { received: true, matched: false });
    }
    const subscription = subResult.data;
    const detailsStatus = String(details?.status || "");
    const periodEndRaw = details?.billing_info?.next_billing_time || null;
    const periodEnd = periodEndRaw && !Number.isNaN(Date.parse(periodEndRaw)) ? new Date(periodEndRaw).toISOString() : subscription.current_period_end;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED" || eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
        // Approval of the billing agreement alone is not proof of a settled payment.
        // Only PAYMENT.SALE.COMPLETED grants membership access.
        if (periodEnd) patch.current_period_end = periodEnd;
      } else if (detailsStatus === "ACTIVE") {
        if (periodEnd) patch.current_period_end = periodEnd;
      } else if (detailsStatus === "SUSPENDED") {
        patch.status = "past_due";
      } else if (detailsStatus === "CANCELLED" || detailsStatus === "EXPIRED") {
        patch.status = periodEnd && Date.parse(periodEnd) > Date.now() ? "active" : "canceled";
        patch.cancel_at_period_end = true;
      }
    } else if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
      patch.cancel_at_period_end = true;
      patch.canceled_at = new Date().toISOString();
      patch.status = periodEnd && Date.parse(periodEnd) > Date.now() ? "active" : "canceled";
      if (periodEnd) patch.current_period_end = periodEnd;
    } else if (eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
      patch.status = "expired";
    } else if (eventType === "BILLING.SUBSCRIPTION.SUSPENDED" || eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
      patch.status = "past_due";
    } else if (eventType === "PAYMENT.SALE.COMPLETED") {
      const amountNode = resource?.amount || resource?.amount_with_breakdown?.gross_amount || {};
      const amountValue = Number(amountNode.total ?? amountNode.value);
      const amountMinor = Math.round(amountValue * 100);
      const currency = String(amountNode.currency || amountNode.currency_code || "").toUpperCase();
      const transactionId = String(resource.id || "");
      if (!Number.isSafeInteger(amountMinor) || amountMinor !== Number(subscription.amount_minor) ||
          currency !== subscription.currency || transactionId.length < 5) {
        await admin.from("subscription_payment_events").update({ processing_error: "PayPal recurring payment amount or currency did not match the creator tier." }).eq("id", paymentEvent.id);
        return json(409, { error: "PayPal recurring payment does not match the saved subscription price. Reconciliation is required." });
      }

      // Use the matching completed PayPal billing transaction, not the browser or
      // webhook gross alone, to obtain the real provider fee and any reported tax.
      const providerTransactions = Array.isArray(transactionDetails?.transactions) ? transactionDetails.transactions : [];
      const completedSale = providerTransactions.find((item: any) =>
        String(item?.id || "") === transactionId && String(item?.status || "").toUpperCase() === "COMPLETED"
      );
      const breakdown = completedSale?.amount_with_breakdown || null;
      const breakdownGrossMinor = payPalMoneyMinor(breakdown?.gross_amount, currency);
      const feeNode = breakdown?.fee_amount ?? null;
      const netAfterProviderFeeMinor = breakdown?.net_amount
        ? payPalMoneyMinor(breakdown.net_amount, currency)
        : null;
      let providerFeeMinor: number | null = feeNode
        ? payPalMoneyMinor(feeNode, currency)
        : null;
      if (!feeNode && netAfterProviderFeeMinor !== null && breakdownGrossMinor !== null) {
        providerFeeMinor = breakdownGrossMinor - netAfterProviderFeeMinor;
      }
      const taxNode = breakdown?.tax_amount ?? null;
      const taxMinor = taxNode ? payPalMoneyMinor(taxNode, currency) : 0;
      if (!completedSale || breakdownGrossMinor !== amountMinor ||
          providerFeeMinor === null || taxMinor === null ||
          (netAfterProviderFeeMinor !== null && amountMinor - providerFeeMinor !== netAfterProviderFeeMinor) ||
          providerFeeMinor < 0 || taxMinor < 0 || providerFeeMinor + taxMinor >= amountMinor) {
        await admin.from("subscription_payment_events").update({
          processing_error: "Matching PayPal fee and tax breakdown is not yet available or does not reconcile to the settled sale."
        }).eq("id", paymentEvent.id);
        return json(503, { error: "Minglora is waiting for PayPal's matching completed transaction fee and tax breakdown. No estimated fee was used." });
      }
      const netMinor = amountMinor - providerFeeMinor - taxMinor;

      const { data: creatorSettings, error: settingsError } = await admin.from("subscription_creator_settings")
        .select("performance_bonus_bps,performance_bonus_month")
        .eq("creator_id", subscription.creator_id).maybeSingle();
      if (settingsError) return json(503, { error: "Creator subscription bonus status could not be checked." });
      const previousMonth = (() => {
        const current = new Date();
        return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
      })();
      const performanceBonusBps = creatorSettings?.performance_bonus_month === previousMonth &&
        Number(creatorSettings?.performance_bonus_bps) === 2000 ? 2000 : 0;
      const creatorShareBps = 7000 + performanceBonusBps;
      const platformShareBps = 10000 - creatorShareBps;
      const creatorMinor = Math.floor(netMinor * creatorShareBps / 10000);
      const platformMinor = netMinor - creatorMinor;

      const { error: subscriptionShareError } = await admin.from("creator_subscriptions").update({
        creator_share_bps: creatorShareBps, platform_share_bps: platformShareBps
      }).eq("id", subscription.id);
      if (subscriptionShareError) return fail(subscriptionShareError, "Subscription payout share could not be saved.");
      const { error: ledgerError } = await admin.from("subscription_earnings_ledger").upsert({
        subscription_id: subscription.id, payment_event_id: paymentEvent.id,
        provider_transaction_id: transactionId,
        creator_id: subscription.creator_id, subscriber_id: subscription.subscriber_id,
        currency, gross_minor: amountMinor, creator_minor: creatorMinor, platform_minor: platformMinor,
        creator_share_bps: creatorShareBps, platform_share_bps: platformShareBps,
        performance_bonus_bps: performanceBonusBps,
        provider_fee_minor: providerFeeMinor, processing_fee_minor: providerFeeMinor,
        tax_minor: taxMinor, net_minor: netMinor,
        fee_reconciled: true, fee_reconciled_at: new Date().toISOString(),
        entry_type: "payment"
      }, { onConflict: "provider_transaction_id", ignoreDuplicates: true });
      if (ledgerError) return fail(ledgerError, "PayPal payment was received but Minglora could not write the earnings ledger.");
      patch.status = "active";
      patch.current_period_start = resource.create_time || completedSale.time || new Date().toISOString();
      patch.current_period_end = periodEnd;
    } else if (eventType === "PAYMENT.SALE.REFUNDED" || eventType === "PAYMENT.SALE.REVERSED") {
      const amountNode = resource?.amount || {};
      const amountValue = Number(amountNode.total ?? amountNode.value);
      const amountMinor = Math.round(amountValue * 100);
      const currency = String(amountNode.currency || amountNode.currency_code || "").toUpperCase();
      const refundId = String(resource.id || eventId);
      const originalSaleId = String(resource.sale_id || resource.related_ids?.sale_id || "");
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || currency !== subscription.currency ||
          refundId.length < 5 || !originalSaleId) {
        await admin.from("subscription_payment_events").update({ processing_error: "PayPal refund does not identify a valid original sale and amount." }).eq("id", paymentEvent.id);
        return json(409, { error: "PayPal refund or reversal is missing its original sale reference or valid amount. Manual reconciliation is required." });
      }
      const { data: originalPayment, error: originalPaymentError } = await admin.from("subscription_earnings_ledger")
        .select("gross_minor,net_minor,creator_minor,platform_minor,creator_share_bps,platform_share_bps,performance_bonus_bps,processing_fee_minor,tax_minor,fee_reconciled,created_at")
        .eq("subscription_id", subscription.id).eq("provider_transaction_id", originalSaleId)
        .eq("entry_type", "payment").maybeSingle();
      if (originalPaymentError) return json(503, { error: "Original subscription payment could not be checked." });
      if (!originalPayment || originalPayment.fee_reconciled !== true) {
        await admin.from("subscription_payment_events").update({ processing_error: "The original subscription sale is missing fee reconciliation." }).eq("id", paymentEvent.id);
        return json(409, { error: "The original subscription sale is not fee-reconciled. This refund needs manual reconciliation." });
      }
      const { data: priorRefunds, error: priorRefundError } = await admin.from("subscription_earnings_ledger")
        .select("gross_minor").eq("parent_provider_transaction_id", originalSaleId).eq("entry_type", "refund");
      if (priorRefundError) return json(503, { error: "Previous partial subscription refunds could not be checked." });
      const refundedBeforeMinor = (priorRefunds || []).reduce((total: number, item: any) => total + Number(item.gross_minor || 0), 0);
      const originalGrossMinor = Number(originalPayment.gross_minor);
      const refundedAfterMinor = refundedBeforeMinor + amountMinor;
      if (!Number.isSafeInteger(originalGrossMinor) || originalGrossMinor <= 0 || amountMinor > originalGrossMinor - refundedBeforeMinor) {
        await admin.from("subscription_payment_events").update({ processing_error: "Cumulative refund exceeds the original settled sale." }).eq("id", paymentEvent.id);
        return json(409, { error: "Cumulative PayPal refunds cannot exceed the original settled subscription payment." });
      }
      const cumulativeShare = (total: number, cumulativeGross: number) =>
        Math.round(total * cumulativeGross / originalGrossMinor);
      const originalFeeMinor = Number(originalPayment.processing_fee_minor || 0);
      const originalTaxMinor = Number(originalPayment.tax_minor || 0);
      const feeReversalMinor = cumulativeShare(originalFeeMinor, refundedAfterMinor) - cumulativeShare(originalFeeMinor, refundedBeforeMinor);
      const taxReversalMinor = cumulativeShare(originalTaxMinor, refundedAfterMinor) - cumulativeShare(originalTaxMinor, refundedBeforeMinor);
      const refundNetMinor = amountMinor - feeReversalMinor - taxReversalMinor;
      const creatorRefund = cumulativeShare(Number(originalPayment.creator_minor), refundedAfterMinor) -
        cumulativeShare(Number(originalPayment.creator_minor), refundedBeforeMinor);
      const platformRefund = refundNetMinor - creatorRefund;
      const creatorShareBps = Number(originalPayment.creator_share_bps);
      const platformShareBps = Number(originalPayment.platform_share_bps);
      const performanceBonusBps = Number(originalPayment.performance_bonus_bps || 0);
      if ([refundNetMinor,creatorRefund,platformRefund].some(value=>!Number.isSafeInteger(value)||value<0) ||
          creatorRefund+platformRefund!==refundNetMinor ||
          creatorShareBps+platformShareBps!==10000) {
        await admin.from("subscription_payment_events").update({ processing_error: "Calculated refund allocation failed validation." }).eq("id", paymentEvent.id);
        return json(409, { error: "PayPal refund allocation failed validation and requires manual reconciliation." });
      }
      const { error: refundError } = await admin.from("subscription_earnings_ledger").insert({
        subscription_id: subscription.id, payment_event_id: paymentEvent.id,
        provider_transaction_id: refundId, parent_provider_transaction_id: originalSaleId,
        creator_id: subscription.creator_id, subscriber_id: subscription.subscriber_id,
        currency, gross_minor: amountMinor, creator_minor: creatorRefund, platform_minor: platformRefund,
        creator_share_bps: creatorShareBps, platform_share_bps: platformShareBps,
        performance_bonus_bps: performanceBonusBps,
        provider_fee_minor: feeReversalMinor, processing_fee_minor: feeReversalMinor,
        tax_minor: taxReversalMinor, net_minor: refundNetMinor, fee_reconciled: false,
        entry_type: "refund"
      });
      if (refundError && refundError.code !== "23505") return fail(refundError, "PayPal refund was received but Minglora could not reconcile the earnings ledger.");
      const originalPeriodStart = Date.parse(String(originalPayment.created_at || ""));
      const currentPeriodStart = Date.parse(String(subscription.current_period_start || ""));
      const refundIsCurrentPeriod = !Number.isFinite(currentPeriodStart) || !Number.isFinite(originalPeriodStart) ||
        originalPeriodStart >= currentPeriodStart;
      if (eventType === "PAYMENT.SALE.REVERSED" ||
          (refundedAfterMinor >= originalGrossMinor && refundIsCurrentPeriod)) {
        patch.status = "refunded";
        patch.current_period_end = new Date().toISOString();
      }
    }

    const { error: updateError } = await admin.from("creator_subscriptions").update(patch).eq("id", subscription.id);
    if (updateError) return fail(updateError, "PayPal event could not update subscription status.");
    const { error: doneError } = await admin.from("subscription_payment_events").update({
      subscription_id: subscription.id, processed_at: new Date().toISOString(), processing_error: null
    }).eq("id", paymentEvent.id);
    if (doneError) return fail(doneError, "PayPal event was applied but its processing marker could not be saved.");
    return json(200, { received: true, processed: true });
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
    const packagesPromise = admin.from("coin_packages")
      .select("code,name,coin_amount,price_minor,currency")
      .eq("active", true)
      .order("sort_order")
      .order("code");

    // PostgREST commonly caps a single response at 1,000 rows. Fetch the
    // complete active gift catalogue in stable, non-overlapping pages.
    const gifts: any[] = [];
    const pageSize = 1000;
    let giftsError: any = null;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin.from("live_gift_catalog")
        .select("code,name,category,emoji,animation_key,coin_price,image_url,model_url,animation_preset,sound_preset,animation_duration_ms,asset_version")
        .eq("active", true)
        .order("sort_order")
        .order("code")
        .range(offset, offset + pageSize - 1);
      if (error) {
        giftsError = error;
        break;
      }
      const page = data || [];
      gifts.push(...page);
      if (page.length < pageSize) break;
    }
    const packagesResult = await packagesPromise;
    if (packagesResult.error || giftsError) {
      console.error("[Minglora economy catalogue] Could not load every catalogue page.", {
        packagesError: packagesResult.error?.message || null,
        giftsError: giftsError?.message || null,
        loadedGiftCount: gifts.length
      });
      return json(503, { error: "Minglora coin and gift catalogue is unavailable. Please retry." });
    }
    return json(200, {
      packages: packagesResult.data || [],
      gifts,
      giftCount: gifts.length,
      currency: "USD",
      coinName: "Minglora Coins"
    });
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
    const recipientUserId = String(input.recipientUserId || "");
    if (!validUuid(senderId) || !validUuid(broadcastId) || !validUuid(recipientUserId) || !/^[a-z0-9_-]{1,60}$/.test(giftCode)) {
      return json(400, { error: "Invalid LIVE gift request." });
    }
    const { data, error } = await admin.rpc("minglora_send_live_gift", {
      p_sender_id: senderId, p_broadcast_id: broadcastId, p_gift_code: giftCode,
      p_recipient_id: recipientUserId
    });
    if (error) return fail(error, "Minglora could not send the LIVE gift.");
    return json(200, { gift: data });
  }


  if (action === "economy_creator_earnings") {
    const creatorId = String(input.creatorId || "");
    if (!validUuid(creatorId)) return json(400, { error: "Invalid creator account." });
    const [ledgerResult, payoutsResult, accountResult, exchangesResult, balanceResult, giftBalanceResult] = await Promise.all([
      admin.from("creator_earnings_ledger").select("id,gross_minor,creator_share_minor,currency,status,created_at,funding_source").eq("creator_id", creatorId).in("funding_source", ["cash", "marketing", "mixed", "admin_promotional"]).order("created_at", { ascending: false }).limit(250),
      admin.from("creator_payouts").select("id,amount_minor,currency,paypal_batch_id,status,created_at,paid_at").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(100),
      admin.from("creator_payout_accounts").select("paypal_email,updated_at").eq("user_id", creatorId).maybeSingle(),
      admin.from("creator_coin_exchanges").select("id,amount_minor,coin_amount,currency,created_at").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(100),
      admin.rpc("minglora_get_creator_money_balance", { p_creator_id: creatorId }),
      admin.rpc("minglora_get_creator_gift_balance", { p_creator_id: creatorId })
    ]);
    if (ledgerResult.error || payoutsResult.error || accountResult.error || exchangesResult.error || balanceResult.error || giftBalanceResult.error) {
      console.error("[Minglora creator wallet] Could not load the complete creator balance.", {
        ledgerError: ledgerResult.error?.message || null,
        payoutsError: payoutsResult.error?.message || null,
        accountError: accountResult.error?.message || null,
        exchangesError: exchangesResult.error?.message || null,
        balanceError: balanceResult.error?.message || null,
        giftBalanceError: giftBalanceResult.error?.message || null
      });
      return json(503, { error: "Creator money balance is temporarily unavailable." });
    }
    const ledger = ledgerResult.data || [], payouts = payoutsResult.data || [];
    const moneyBalance = balanceResult.data || {};
    return json(200, {
      ledger,
      giftBalance: giftBalanceResult.data || {},
      payouts,
      exchanges: exchangesResult.data || [],
      payoutAccount: accountResult.data || null,
      earnedMinor: Number(moneyBalance.earnedMinor || 0),
      reservedMinor: Number(moneyBalance.reservedMinor || 0),
      exchangedMinor: Number(moneyBalance.exchangedMinor || 0),
      availableMinor: Number(moneyBalance.availableMinor || 0),
      currency: "USD",
      creatorSharePercent: 50,
      coinPerCent: 1
    });
  }

  if (action === "economy_exchange_creator_earnings") {
    const creatorId = String(input.creatorId || "");
    const amountMinor = Number(input.amountMinor);
    const requestId = String(input.requestId || "");
    if (!validUuid(creatorId) || !validUuid(requestId) ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 100) {
      return json(400, { error: "Enter a valid money amount and exchange request reference." });
    }
    const { data, error } = await admin.rpc("minglora_exchange_creator_earnings_for_coins", {
      p_creator_id: creatorId,
      p_amount_minor: amountMinor,
      p_request_id: requestId
    });
    if (error) return fail(error, "Minglora could not exchange this money balance into Coins.");
    return json(200, { exchange: data });
  }

  if (action === "economy_get_payout_account") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const { data, error } = await admin.from("creator_payout_accounts").select("paypal_email,updated_at").eq("user_id", userId).maybeSingle();
    if (error) return json(503, { error: "PayPal payout account could not be loaded." });
    return json(200, { payoutAccount: data || null });
  }

  if (action === "economy_set_payout_account") {
    const userId = String(input.userId || "");
    const email = String(input.paypalEmail || "").trim().toLowerCase();
    const paypalEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!validUuid(userId) || email.length > 254 || !paypalEmailPattern.test(email)) {
      return json(400, { error: "Enter a valid PayPal email address." });
    }
    const { data, error } = await admin.from("creator_payout_accounts")
      .upsert({ user_id: userId, paypal_email: email, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("paypal_email,updated_at").single();
    if (error) return fail(error, "PayPal payout details could not be saved.");
    return json(200, { payoutAccount: data });
  }

  if (action === "economy_unlink_payout_account") {
    const userId = String(input.userId || "");
    if (!validUuid(userId)) return json(400, { error: "Invalid member account." });
    const { data, error } = await admin.from("creator_payout_accounts")
      .delete()
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) return fail(error, "PayPal payout details could not be unlinked.");
    return json(200, { ok: true, unlinked: Boolean(data), payoutAccount: null });
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

  if (action === "live_chat_delete") {
    const broadcastId = String(input.broadcastId || "");
    const hostId = String(input.hostId || "");
    const messageId = String(input.messageId || "");
    if (!validUuid(broadcastId) || !validUuid(hostId) || !validUuid(messageId)) {
      return json(400, { error: "Invalid LIVE comment removal request." });
    }
    const { data: broadcast, error: broadcastError } = await admin.from("live_broadcasts")
      .select("id,host_id,status").eq("id", broadcastId).eq("status", "live").maybeSingle();
    if (broadcastError || !broadcast) return json(404, { error: "LIVE session not found." });
    if (broadcast.host_id !== hostId) return json(403, { error: "Only the LIVE host can remove comments." });
    const { data, error } = await admin.from("live_chat_messages")
      .delete().eq("id", messageId).eq("broadcast_id", broadcastId)
      .select("id").maybeSingle();
    if (error) return json(503, { error: "LIVE comment could not be removed." });
    if (!data) return json(404, { error: "This LIVE comment no longer exists." });
    return json(200, { ok: true, messageId: data.id });
  }

  if (action === "media_upload_prepare") {
    const ownerId=String(input.ownerId||"");
    const slot=String(input.slot||"");
    const mimeType=String(input.mimeType||"").toLowerCase();
    const byteSize=Number(input.byteSize||0);
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const image={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"};
    const post={...image,"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","audio/wav":"wav","audio/x-wav":"wav","audio/flac":"flac","audio/aac":"aac","model/gltf-binary":"glb"};
    const sound={"audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","audio/wav":"wav","audio/x-wav":"wav","audio/flac":"flac","audio/aac":"aac"};
    const story={...image,"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"};
    const communityMedia={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4"};
    const message={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","application/pdf":"pdf","text/plain":"txt","text/csv":"csv","application/zip":"zip","application/x-zip-compressed":"zip","application/msword":"doc","application/vnd.ms-excel":"xls","application/vnd.ms-powerpoint":"ppt","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx","application/vnd.openxmlformats-officedocument.presentationml.presentation":"pptx"};
    const ringtone={"audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","audio/wav":"wav","audio/x-wav":"wav","audio/flac":"flac","audio/aac":"aac"};
    const allowed=slot==="avatar"||slot==="cover"?image:slot==="post"?post:slot==="sound"?sound:slot==="story"?story:slot==="group"||slot==="page"?communityMedia:slot==="message"?message:slot==="ringtone"?ringtone:{};
    const bucket=slot==="avatar"?"minglora-avatars":slot==="cover"?"minglora-covers":slot==="post"?"minglora-post-media":slot==="sound"?"minglora-sounds":slot==="story"?"minglora-stories":slot==="group"?"minglora-group-media":slot==="page"?"minglora-page-media":slot==="message"?"minglora-message-attachments":slot==="ringtone"?"minglora-ringtones":"";
    const maxBytes=slot==="avatar"?10*1024*1024:slot==="cover"?20*1024*1024:slot==="sound"?50*1024*1024:slot==="story"?200*1024*1024:slot==="group"||slot==="page"?250*1024*1024:slot==="message"?100*1024*1024:slot==="ringtone"?20*1024*1024:slot==="post"?500*1024*1024:0;
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
      "minglora-post-media":["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime","audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/flac","audio/aac","model/gltf-binary"],
      "minglora-sounds":["audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/flac","audio/aac"],
      "minglora-message-attachments":["image/jpeg","image/png","image/webp","video/mp4","video/webm","audio/mpeg","audio/mp4","audio/ogg","audio/webm","application/pdf","text/plain","text/csv","application/zip","application/x-zip-compressed","application/msword","application/vnd.ms-excel","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      "minglora-stories":["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime"],
      "minglora-group-media":["image/jpeg","image/png","image/webp","video/mp4"],
      "minglora-page-media":["image/jpeg","image/png","image/webp","video/mp4"],
      "minglora-ringtones":["audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/flac","audio/aac"],
      "minglora-sounds":["audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/flac","audio/aac"]
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
    if(!uuidPattern.test(assetId)||!["avatar","cover","post","sound","story","group","page","message","ringtone"].includes(slot)){
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
    if(slot==="avatar"||slot==="cover"){
      const profilePatch:Record<string,unknown>=slot==="avatar"
        ?{avatar_url:String(result.url||""),avatar_asset_id:assetId,updated_at:new Date().toISOString()}
        :{cover_url:String(result.url||""),cover_asset_id:assetId,updated_at:new Date().toISOString()};
      const {data:profile,error:profileError}=await admin.from("profiles")
        .update(profilePatch).eq("id",ownerId).select("id").maybeSingle();
      if(profileError||!profile){
        return json(503,{error:"Upload completed but profile media could not be synchronized. Retry completion."});
      }
    }
    return json(200,result);
  }

  if (action === "media_delete") {
    const ownerId=String(input.ownerId||"");
    const bucket=String(input.bucket||"");
    const objectPath=String(input.path||"");
    const allowedBuckets=["minglora-avatars","minglora-covers","minglora-post-media","minglora-stories","minglora-short-videos","minglora-message-attachments","minglora-group-media","minglora-page-media","minglora-live-thumbnails","minglora-data-exports","minglora-ringtones","minglora-sounds"];
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
    if(!uuidPattern.test(ownerId)||!["minglora-post-media","minglora-stories","minglora-avatars","minglora-covers","minglora-message-attachments","minglora-group-media","minglora-page-media","minglora-ringtones","minglora-sounds"].includes(bucket)||!objectPath.startsWith(ownerId+"/")||objectPath.includes("..")){
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



  if (action === "profile_verification_get") {
    const userId=String(input.userId||"");
    if(!validUuid(userId))return json(400,{error:"Invalid profile account."});
    const [profileResult,applicationResult]=await Promise.all([
      admin.from("profiles").select("verification_status,verification_badge").eq("id",userId).maybeSingle(),
      admin.from("profile_verification_applications")
        .select("id,account_category,public_display_name,official_website,evidence_links,evidence_summary,status,review_priority,review_due_at,auto_screening_status,auto_screening_score,auto_screening_flags,decision_note,submitted_at,reviewed_at,verified_at")
        .eq("user_id",userId).order("submitted_at",{ascending:false}).limit(10)
    ]);
    if(profileResult.error||applicationResult.error)return json(503,{error:"Profile verification status could not be loaded."});
    return json(200,{
      verificationStatus:profileResult.data?.verification_status||"not_submitted",
      verificationBadge:profileResult.data?.verification_badge||"none",
      applications:applicationResult.data||[]
    });
  }

  if (action === "profile_verification_submit") {
    const userId=String(input.userId||"");
    const category=String(input.accountCategory||"");
    const publicDisplayName=String(input.publicDisplayName||"").trim().slice(0,120);
    const officialWebsite=String(input.officialWebsite||"").trim();
    const evidenceSummary=String(input.evidenceSummary||"").trim().slice(0,2000);
    const links=Array.isArray(input.evidenceLinks)?input.evidenceLinks.slice(0,8).map((value:any)=>String(value||"").trim()):[];
    if(!validUuid(userId)||!["person","creator","business","public_figure","brand"].includes(category)||
       publicDisplayName.length<2||evidenceSummary.length<30||links.some((value:string)=>value.length>500)){
      return json(400,{error:"Complete the verification category, public name, explanation and evidence links."});
    }
    const safeUrl=(value:string)=>{try{const url=new URL(value);return url.protocol==="https:"&&url.hostname.includes(".")&&!url.username&&!url.password;}catch{return false;}};
    if(officialWebsite&&!safeUrl(officialWebsite))return json(400,{error:"The official website must be a valid HTTPS address."});
    if(links.some((value:string)=>!safeUrl(value)))return json(400,{error:"Every evidence link must be a valid HTTPS address."});
    const {data:authResult}=await admin.auth.admin.getUserById(userId);
    const authUser=authResult?.user;
    if(!authUser?.email_confirmed_at)return json(403,{error:"Verify the email address on your Minglora account before applying."});
    const {data:profile,error:profileError}=await admin.from("profiles")
      .select("display_name,username,verification_status,verification_badge").eq("id",userId).maybeSingle();
    if(profileError)return json(503,{error:"Your profile could not be checked."});
    if(!profile)return json(404,{error:"Minglora profile not found."});
    if(profile.verification_status==="verified"&&profile.verification_badge==="blue")return json(409,{error:"This profile already has the official blue verification badge."});
    if(publicDisplayName.toLowerCase()!==String(profile.display_name||"").trim().toLowerCase()&&
       publicDisplayName.toLowerCase()!==String(profile.username||"").trim().toLowerCase()){
      return json(409,{error:"The public name must match your current Minglora display name or username."});
    }
    const flags:any[]=[];
    if(!officialWebsite)flags.push({code:"official_website_missing",severity:"medium",message:"No official website was supplied."});
    if(!links.length)flags.push({code:"independent_evidence_missing",severity:"high",message:"No independent public evidence links were supplied."});
    if(category==="business"||category==="brand")flags.push({code:"business_registry_check_required",severity:"high",message:"Verify the legal business or brand against an official registry or authorized source."});
    const score=Math.max(0,100-flags.reduce((total:number,flag:any)=>total+(flag.severity==="high"?30:15),0));
    const priority=["creator","business","public_figure","brand"].includes(category)?"high":"normal";
    const dueAt=new Date(Date.now()+4*60*60*1000).toISOString();
    const {data:existing,error:existingError}=await admin.from("profile_verification_applications")
      .select("id,status").eq("user_id",userId).in("status",["pending","needs_information"])
      .order("submitted_at",{ascending:false}).limit(1).maybeSingle();
    if(existingError)return json(503,{error:"Existing verification applications could not be checked."});
    if(existing?.status==="pending")return json(409,{error:"A profile verification application is already awaiting review."});
    const values={
      account_category:category,public_display_name:publicDisplayName,
      official_website:officialWebsite||null,evidence_links:links,
      evidence_summary:evidenceSummary,status:"pending",review_priority:priority,review_due_at:dueAt,
      auto_screening_status:flags.length?"flagged":"clear_for_human_review",
      auto_screening_score:score,auto_screening_flags:flags,decision_note:"",
      submitted_at:new Date().toISOString(),reviewed_at:null,reviewed_by:null,verified_at:null,revoked_at:null,updated_at:new Date().toISOString()
    };
    let result;
    if(existing?.status==="needs_information"){
      result=await admin.from("profile_verification_applications").update(values).eq("id",existing.id)
        .select("id,user_id,account_category,public_display_name,status,review_priority,review_due_at,auto_screening_status,auto_screening_score,auto_screening_flags,submitted_at").single();
      if(result.error)return fail(result.error,"Updated verification application could not be saved.");
      const {data:staff}=await admin.from("minglora_platform_staff")
        .select("user_id").eq("active",true).in("role",["owner","admin","moderator","reviewer"]);
      if((staff||[]).length){
        const alertRows=(staff||[]).map((row:any)=>({
          recipient_id:row.user_id,application_id:result.data.id,event_type:"application_submitted",
          priority,due_at:dueAt,title:"Updated profile verification application",
          body:publicDisplayName+" resubmitted profile verification evidence."
        }));
        await admin.from("profile_verification_review_alerts").insert(alertRows);
        await admin.from("notifications").insert((staff||[]).map((row:any)=>({
          recipient_id:row.user_id,actor_id:userId,kind:"profile_verification_review",
          entity_type:"profile_verification",entity_id:result.data.id,
          payload:{title:"Updated profile verification application",body:publicDisplayName+" resubmitted verification evidence.",priority,dueAt}
        })));
      }
      await admin.from("profile_verification_review_events").insert({
        application_id:result.data.id,actor_id:userId,event_type:"resubmitted",
        details:"Applicant supplied additional information and resubmitted the application.",
        event_metadata:{category}
      });
    }else{
      result=await admin.from("profile_verification_applications").insert({...values,user_id:userId})
        .select("id,user_id,account_category,public_display_name,status,review_priority,review_due_at,auto_screening_status,auto_screening_score,auto_screening_flags,submitted_at").single();
      if(result.error)return fail(result.error,"Profile verification application could not be submitted.");
    }
    const {error:statusError}=await admin.from("profiles").update({verification_status:"pending"}).eq("id",userId);
    if(statusError)return fail(statusError,"Application was saved but the profile verification status could not be updated.");
    await admin.from("profile_verification_review_events").insert({
      application_id:result.data.id,actor_id:userId,event_type:"automated_screening",
      details:"Automated screening completed. A human reviewer must inspect the supporting evidence.",
      event_metadata:{score,flags}
    });
    return json(201,{application:{
      id:result.data.id,status:result.data.status,accountCategory:result.data.account_category,
      reviewPriority:result.data.review_priority,reviewDueAt:result.data.review_due_at,
      autoScreeningStatus:result.data.auto_screening_status,autoScreeningScore:result.data.auto_screening_score,
      autoScreeningFlags:result.data.auto_screening_flags||[],submittedAt:result.data.submitted_at
    },notice:"Application submitted. Automated checks only organize the review; they do not grant verification."});
  }

  if (action === "profile_verification_admin_members") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const search = String(input.search || "").trim().slice(0, 80).toLowerCase();
    if (!validUuid(adminUserId) ||
        adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com") {
      return json(403, { error: "Only the Creator Hub administrator can search verification and badge accounts." });
    }

    const [ownerResult, staffResult, profilesResult, usersResult] = await Promise.all([
      admin.from("profiles")
        .select("verification_status,verification_badge")
        .eq("id", adminUserId)
        .maybeSingle(),
      admin.from("minglora_platform_staff")
        .select("user_id")
        .eq("user_id", adminUserId)
        .eq("role", "owner")
        .eq("active", true)
        .contains("permissions", ["platform:admin", "verification:review"])
        .limit(1)
        .maybeSingle(),
      admin.from("profiles")
        .select("id,username,display_name,avatar_url,created_at,verification_status,verification_badge")
        .order("created_at", { ascending: false })
        .limit(200),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);
    if (ownerResult.error || staffResult.error || profilesResult.error || usersResult.error) {
      return json(503, { error: "Minglora administrator or member verification records could not be loaded." });
    }
    if (ownerResult.data?.verification_status !== "verified" ||
        ownerResult.data?.verification_badge !== "blue" ||
        !staffResult.data?.user_id) {
      return json(403, { error: "The verified Creator Hub owner permission is not active." });
    }

    const authUsers = usersResult.data?.users || [];
    const emailById = new Map(authUsers.map((authUser: any) => [
      String(authUser.id), String(authUser.email || "").trim().toLowerCase()
    ]));
    const members = (profilesResult.data || []).map((profile: any) => ({
      id: profile.id,
      username: profile.username || "",
      displayName: profile.display_name || "",
      email: emailById.get(String(profile.id)) || "",
      avatarUrl: profile.avatar_url || "",
      joinedAt: profile.created_at || null,
      verificationStatus: profile.verification_status || "not_submitted",
      verificationBadge: profile.verification_badge || "none"
    })).filter((member: any) => !search ||
      String(member.username).toLowerCase().includes(search) ||
      String(member.displayName).toLowerCase().includes(search) ||
      String(member.email).toLowerCase().includes(search) ||
      String(member.id).toLowerCase() === search
    ).slice(0, 100);

    return json(200, { members });
  }

  if (action === "profile_verification_admin_set") {
    const adminUserId = String(input.adminUserId || "");
    const adminEmail = String(input.adminEmail || "").trim().toLowerCase();
    const targetUserId = String(input.targetUserId || "");
    const verificationStatus = String(input.verificationStatus || "");
    const note = String(input.note || "").trim().slice(0, 1000);
    const allowedStatuses = ["not_submitted", "pending", "needs_information", "verified", "rejected", "suspended"];
    if (!validUuid(adminUserId) || adminUserId !== "5b998c21-86b5-4621-ab37-e0808a2657b1" ||
        adminEmail !== "creatorhubcreatornetwork@gmail.com" || !validUuid(targetUserId) ||
        !allowedStatuses.includes(verificationStatus) || note.length < 5) {
      return json(400, { error: "Choose a valid member, profile verification status and a review note of at least five characters." });
    }
    if (targetUserId === adminUserId && verificationStatus !== "verified") {
      return json(400, { error: "The designated administrator's own verified profile cannot be revoked from this workspace." });
    }

    const [ownerResult, staffResult, targetProfileResult, targetAuthResult] = await Promise.all([
      admin.from("profiles")
        .select("verification_status,verification_badge")
        .eq("id", adminUserId)
        .maybeSingle(),
      admin.from("minglora_platform_staff")
        .select("user_id")
        .eq("user_id", adminUserId)
        .eq("role", "owner")
        .eq("active", true)
        .contains("permissions", ["platform:admin", "verification:review"])
        .limit(1)
        .maybeSingle(),
      admin.from("profiles")
        .select("id,username,display_name,verification_status,verification_badge")
        .eq("id", targetUserId)
        .maybeSingle(),
      admin.auth.admin.getUserById(targetUserId)
    ]);
    if (ownerResult.error || staffResult.error || targetProfileResult.error || targetAuthResult.error) {
      return json(503, { error: "Minglora administrator or member profile verification could not be checked." });
    }
    if (ownerResult.data?.verification_status !== "verified" ||
        ownerResult.data?.verification_badge !== "blue" ||
        !staffResult.data?.user_id) {
      return json(403, { error: "The verified Creator Hub owner permission is not active." });
    }
    const profile = targetProfileResult.data;
    const targetUser = targetAuthResult.data?.user;
    if (!profile || !targetUser) return json(404, { error: "Minglora member account was not found." });

    const badge = verificationStatus === "verified" ? "blue" : "none";
    const stamp = new Date().toISOString();
    const previousStatus = String(profile.verification_status || "not_submitted");
    const previousBadge = profile.verification_badge === "blue" ? "blue" : "none";
    const previousAppMetadata = targetUser.app_metadata || {};
    const nextAppMetadata = {
      ...previousAppMetadata,
      verification_status: verificationStatus,
      verification_badge: badge
    };
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetUserId, {
      app_metadata: nextAppMetadata
    });
    if (authUpdateError) return fail(authUpdateError, "Profile verification metadata could not be updated.");

    const { data: updatedProfile, error: profileUpdateError } = await admin.from("profiles")
      .update({ verification_status: verificationStatus, verification_badge: badge, updated_at: stamp })
      .eq("id", targetUserId)
      .select("id,username,display_name,verification_status,verification_badge")
      .single();
    if (profileUpdateError) {
      await admin.auth.admin.updateUserById(targetUserId, { app_metadata: previousAppMetadata });
      return fail(profileUpdateError, "Profile verification status could not be saved.");
    }

    const { data: audit, error: auditError } = await admin.from("minglora_profile_verification_admin_audit")
      .insert({
        actor_user_id: adminUserId,
        target_user_id: targetUserId,
        previous_status: previousStatus,
        new_status: verificationStatus,
        previous_badge: previousBadge,
        new_badge: badge,
        note
      })
      .select("id,created_at")
      .single();
    if (auditError) {
      await admin.from("profiles").update({
        verification_status: previousStatus,
        verification_badge: previousBadge
      }).eq("id", targetUserId);
      await admin.auth.admin.updateUserById(targetUserId, { app_metadata: previousAppMetadata });
      return fail(auditError, "Profile verification update was rolled back because its audit record could not be written.");
    }

    await admin.from("audit_log").insert({
      actor_id: adminUserId,
      action: "profile_verification_admin_set",
      target_type: "profile",
      target_id: targetUserId,
      metadata: { previousStatus, verificationStatus, previousBadge, badge, note, auditId: audit.id }
    });

    return json(200, {
      ok: true,
      member: {
        id: updatedProfile.id,
        username: updatedProfile.username,
        displayName: updatedProfile.display_name || "",
        email: String(targetUser.email || "").trim().toLowerCase(),
        verificationStatus: updatedProfile.verification_status,
        verificationBadge: updatedProfile.verification_badge
      },
      audit: { id: audit.id, createdAt: audit.created_at }
    });
  }

  if (action === "profile_verification_admin_queue") {
    const reviewerId=String(input.reviewerId||"");
    if(!validUuid(reviewerId))return json(400,{error:"A valid reviewer account is required."});
    const [applicationsResult,alertsResult]=await Promise.all([
      admin.from("profile_verification_applications")
        .select("id,user_id,account_category,public_display_name,official_website,evidence_links,evidence_summary,status,review_priority,review_due_at,auto_screening_status,auto_screening_score,auto_screening_flags,submitted_at")
        .in("status",["pending","needs_information"]).order("review_due_at",{ascending:true}).limit(200),
      admin.from("profile_verification_review_alerts")
        .select("id,application_id,event_type,priority,due_at,title,body,created_at")
        .eq("recipient_id",reviewerId).is("read_at",null).order("created_at",{ascending:false}).limit(50)
    ]);
    if(applicationsResult.error||alertsResult.error)return json(503,{error:"Profile verification review queue is unavailable."});
    const userIds=[...new Set((applicationsResult.data||[]).map((row:any)=>row.user_id))];
    const {data:profiles,error:profilesError}=userIds.length?await admin.from("profiles")
      .select("id,username,display_name,avatar_url,verification_status,verification_badge").in("id",userIds):{data:[],error:null};
    if(profilesError)return json(503,{error:"Applicant profiles could not be loaded."});
    const profileMap=new Map((profiles||[]).map((row:any)=>[row.id,row]));
    return json(200,{
      applications:(applicationsResult.data||[]).map((row:any)=>{
        const profile:any=profileMap.get(row.user_id)||{};
        return {...row,profile:{username:profile.username||"",displayName:profile.display_name||row.public_display_name,
          avatarUrl:profile.avatar_url||"",verificationStatus:profile.verification_status||"not_submitted",
          verificationBadge:profile.verification_badge||"none"},canReview:row.user_id!==reviewerId};
      }),
      alerts:alertsResult.data||[]
    });
  }

  if (action === "profile_verification_admin_review") {
    const actorId=String(input.actorId||""),applicationId=String(input.applicationId||"");
    const decision=String(input.decision||""),note=String(input.note||"").trim().slice(0,1500);
    if(!validUuid(actorId)||!validUuid(applicationId)||!["verified","needs_information","rejected","revoked"].includes(decision)||note.length<5){
      return json(400,{error:"Choose a valid verification decision and write a review note."});
    }
    const {data:application,error:applicationError}=await admin.from("profile_verification_applications")
      .select("id,user_id,public_display_name,account_category,status,evidence_links,evidence_summary")
      .eq("id",applicationId).maybeSingle();
    if(applicationError)return json(503,{error:"Verification application could not be loaded."});
    if(!application)return json(404,{error:"Verification application not found."});
    if(application.user_id===actorId)return json(403,{error:"Applicants cannot review their own profile verification application."});
    if(!["pending","needs_information","verified"].includes(application.status)||
       (decision==="revoked"&&application.status!=="verified")){
      return json(409,{error:"This application is not in a state that accepts this decision."});
    }
    if(decision==="verified"&&(!Array.isArray(application.evidence_links)||application.evidence_links.length===0)){
      return json(409,{error:"At least one independent public evidence link must be present before verification."});
    }
    const stamp=new Date().toISOString();
    const profileStatus=decision==="verified"?"verified":decision==="needs_information"?"needs_information":decision==="revoked"?"suspended":"rejected";
    const {data:updated,error:updateError}=await admin.from("profile_verification_applications").update({
      status:decision,decision_note:note,reviewed_at:stamp,reviewed_by:actorId,
      verified_at:decision==="verified"?stamp:null,revoked_at:decision==="revoked"?stamp:null,updated_at:stamp
    }).eq("id",applicationId)
      .select("id,user_id,status,decision_note,reviewed_at,verified_at").single();
    if(updateError)return fail(updateError,"Verification decision could not be saved.");
    const badge=decision==="verified"?"blue":"none";
    const {error:profileUpdateError}=await admin.from("profiles").update({
      verification_status:profileStatus,verification_badge:badge
    }).eq("id",application.user_id);
    if(profileUpdateError)return fail(profileUpdateError,"Decision saved but profile badge could not be synchronized.");
    const {data:authResult}=await admin.auth.admin.getUserById(application.user_id);
    if(authResult?.user){
      const nextMetadata={...(authResult.user.app_metadata||{}),verification_status:profileStatus,verification_badge:badge};
      const {error:metadataError}=await admin.auth.admin.updateUserById(application.user_id,{app_metadata:nextMetadata});
      if(metadataError)return fail(metadataError,"Profile badge was synchronized but authentication metadata could not be refreshed.");
    }
    const eventType=decision==="verified"?"verified":decision==="revoked"?"revoked":decision;
    await admin.from("profile_verification_review_events").insert({
      application_id:applicationId,actor_id:actorId,event_type:eventType,details:note,
      event_metadata:{decision,accountCategory:application.account_category,badge}
    });
    await admin.from("audit_log").insert({
      actor_id:actorId,action:"profile_verification_reviewed",target_type:"profile",
      target_id:application.user_id,metadata:{applicationId,decision,note,badge}
    });
    await admin.from("notifications").insert({
      recipient_id:application.user_id,actor_id:actorId,kind:"profile_verification_status",
      entity_type:"profile_verification",entity_id:applicationId,
      payload:{title:"Minglora profile verification update",status:decision,note,badge}
    });
    return json(200,{application:{id:updated.id,userId:updated.user_id,status:updated.status,
      decisionNote:updated.decision_note,reviewedAt:updated.reviewed_at,verificationStatus:profileStatus,
      verificationBadge:badge}});
  }

  if (action === "profile_verification_alert_mark_read") {
    const reviewerId=String(input.reviewerId||""),alertId=String(input.alertId||"");
    if(!validUuid(reviewerId)||!validUuid(alertId))return json(400,{error:"A valid reviewer alert is required."});
    const {data,error}=await admin.from("profile_verification_review_alerts").update({read_at:new Date().toISOString()})
      .eq("id",alertId).eq("recipient_id",reviewerId).is("read_at",null)
      .select("id,application_id,read_at").maybeSingle();
    if(error)return json(503,{error:"Verification review alert could not be marked as read."});
    return json(200,{ok:true,alert:data||null});
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
      "minglora-ringtones", "minglora-short-videos",
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
