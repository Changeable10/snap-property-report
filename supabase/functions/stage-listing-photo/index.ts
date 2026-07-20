// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { requirePlan, requireMonthlyLimit, getUserPlan } from "../_shared/plan.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map UI style keys → Decor8 design_style values.
// Valid Decor8 styles include: minimalist, scandinavian, industrial, boho, traditional,
// artdeco, midcenturymodern, coastal, tropical, eclectic, contemporary, frenchcountry,
// rustic, modern, farmhouse, japandi, warmminimalist, organicmodern, ... (see api-docs.decor8.ai).
const STYLE_MAP: Record<string, string> = {
  modern: "modern",
  scandinavian: "scandinavian",
  minimalist: "minimalist",
  industrial: "industrial",
  farmhouse: "farmhouse",
  coastal: "coastal",
  traditional: "traditional",
  contemporary: "contemporary",
};

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function isActiveTeamMember(admin: any, teamId: string | null | undefined, userId: string) {
  if (!teamId) return false;
  const { data, error } = await admin
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) console.error("[stage-listing-photo] team member access check failed", error);
  return !!data;
}

async function sharesTeamWithListingOwner(admin: any, listingOwnerId: string, userId: string) {
  const { data: ownerTeams, error: ownerErr } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", listingOwnerId)
    .eq("status", "active");
  if (ownerErr) {
    console.error("[stage-listing-photo] owner team lookup failed", ownerErr);
    return false;
  }
  const teamIds = (ownerTeams ?? []).map((row: any) => row.team_id).filter(Boolean);
  if (teamIds.length === 0) {
    const { data: ownedTeams, error: ownedErr } = await admin
      .from("teams")
      .select("id")
      .eq("owner_id", listingOwnerId);
    if (ownedErr) {
      console.error("[stage-listing-photo] owned team lookup failed", ownedErr);
      return false;
    }
    teamIds.push(...(ownedTeams ?? []).map((row: any) => row.id).filter(Boolean));
  }
  if (teamIds.length === 0) return false;
  const { data: callerMembership, error: callerErr } = await admin
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("team_id", teamIds)
    .maybeSingle();
  if (callerErr) console.error("[stage-listing-photo] caller team lookup failed", callerErr);
  return !!callerMembership;
}

async function persistStagedPhoto(params: {
  userId: string;
  listingId: string;
  photoId: string;
  photoPath: string;
  stagedUrl: string;
  style: string;
}) {
  const admin = adminClient();
  if (!admin) {
    console.warn("[stage-listing-photo] service role unavailable; returning provider URL only");
    return { stagedPath: null };
  }

  console.log("[stage-listing-photo] persist start", {
    listingId: params.listingId,
    photoId: params.photoId,
  });

  const { data: photo, error: photoErr } = await admin
    .from("listing_photos")
    .select("id,listing_id,photo_url,user_id,team_id,listings!inner(id,user_id,team_id)")
    .eq("id", params.photoId)
    .eq("listing_id", params.listingId)
    .maybeSingle();
  if (photoErr || !photo) {
    console.error("[stage-listing-photo] Failed to load photo for staging update", {
      table: "listing_photos",
      operation: "select",
      error: photoErr,
    });
    return { error: "Failed to update photo", status: 404 };
  }

  const listing = Array.isArray(photo.listings) ? photo.listings[0] : photo.listings;
  const hasAccess =
    photo.user_id === params.userId ||
    listing?.user_id === params.userId ||
    await isActiveTeamMember(admin, photo.team_id, params.userId) ||
    await isActiveTeamMember(admin, listing?.team_id, params.userId) ||
    await sharesTeamWithListingOwner(admin, listing?.user_id, params.userId);

  if (!hasAccess) {
    console.error("[stage-listing-photo] Failed to update photo", {
      table: "listing_photos",
      operation: "authorize_update",
      listingId: params.listingId,
      photoId: params.photoId,
    });
    return { error: "Failed to update photo", status: 403 };
  }

  const stagedFetch = await fetch(params.stagedUrl);
  if (!stagedFetch.ok) {
    console.error("[stage-listing-photo] Failed to fetch staged image for storage", {
      status: stagedFetch.status,
    });
    return { error: "Failed to save staged image", status: 502 };
  }
  const blob = await stagedFetch.blob();
  // Storage RLS on `inspection-photos` requires the first path segment to be
  // the caller's user id. Nest staged files under `{userId}/staging/...` so
  // the client can createSignedUrl / read them back.
  const stagedPath = `${params.userId}/staging/${params.listingId}/${params.photoId}-staged.jpg`;
  const { error: uploadErr } = await admin.storage
    .from("inspection-photos")
    .upload(stagedPath, blob, {
      contentType: stagedFetch.headers.get("content-type") ?? "image/jpeg",
      upsert: true,
    });
  if (uploadErr) {
    console.error("[stage-listing-photo] Failed to save staged image", {
      table: "storage.objects",
      operation: "upload",
      error: uploadErr,
    });
    return { error: "Failed to save staged image", status: 500 };
  }

  const { error: photoUpdateErr } = await admin
    .from("listing_photos")
    .update({ staged_url: stagedPath, staging_style: params.style, photo_state: "staged" })
    .eq("id", params.photoId);
  if (photoUpdateErr) {
    console.error("[stage-listing-photo] Failed to update photo", {
      table: "listing_photos",
      operation: "update",
      error: photoUpdateErr,
    });
    return { error: "Failed to update photo", status: 500 };
  }

  const { error: usageErr } = await admin.from("staging_usage").insert({
    user_id: params.userId,
    listing_photo_id: params.photoId,
    style: params.style,
  });
  if (usageErr) {
    console.error("[stage-listing-photo] Failed to save staging usage", {
      table: "staging_usage",
      operation: "insert",
      error: usageErr,
    });
    return { error: "Failed to save staging usage", status: 500 };
  }

  console.log("[stage-listing-photo] persist success", {
    listingId: params.listingId,
    photoId: params.photoId,
    stagedPath,
  });
  return { stagedPath };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  console.log("[stage-listing-photo] request start", { method: req.method });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) {
    console.warn("[stage-listing-photo] unauthorized");
    return auth;
  }
  console.log("[stage-listing-photo] user", auth.userId);
  const plan = await getUserPlan(auth.userId);
  console.log("[stage-listing-photo] plan", plan);
  const gate = await requirePlan(auth.userId, ["professional", "portfolio", "agency"], corsHeaders);
  if (gate) {
    console.warn("[stage-listing-photo] plan gate blocked", { plan });
    return gate;
  }
  const stagingLimits: Record<string, number> = {
    free: 0,
    professional: 5,
    portfolio: 15,
    agency: 50,
  };
  const overLimit = await requireMonthlyLimit(auth.userId, "staging_usage", stagingLimits[plan] ?? 0, corsHeaders);
  if (overLimit) {
    console.warn("[stage-listing-photo] monthly limit reached", { plan });
    return overLimit;
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("DECOR8_API_KEY");
    if (!apiKey) {
      console.error("[stage-listing-photo] DECOR8_API_KEY missing");
      return json({ error: "Virtual staging API key not configured" }, 503);
    }

    let payload: {
      image_url?: string;
      photoUrl?: string;
      style?: string;
      room_type?: string;
      listing_id?: string;
      listingId?: string;
      photo_id?: string;
      photoId?: string;
      photo_path?: string;
      photoPath?: string;
    };
    try {
      payload = await req.json();
    } catch (e) {
      console.error("[stage-listing-photo] invalid JSON body", e);
      return json({ error: "Invalid JSON body" }, 400);
    }
    const image_url = payload.image_url ?? payload.photoUrl;
    const { style, room_type } = payload;
    const listingId = payload.listing_id ?? payload.listingId;
    const photoId = payload.photo_id ?? payload.photoId;
    const photoPath = payload.photo_path ?? payload.photoPath;
    console.log("[stage-listing-photo] payload", {
      hasImageUrl: !!image_url,
      style,
      room_type,
      hasListingId: !!listingId,
      hasPhotoId: !!photoId,
    });
    if (!image_url || !style) {
      return json({ error: "image_url and style are required" }, 400);
    }
    const designStyle = STYLE_MAP[String(style).toLowerCase()] ?? String(style).toLowerCase();
    const rt = String(room_type ?? "livingroom").toLowerCase();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    console.log("[stage-listing-photo] calling Decor8", { designStyle, rt });
    const resp = await fetch("https://api.decor8.ai/generate_designs_for_room", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_image_url: image_url,
        room_type: rt,
        design_style: designStyle,
        num_images: 1,
        num_captions: 0,
      }),
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[stage-listing-photo] Decor8 non-2xx", { status: resp.status, text: text.slice(0, 400) });
      const status = resp.status === 429 ? 429 : 502;
      return json({ error: `Staging provider error (${resp.status}): ${text.slice(0, 400)}` }, status);
    }
    const data: any = await resp.json();
    console.log("[stage-listing-photo] Decor8 raw response:", JSON.stringify(data).slice(0, 2000));
    const images: any[] =
      data?.info?.images ?? data?.images ?? data?.output?.images ?? [];
    const stagedUrl: string | undefined =
      images[0]?.url ?? images[0]?.image_url ?? data?.image_url;
    if (!stagedUrl) {
      console.error("[stage-listing-photo] staging response missing URL", data);
      const providerMsg = data?.error || data?.message || "Staging response missing image URL";
      return json({ error: `Staging provider: ${providerMsg}` }, 502);
    }
    if (listingId && photoId && photoPath) {
      const persisted = await persistStagedPhoto({
        userId: auth.userId,
        listingId,
        photoId,
        photoPath,
        stagedUrl,
        style: designStyle,
      });
      if (persisted.error) return json({ error: persisted.error }, persisted.status ?? 500);
      if (persisted.stagedPath) {
        console.log("[stage-listing-photo] success", { ms: Date.now() - t0, stagedUrl, stagedPath: persisted.stagedPath });
        return json({ staged_url: stagedUrl, staged_path: persisted.stagedPath, style: designStyle });
      }
    }

    console.log("[stage-listing-photo] success", { ms: Date.now() - t0, stagedUrl });
    return json({ staged_url: stagedUrl, style: designStyle });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    const status = err?.name === "AbortError" ? 504 : 500;
    console.error("[stage-listing-photo] handler error", { msg, status });
    return json({ error: msg }, status);
  }
});
