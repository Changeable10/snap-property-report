// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REX_LOGIN_URL = "https://api.rexsoftware.com/v1/rex/Authentication/login";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;
  const userId = auth.userId;

  try {
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) {
      return json(400, { error: "Email and password are required" });
    }

    // 1. Authenticate with Rex.
    let rexData: any;
    try {
      const rexResp = await fetch(REX_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const text = await rexResp.text();
      rexData = text ? JSON.parse(text) : {};
      if (!rexResp.ok || rexData?.error) {
        return json(401, {
          error: rexData?.error?.message ?? "Could not connect to Rex. Check your email and password.",
        });
      }
    } catch (_e) {
      return json(502, { error: "Could not reach Rex. Try again." });
    }
    const token: string | undefined = rexData?.result ?? rexData?.token ?? rexData?.session_token;
    if (!token || typeof token !== "string") {
      return json(502, { error: "Rex did not return an API token." });
    }

    // 2. Look up the caller's team + role using service role.
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!service) return json(500, { error: "Server not configured" });
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: member } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!member?.team_id) return json(403, { error: "No team found for this user" });
    if (!["owner", "admin"].includes(String(member.role))) {
      return json(403, { error: "Only owners or admins can connect Rex" });
    }

    // 3. Upsert onto team_branding. Preserve existing branding fields.
    const { data: existing } = await admin
      .from("team_branding")
      .select("id, company_name, brand_colour")
      .eq("team_id", member.team_id)
      .maybeSingle();

    const { error: upsertErr } = await admin.from("team_branding").upsert(
      {
        team_id: member.team_id,
        company_name: existing?.company_name ?? "",
        brand_colour: existing?.brand_colour ?? "#0055E0",
        rex_api_token: token,
        rex_connected: true,
        rex_account_email: email,
      },
      { onConflict: "team_id" },
    );
    if (upsertErr) return json(500, { error: upsertErr.message });

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? "Unknown error" });
  }
});