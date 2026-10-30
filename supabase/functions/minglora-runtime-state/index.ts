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
  if (!["load", "save", "health", "media_upload"].includes(String(action))) {
    return json(400, { error: "Unsupported action." });
  }

  if (action === "media_upload") {
    const ownerId = String(input.ownerId || "");
    const slot = String(input.slot || "");
    const mimeType = String(input.mimeType || "").toLowerCase();
    const base64 = String(input.base64 || "");
    const isAvatar = slot === "avatar";
    const isCover = slot === "cover";
    const bucket = isAvatar ? "minglora-avatars" : isCover ? "minglora-covers" : "";
    const maxBytes = 8 * 1024 * 1024;
    const extensionByMime: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif"
    };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId) ||
        !bucket || !extensionByMime[mimeType] ||
        !base64 || base64.length > Math.ceil(maxBytes * 4 / 3) + 8 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return json(400, { error: "Choose a supported profile image or cover photo." });
    }
    let binary: string;
    try {
      binary = atob(base64);
    } catch {
      return json(400, { error: "The selected image could not be decoded." });
    }
    if (!binary.length || binary.length > maxBytes) {
      return json(413, { error: "Images must be 8 MB or smaller." });
    }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const hasPrefix = (prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    const signatureValid =
      (mimeType === "image/jpeg" && hasPrefix([0xff, 0xd8, 0xff])) ||
      (mimeType === "image/png" && hasPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      (mimeType === "image/webp" && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") ||
      (mimeType === "image/avif" && ascii(4, 8) === "ftyp" && ["avif", "avis", "mif1"].includes(ascii(8, 12)));
    if (!signatureValid) return json(415, { error: "The image contents do not match the selected file type." });

    const objectPath = `${ownerId}/${crypto.randomUUID()}.${extensionByMime[mimeType]}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(objectPath, bytes, {
      contentType: mimeType,
      cacheControl: "31536000",
      upsert: false
    });
    if (uploadError) return json(502, { error: "Minglora could not store the selected image." });
    const { data: publicData } = admin.storage.from(bucket).getPublicUrl(objectPath);
    return json(201, { url: publicData.publicUrl, path: objectPath, bucket, byteSize: bytes.byteLength });
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
