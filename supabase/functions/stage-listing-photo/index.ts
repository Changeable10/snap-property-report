// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { requirePlan, requireMonthlyLimit, getUserPlan } from "../_shared/plan.ts";
import { STAGING_PROMPTS, STAGING_CREATIVITY } from "../_shared/decor8-staging-prompts.ts";
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
  reqId?: string;
  timings?: Record<string, number>;
}) {
  const reqId = params.reqId ?? "?";
  const timings = params.timings ?? {};
  const admin = adminClient();
  if (!admin) {
    console.warn("[stage-listing-photo] service role unavailable; returning provider URL only");
    return { stagedPath: null };
  }

  console.log("[stage-listing-photo] persist start", {
    reqId,
    listingId: params.listingId,
    photoId: params.photoId,
  });

  console.time(`[stage-listing-photo:${reqId}] persist-authz-load`);
  const tAuthz0 = Date.now();
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
  timings.persist_authz_load_ms = Date.now() - tAuthz0;
  console.timeEnd(`[stage-listing-photo:${reqId}] persist-authz-load`);

  console.time(`[stage-listing-photo:${reqId}] persist-download-from-decor8`);
  const tDownload0 = Date.now();
  const stagedFetch = await fetch(params.stagedUrl);
  if (!stagedFetch.ok) {
    console.error("[stage-listing-photo] Failed to fetch staged image for storage", {
      status: stagedFetch.status,
    });
    return { error: "Failed to save staged image", status: 502 };
  }
  const blob = await stagedFetch.blob();
  timings.persist_download_from_decor8_ms = Date.now() - tDownload0;
  console.timeEnd(`[stage-listing-photo:${reqId}] persist-download-from-decor8`);
  console.log("[stage-listing-photo] downloaded staged image", { reqId, bytes: blob.size });

  // Storage RLS on `inspection-photos` requires the first path segment to be
  // the caller's user id. Nest staged files under `{userId}/staging/...` so
  // the client can createSignedUrl / read them back.
  const stagedPath = `${params.userId}/staging/${params.listingId}/${params.photoId}-staged.jpg`;
  console.time(`[stage-listing-photo:${reqId}] persist-upload-to-supabase`);
  const tUpload0 = Date.now();
  const { error: uploadErr } = await admin.storage
    .from("inspection-photos")
    .upload(stagedPath, blob, {
      contentType: stagedFetch.headers.get("content-type") ?? "image/jpeg",
      upsert: true,
    });
  timings.persist_upload_to_supabase_ms = Date.now() - tUpload0;
  console.timeEnd(`[stage-listing-photo:${reqId}] persist-upload-to-supabase`);
  if (uploadErr) {
    console.error("[stage-listing-photo] Failed to save staged image", {
      table: "storage.objects",
      operation: "upload",
      error: uploadErr,
    });
    return { error: "Failed to save staged image", status: 500 };
  }

  console.time(`[stage-listing-photo:${reqId}] persist-db-write`);
  const tDbWrite0 = Date.now();
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
  timings.persist_db_write_ms = Date.now() - tDbWrite0;
  console.timeEnd(`[stage-listing-photo:${reqId}] persist-db-write`);
  if (usageErr) {
    console.error("[stage-listing-photo] Failed to save staging usage", {
      table: "staging_usage",
      operation: "insert",
      error: usageErr,
    });
    return { error: "Failed to save staging usage", status: 500 };
  }

  console.log("[stage-listing-photo] persist success", {
    reqId,
    listingId: params.listingId,
    photoId: params.photoId,
    stagedPath,
  });
  return { stagedPath };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  // TEMP DIAGNOSTIC: reqId disambiguates console.time labels across concurrent
  // invocations (Deno's console.time registry is process-global, not per-request).
  const reqId = crypto.randomUUID().slice(0, 8);
  const timings: Record<string, number> = {};
  console.log("[stage-listing-photo] request start", { reqId, method: req.method });

  console.time(`[stage-listing-photo:${reqId}] auth`);
  const tAuth0 = Date.now();
  const auth = await requireUser(req, corsHeaders);
  timings.auth_ms = Date.now() - tAuth0;
  console.timeEnd(`[stage-listing-photo:${reqId}] auth`);
  if (auth instanceof Response) {
    console.warn("[stage-listing-photo] unauthorized", { reqId });
    return auth;
  }
  console.log("[stage-listing-photo] user", { reqId, userId: auth.userId });

  console.time(`[stage-listing-photo:${reqId}] plan+gates`);
  const tGates0 = Date.now();
  const plan = await getUserPlan(auth.userId);
  console.log("[stage-listing-photo] plan", { reqId, plan });
  const gate = await requirePlan(auth.userId, ["professional", "portfolio", "agency"], corsHeaders);
  if (gate) {
    timings.plan_gates_ms = Date.now() - tGates0;
    console.timeEnd(`[stage-listing-photo:${reqId}] plan+gates`);
    console.warn("[stage-listing-photo] plan gate blocked", { reqId, plan });
    return gate;
  }
  const stagingLimits: Record<string, number> = {
    free: 0,
    professional: 5,
    portfolio: 15,
    agency: 50,
  };
  const overLimit = await requireMonthlyLimit(auth.userId, "staging_usage", stagingLimits[plan] ?? 0, corsHeaders);
  timings.plan_gates_ms = Date.now() - tGates0;
  console.timeEnd(`[stage-listing-photo:${reqId}] plan+gates`);
  if (overLimit) {
    console.warn("[stage-listing-photo] monthly limit reached", { reqId, plan });
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
      reqId,
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

    // TEMP DIAGNOSTIC: HEAD the source image to learn its size — answers
    // "is this being sent to the provider at full/uncompressed resolution?"
    // without altering the actual request. Never allowed to break the call.
    try {
      const tHead0 = Date.now();
      const headResp = await fetch(image_url, { method: "HEAD" });
      timings.source_image_head_ms = Date.now() - tHead0;
      console.log("[stage-listing-photo] source image size", {
        reqId,
        contentLength: headResp.headers.get("content-length"),
        contentType: headResp.headers.get("content-type"),
        ms: timings.source_image_head_ms,
      });
    } catch (e) {
      console.warn("[stage-listing-photo] source image HEAD probe failed (non-fatal)", { reqId, err: String(e) });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    // Room-type-specific prompt/creativity overrides — only present for
    // room types where Decor8's default behaviour has been observed to go
    // wrong (kitchen/bathroom/laundryroom today). Added conditionally so
    // every other room type's request body is byte-for-byte unchanged.
    const stagingPrompt = STAGING_PROMPTS[rt];
    const stagingCreativity = STAGING_CREATIVITY[rt];
    const decor8Body: Record<string, unknown> = {
      input_image_url: image_url,
      room_type: rt,
      design_style: designStyle,
      num_images: 1,
      // unverified — didn't appear in the current generate_designs_for_room
      // parameter docs when last checked; confirm with Decor8 whether this
      // is still a real field before relying on it.
      num_captions: 0,
    };
    if (stagingPrompt) decor8Body.prompt = stagingPrompt;
    if (stagingCreativity !== undefined) decor8Body.design_creativity = stagingCreativity;

    console.log("[stage-listing-photo] calling Decor8", {
      reqId,
      designStyle,
      rt,
      hasPrompt: !!stagingPrompt,
      designCreativity: stagingCreativity,
    });
    console.time(`[stage-listing-photo:${reqId}] decor8-request`);
    const tDecor8Req0 = Date.now();
    const resp = await fetch("https://api.decor8.ai/generate_designs_for_room", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(decor8Body),
    }).finally(() => clearTimeout(timer));
    timings.decor8_request_ms = Date.now() - tDecor8Req0;
    console.timeEnd(`[stage-listing-photo:${reqId}] decor8-request`);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[stage-listing-photo] Decor8 non-2xx", { reqId, status: resp.status, text: text.slice(0, 400) });
      const status = resp.status === 429 ? 429 : 502;
      return json({ error: `Staging provider error (${resp.status}): ${text.slice(0, 400)}` }, status);
    }
    console.time(`[stage-listing-photo:${reqId}] decor8-body-parse`);
    const tDecor8Body0 = Date.now();
    const data: any = await resp.json();
    timings.decor8_body_parse_ms = Date.now() - tDecor8Body0;
    console.timeEnd(`[stage-listing-photo:${reqId}] decor8-body-parse`);
    console.log("[stage-listing-photo] Decor8 raw response:", JSON.stringify(data).slice(0, 2000));

    // REMOVE ME — temporary diagnostic for the prompt/design_creativity
    // tuning cycle. Logs the FULL (untruncated) request + response for any
    // call that included a prompt, so we can see whether Decor8 signals
    // which interpretation mode (furnished vs empty-room) it used. Delete
    // once kitchen/bathroom/laundry prompt tuning is confirmed working.
    if (stagingPrompt) {
      console.log("[stage-listing-photo] REMOVE ME: full Decor8 exchange for prompted request", {
        reqId,
        requestBody: decor8Body,
        responseStatus: resp.status,
        responseHeaders: Object.fromEntries(resp.headers.entries()),
        responseJson: data,
      });
    }
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
        reqId,
        timings,
      });
      if (persisted.error) return json({ error: persisted.error }, persisted.status ?? 500);
      if (persisted.stagedPath) {
        timings.total_ms = Date.now() - t0;
        console.log("[stage-listing-photo] TIMING BREAKDOWN", { reqId, ...timings });
        console.log("[stage-listing-photo] success", { reqId, ms: timings.total_ms, stagedUrl, stagedPath: persisted.stagedPath });
        return json({ staged_url: stagedUrl, staged_path: persisted.stagedPath, style: designStyle });
      }
    }

    timings.total_ms = Date.now() - t0;
    console.log("[stage-listing-photo] TIMING BREAKDOWN", { reqId, ...timings });
    console.log("[stage-listing-photo] success", { reqId, ms: timings.total_ms, stagedUrl });
    return json({ staged_url: stagedUrl, style: designStyle });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    const status = err?.name === "AbortError" ? 504 : 500;
    timings.total_ms = Date.now() - t0;
    console.log("[stage-listing-photo] TIMING BREAKDOWN (error path)", { reqId, ...timings });
    console.error("[stage-listing-photo] handler error", { reqId, msg, status });
    return json({ error: msg }, status);
  }
});
