// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { requirePlan, requireMonthlyLimit, getUserPlan } from "../_shared/plan.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (error) console.error("[declutter-listing-photo] team member access check failed", error);
  return !!data;
}

async function sharesTeamWithListingOwner(admin: any, listingOwnerId: string, userId: string) {
  const { data: ownerTeams, error: ownerErr } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", listingOwnerId)
    .eq("status", "active");
  if (ownerErr) {
    console.error("[declutter-listing-photo] owner team lookup failed", ownerErr);
    return false;
  }
  const teamIds = (ownerTeams ?? []).map((row: any) => row.team_id).filter(Boolean);
  if (teamIds.length === 0) {
    const { data: ownedTeams, error: ownedErr } = await admin
      .from("teams")
      .select("id")
      .eq("owner_id", listingOwnerId);
    if (ownedErr) {
      console.error("[declutter-listing-photo] owned team lookup failed", ownedErr);
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
  if (callerErr) console.error("[declutter-listing-photo] caller team lookup failed", callerErr);
  return !!callerMembership;
}

async function persistDeclutteredPhoto(params: {
  userId: string;
  listingId: string;
  photoId: string;
  photoPath: string;
  declutteredUrl: string;
  reqId?: string;
  timings?: Record<string, number>;
}) {
  const reqId = params.reqId ?? "?";
  const timings = params.timings ?? {};
  const admin = adminClient();
  if (!admin) {
    console.warn("[declutter-listing-photo] service role unavailable; returning provider URL only");
    return { declutteredPath: null };
  }

  console.log("[declutter-listing-photo] persist start", {
    reqId,
    listingId: params.listingId,
    photoId: params.photoId,
  });

  console.time(`[declutter-listing-photo:${reqId}] persist-authz-load`);
  const tAuthz0 = Date.now();
  const { data: photo, error: photoErr } = await admin
    .from("listing_photos")
    .select("id,listing_id,photo_url,user_id,team_id,listings!inner(id,user_id,team_id)")
    .eq("id", params.photoId)
    .eq("listing_id", params.listingId)
    .maybeSingle();
  if (photoErr || !photo) {
    console.error("[declutter-listing-photo] Failed to load photo for declutter update", {
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
    console.error("[declutter-listing-photo] Failed to update photo", {
      table: "listing_photos",
      operation: "authorize_update",
      listingId: params.listingId,
      photoId: params.photoId,
    });
    return { error: "Failed to update photo", status: 403 };
  }
  timings.persist_authz_load_ms = Date.now() - tAuthz0;
  console.timeEnd(`[declutter-listing-photo:${reqId}] persist-authz-load`);

  console.time(`[declutter-listing-photo:${reqId}] persist-download-from-decor8`);
  const tDownload0 = Date.now();
  const declutteredFetch = await fetch(params.declutteredUrl);
  if (!declutteredFetch.ok) {
    console.error("[declutter-listing-photo] Failed to fetch decluttered image for storage", {
      status: declutteredFetch.status,
    });
    return { error: "Failed to save decluttered image", status: 502 };
  }
  const blob = await declutteredFetch.blob();
  timings.persist_download_from_decor8_ms = Date.now() - tDownload0;
  console.timeEnd(`[declutter-listing-photo:${reqId}] persist-download-from-decor8`);
  console.log("[declutter-listing-photo] downloaded decluttered image", { reqId, bytes: blob.size });

  // Storage RLS on `inspection-photos` requires the first path segment to be
  // the caller's user id. Nest decluttered files under `{userId}/declutter/...`
  // so the client can createSignedUrl / read them back.
  const declutteredPath = `${params.userId}/declutter/${params.listingId}/${params.photoId}-decluttered.jpg`;
  console.time(`[declutter-listing-photo:${reqId}] persist-upload-to-supabase`);
  const tUpload0 = Date.now();
  const { error: uploadErr } = await admin.storage
    .from("inspection-photos")
    .upload(declutteredPath, blob, {
      contentType: declutteredFetch.headers.get("content-type") ?? "image/jpeg",
      upsert: true,
    });
  timings.persist_upload_to_supabase_ms = Date.now() - tUpload0;
  console.timeEnd(`[declutter-listing-photo:${reqId}] persist-upload-to-supabase`);
  if (uploadErr) {
    console.error("[declutter-listing-photo] Failed to save decluttered image", {
      table: "storage.objects",
      operation: "upload",
      error: uploadErr,
    });
    return { error: "Failed to save decluttered image", status: 500 };
  }

  console.time(`[declutter-listing-photo:${reqId}] persist-db-write`);
  const tDbWrite0 = Date.now();
  const { error: photoUpdateErr } = await admin
    .from("listing_photos")
    .update({ decluttered_url: declutteredPath })
    .eq("id", params.photoId);
  if (photoUpdateErr) {
    console.error("[declutter-listing-photo] Failed to update photo", {
      table: "listing_photos",
      operation: "update",
      error: photoUpdateErr,
    });
    return { error: "Failed to update photo", status: 500 };
  }

  // Declutter shares a single monthly Decor8 budget with virtual staging, so
  // it records into the same staging_usage table/counter rather than a bucket
  // of its own — see requireMonthlyLimit below.
  const { error: usageErr } = await admin.from("staging_usage").insert({
    user_id: params.userId,
    listing_photo_id: params.photoId,
    style: null,
  });
  timings.persist_db_write_ms = Date.now() - tDbWrite0;
  console.timeEnd(`[declutter-listing-photo:${reqId}] persist-db-write`);
  if (usageErr) {
    console.error("[declutter-listing-photo] Failed to save staging usage", {
      table: "staging_usage",
      operation: "insert",
      error: usageErr,
    });
    return { error: "Failed to save staging usage", status: 500 };
  }

  console.log("[declutter-listing-photo] persist success", {
    reqId,
    listingId: params.listingId,
    photoId: params.photoId,
    declutteredPath,
  });
  return { declutteredPath };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  // TEMP DIAGNOSTIC: reqId disambiguates console.time labels across concurrent
  // invocations (Deno's console.time registry is process-global, not per-request).
  const reqId = crypto.randomUUID().slice(0, 8);
  const timings: Record<string, number> = {};
  console.log("[declutter-listing-photo] request start", { reqId, method: req.method });

  console.time(`[declutter-listing-photo:${reqId}] auth`);
  const tAuth0 = Date.now();
  const auth = await requireUser(req, corsHeaders);
  timings.auth_ms = Date.now() - tAuth0;
  console.timeEnd(`[declutter-listing-photo:${reqId}] auth`);
  if (auth instanceof Response) {
    console.warn("[declutter-listing-photo] unauthorized", { reqId });
    return auth;
  }
  console.log("[declutter-listing-photo] user", { reqId, userId: auth.userId });

  console.time(`[declutter-listing-photo:${reqId}] plan+gates`);
  const tGates0 = Date.now();
  const plan = await getUserPlan(auth.userId);
  console.log("[declutter-listing-photo] plan", { reqId, plan });
  const gate = await requirePlan(auth.userId, ["professional", "portfolio", "agency"], corsHeaders);
  if (gate) {
    timings.plan_gates_ms = Date.now() - tGates0;
    console.timeEnd(`[declutter-listing-photo:${reqId}] plan+gates`);
    console.warn("[declutter-listing-photo] plan gate blocked", { reqId, plan });
    return gate;
  }
  // Declutter draws from the SAME monthly Decor8 budget as virtual staging —
  // one combined pool of staging_usage rows, not a separate counter — so a
  // chained "Stage" call that declutters first can consume 2 of these in one
  // user action. Same $0.20/image cost basis and tier shape as staging.
  const combinedLimits: Record<string, number> = {
    free: 0,
    professional: 5,
    portfolio: 15,
    agency: 50,
  };
  const overLimit = await requireMonthlyLimit(auth.userId, "staging_usage", combinedLimits[plan] ?? 0, corsHeaders);
  timings.plan_gates_ms = Date.now() - tGates0;
  console.timeEnd(`[declutter-listing-photo:${reqId}] plan+gates`);
  if (overLimit) {
    console.warn("[declutter-listing-photo] monthly limit reached", { reqId, plan });
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
      console.error("[declutter-listing-photo] DECOR8_API_KEY missing");
      return json({ error: "Object removal API key not configured" }, 503);
    }

    let payload: {
      image_url?: string;
      photoUrl?: string;
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
      console.error("[declutter-listing-photo] invalid JSON body", e);
      return json({ error: "Invalid JSON body" }, 400);
    }
    const image_url = payload.image_url ?? payload.photoUrl;
    const { room_type } = payload;
    const listingId = payload.listing_id ?? payload.listingId;
    const photoId = payload.photo_id ?? payload.photoId;
    const photoPath = payload.photo_path ?? payload.photoPath;
    console.log("[declutter-listing-photo] payload", {
      reqId,
      hasImageUrl: !!image_url,
      room_type,
      hasListingId: !!listingId,
      hasPhotoId: !!photoId,
    });
    if (!image_url) {
      return json({ error: "image_url is required" }, 400);
    }
    const rt = String(room_type ?? "livingroom").toLowerCase();

    // TEMP DIAGNOSTIC: HEAD the source image to learn its size — answers
    // "is this being sent to the provider at full/uncompressed resolution?"
    // without altering the actual request. Never allowed to break the call.
    try {
      const tHead0 = Date.now();
      const headResp = await fetch(image_url, { method: "HEAD" });
      timings.source_image_head_ms = Date.now() - tHead0;
      console.log("[declutter-listing-photo] source image size", {
        reqId,
        contentLength: headResp.headers.get("content-length"),
        contentType: headResp.headers.get("content-type"),
        ms: timings.source_image_head_ms,
      });
    } catch (e) {
      console.warn("[declutter-listing-photo] source image HEAD probe failed (non-fatal)", { reqId, err: String(e) });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    console.log("[declutter-listing-photo] calling Decor8", { reqId, rt });
    console.time(`[declutter-listing-photo:${reqId}] decor8-request`);
    const tDecor8Req0 = Date.now();
    const resp = await fetch("https://api.decor8.ai/remove_objects_from_room", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_image_url: image_url,
        room_type: rt,
      }),
    }).finally(() => clearTimeout(timer));
    timings.decor8_request_ms = Date.now() - tDecor8Req0;
    console.timeEnd(`[declutter-listing-photo:${reqId}] decor8-request`);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[declutter-listing-photo] Decor8 non-2xx", { reqId, status: resp.status, text: text.slice(0, 400) });
      const status = resp.status === 429 ? 429 : 502;
      return json({ error: `Object removal provider error (${resp.status}): ${text.slice(0, 400)}` }, status);
    }
    console.time(`[declutter-listing-photo:${reqId}] decor8-body-parse`);
    const tDecor8Body0 = Date.now();
    const data: any = await resp.json();
    timings.decor8_body_parse_ms = Date.now() - tDecor8Body0;
    console.timeEnd(`[declutter-listing-photo:${reqId}] decor8-body-parse`);
    console.log("[declutter-listing-photo] Decor8 raw response:", JSON.stringify(data).slice(0, 2000));
    const declutteredUrl: string | undefined =
      data?.info?.image?.url ?? data?.info?.url ?? data?.image_url ?? data?.url;
    if (!declutteredUrl) {
      console.error("[declutter-listing-photo] declutter response missing URL", data);
      const providerMsg = data?.error || data?.message || "Object removal response missing image URL";
      return json({ error: `Object removal provider: ${providerMsg}` }, 502);
    }
    if (listingId && photoId && photoPath) {
      const persisted = await persistDeclutteredPhoto({
        userId: auth.userId,
        listingId,
        photoId,
        photoPath,
        declutteredUrl,
        reqId,
        timings,
      });
      if (persisted.error) return json({ error: persisted.error }, persisted.status ?? 500);
      if (persisted.declutteredPath) {
        timings.total_ms = Date.now() - t0;
        console.log("[declutter-listing-photo] TIMING BREAKDOWN", { reqId, ...timings });
        console.log("[declutter-listing-photo] success", {
          reqId,
          ms: timings.total_ms,
          declutteredUrl,
          declutteredPath: persisted.declutteredPath,
        });
        return json({ decluttered_url: declutteredUrl, decluttered_path: persisted.declutteredPath });
      }
    }

    timings.total_ms = Date.now() - t0;
    console.log("[declutter-listing-photo] TIMING BREAKDOWN", { reqId, ...timings });
    console.log("[declutter-listing-photo] success", { reqId, ms: timings.total_ms, declutteredUrl });
    return json({ decluttered_url: declutteredUrl });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    const status = err?.name === "AbortError" ? 504 : 500;
    timings.total_ms = Date.now() - t0;
    console.log("[declutter-listing-photo] TIMING BREAKDOWN (error path)", { reqId, ...timings });
    console.error("[declutter-listing-photo] handler error", { reqId, msg, status });
    return json({ error: msg }, status);
  }
});
