import { supabase } from "@/integrations/supabase/client";
import { declutterListingPhoto } from "@/lib/declutter-photo";
import { bestSourceForStaging, type PhotoActionFields } from "@/lib/photo-actions";

export interface StageChainResult {
  ok: true;
  stagedPath: string;
  /** Set when a declutter pass ran as part of this call (photo wasn't already decluttered). */
  declutteredPath?: string;
}
export interface StageChainError {
  ok: false;
  error: string;
}

/**
 * Stages a photo, auto-decluttering first if it hasn't been decluttered yet
 * — chained, no separate UI step for the intermediate declutter result (see
 * StagePhotoModal, which is the only place this should be called from for a
 * single photo; callers do NOT gate on plan/credits or show any UI here).
 * Each Decor8 call that actually runs (declutter and/or stage) is metered
 * via staging_usage as it completes, same rule as declutterListingPhoto.
 *
 * Source image is chosen via bestSourceForStaging, NOT bestPhotoPath —
 * re-staging (e.g. "Try another style") deliberately always restarts from
 * the decluttered baseline (or enhanced/raw), never from a prior staged
 * result. If you're tempted to make re-staging build on the last staged
 * output instead, that's a real product decision, not a bug fix — don't
 * make it silently here.
 */
export async function stageListingPhoto(params: {
  photoId: string;
  photo: PhotoActionFields & { photo_url: string };
  listingId: string;
  styleKey: string;
  /**
   * Required unconditionally — sent straight through to the staging
   * Decor8 call (not just used for an auto-declutter pass), so callers must
   * resolve it regardless of whether the photo has already been decluttered.
   */
  roomType: string;
  authUserId?: string;
}): Promise<StageChainResult | StageChainError> {
  try {
    let sourcePath = bestSourceForStaging(params.photo);
    let declutteredPath: string | undefined;
    if (!params.photo.decluttered_url) {
      const declutterResult = await declutterListingPhoto({
        photoId: params.photoId,
        photoUrl: params.photo.photo_url,
        listingId: params.listingId,
        roomType: params.roomType,
        authUserId: params.authUserId,
      });
      if (!declutterResult.ok) return { ok: false, error: declutterResult.error };
      sourcePath = declutterResult.path;
      declutteredPath = declutterResult.path;
    }

    const { data: signed } = await supabase.storage
      .from("inspection-photos")
      .createSignedUrl(sourcePath, 3600);
    const url = signed?.signedUrl;
    if (!url) throw new Error("Signed URL failed");
    const { data, error } = await supabase.functions.invoke("stage-listing-photo", {
      body: {
        image_url: url,
        style: params.styleKey,
        room_type: params.roomType,
        listing_id: params.listingId,
        photo_id: params.photoId,
        photo_path: params.photo.photo_url,
      },
    });
    if (error) {
      const { unwrapFunctionsError } = await import("@/lib/email-client");
      throw new Error(await unwrapFunctionsError(error, "Staging failed"));
    }
    console.log("[stage] stage-listing-photo response", data);
    if ((data as any)?.error) throw new Error((data as any).error);
    const stagedPathFromServer = (data as any)?.staged_path as string | undefined;
    if (stagedPathFromServer) {
      return { ok: true, stagedPath: stagedPathFromServer, declutteredPath };
    }

    // Fallback: server-side persistence unavailable — persist client-side,
    // mirroring declutter-listing-photo's own fallback path.
    const stagedRemote = (data as any).staged_url as string;
    const resp = await fetch(stagedRemote);
    if (!resp.ok) throw new Error("Failed to fetch staged image");
    const blob = await resp.blob();
    const {
      data: { user: _u },
    } = await supabase.auth.getUser();
    const uid = _u?.id ?? params.authUserId;
    if (!uid) throw new Error("Sign in required to save staged image");
    const stagedPath = `${uid}/staging/${params.listingId}/${params.photoId}-staged.jpg`;
    const { error: upErr } = await supabase.storage
      .from("inspection-photos")
      .upload(stagedPath, blob, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase
      .from("listing_photos")
      .update({ staged_url: stagedPath, staging_style: params.styleKey, photo_state: "staged" })
      .eq("id", params.photoId);
    if (dbErr) throw new Error("Failed to update photo");
    const { error: usageErr } = await supabase.from("staging_usage").insert({
      user_id: uid,
      listing_photo_id: params.photoId,
      style: params.styleKey,
    });
    if (usageErr) throw new Error("Failed to save staging usage");
    return { ok: true, stagedPath, declutteredPath };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Staging failed" };
  }
}

/**
 * Discards a staged result: deletes the stored image and clears staged_url
 * / staging_style. Does NOT touch usage/credits — Decor8 calls that already
 * ran stay metered.
 */
export async function discardStagedPhoto(params: {
  photoId: string;
  stagedUrl: string | null | undefined;
}): Promise<void> {
  if (params.stagedUrl) {
    await supabase.storage.from("inspection-photos").remove([params.stagedUrl]);
  }
  const { error } = await supabase
    .from("listing_photos")
    .update({ staged_url: null, staging_style: null })
    .eq("id", params.photoId);
  if (error) throw error;
}
