import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKeys.default || "";
const admin = SUPABASE_URL && adminKey
  ? createClient(SUPABASE_URL, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  : null;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!admin) return json(503, { error: "The AI worker gateway is not configured." });

  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,160})$/);
  if (!match) return json(401, { error: "Worker authentication failed." });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 100_000) return json(413, { error: "Worker request is too large." });

  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 100_000) {
      return json(413, { error: "Worker request is too large." });
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return json(400, { error: "Worker request must be a JSON object." });
    input = parsed;
  } catch {
    return json(400, { error: "Invalid JSON request." });
  }

  const action = String(input.action || "");
  const supported = ["claim_next_task", "heartbeat_task", "complete_task", "fail_task"];
  if (!supported.includes(action)) return json(400, { error: "Unsupported worker command." });

  const payload = isObject(input.payload) ? input.payload : {};
  if (JSON.stringify(payload).length > 80_000) return json(413, { error: "Worker payload is too large." });

  try {
    const tokenHash = await sha256(match[1]);
    const { data, error } = await admin.rpc("minglora_ai_worker_command", {
      p_action: action,
      p_token_sha256: tokenHash,
      p_payload: payload
    });
    if (error) {
      const code = String(error.code || "");
      const status = code === "42501" ? 401
        : code === "P0002" ? 404
          : code === "54000" ? 429
            : code === "57014" ? 408
              : 400;
      return json(status, { error: String(error.message || "AI worker command failed.").slice(0, 240) });
    }
    return json(200, { result: data });
  } catch {
    return json(503, { error: "The AI worker command could not be completed." });
  }
});
