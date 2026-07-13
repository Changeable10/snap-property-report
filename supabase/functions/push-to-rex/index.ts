// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
import { requirePlan } from "../_shared/plan.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REX_BASE = "https://api.rexsoftware.com/v1/rex";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function rexCall(service: string, method: string, token: string, args: Record<string, unknown>) {
  const resp = await fetch(`${REX_BASE}/${service}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await resp.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  return { status: resp.status, ok: resp.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;
  const userId = auth.userId;
  // Agency-only integration.
  const gate = await requirePlan(userId, ["agency"], corsHeaders);
  if (gate) return gate;

  try {
    const payload = await req.json().catch(() => ({}));
    const {
      address,
      title,
      description,
      features,
      listing_type,
      bedrooms,
      bathrooms,
      asking_price,
      photo_urls,
    } = payload ?? {};

    if (!address || !title || !description) {
      return json(400, { error: "Missing listing data" });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!service) return json(500, { error: "Server not configured" });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    // SSRF protection: only fetch photos from our own Supabase storage host over https.
    let allowedHost: string;
    try {
      allowedHost = new URL(url).host;
    } catch {
      return json(500, { error: "Server not configured" });
    }
    const isAllowedPhotoUrl = (u: unknown): u is string => {
      if (typeof u !== "string") return false;
      let parsed: URL;
      try { parsed = new URL(u); } catch { return false; }
      if (parsed.protocol !== "https:") return false;
      if (parsed.host !== allowedHost) return false;
      // Restrict to the storage API path.
      if (!parsed.pathname.startsWith("/storage/v1/")) return false;
      return true;
    };

    // Resolve user's team.
    const { data: member } = await admin
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!member?.team_id) return json(403, { error: "No team found for this user" });

    const { data: branding } = await admin
      .from("team_branding")
      .select("rex_api_token, rex_connected")
      .eq("team_id", member.team_id)
      .maybeSingle();
    if (!branding?.rex_connected || !branding?.rex_api_token) {
      return json(400, { error: "Rex is not connected. Reconnect it from Team settings." });
    }
    const token = branding.rex_api_token as string;

    // Build address payload. Address expected to be a string; split into name/suburb heuristically.
    const addrParts = String(address).split(",").map((s) => s.trim()).filter(Boolean);
    const streetName = addrParts[0] ?? String(address);
    const suburb = addrParts[1] ?? "";
    const state = addrParts[2] ?? "";

    // 1. Create property.
    let propertyRes = await rexCall("Properties", "create", token, {
      data: {
        adr_street_name: streetName,
        adr_suburb_or_town: suburb,
        adr_state_or_region: state,
        attr_bedrooms: bedrooms,
        attr_bathrooms: bathrooms,
      },
    });
    if (propertyRes.status === 401) {
      return json(401, { error: "Rex session expired. Please reconnect from Team settings." });
    }
    if (!propertyRes.ok || propertyRes.data?.error) {
      return json(502, { error: propertyRes.data?.error?.message ?? "Failed to create property in Rex" });
    }
    const propertyId = propertyRes.data?.result?.id ?? propertyRes.data?.result;

    // 2. Create listing.
    const listingRes = await rexCall("Listings", "create", token, {
      data: {
        property_id: propertyId,
        listing_category_id: listing_type === "rental" ? 2 : 1,
        headline: title,
        description,
        price_advertise_as: asking_price ?? null,
        features: features ?? "",
      },
    });
    if (!listingRes.ok || listingRes.data?.error) {
      return json(502, { error: listingRes.data?.error?.message ?? "Failed to create listing in Rex" });
    }
    const listingId = listingRes.data?.result?.id ?? listingRes.data?.result;

    // 3. Upload photos (best-effort).
    let uploaded = 0;
    if (Array.isArray(photo_urls)) {
      for (const photoUrl of photo_urls) {
        if (!isAllowedPhotoUrl(photoUrl)) continue;
        try {
          const imgResp = await fetch(photoUrl, { redirect: "error" });
          if (!imgResp.ok) continue;
          const buf = new Uint8Array(await imgResp.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const b64 = btoa(bin);
          const up = await rexCall("PropertyImages", "create", token, {
            data: {
              property_id: propertyId,
              listing_id: listingId,
              image: { file_data: b64, filename: `photo-${uploaded + 1}.jpg` },
            },
          });
          if (up.ok && !up.data?.error) uploaded++;
        } catch { /* skip photo */ }
      }
    }

    return json(200, {
      ok: true,
      property_id: propertyId,
      listing_id: listingId,
      photos_uploaded: uploaded,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? "Unknown error" });
  }
});