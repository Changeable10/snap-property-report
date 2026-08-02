import { supabase } from "@/integrations/supabase/client";

/**
 * Calls declutter-listing-photo and returns the resulting storage path. Does
 * NOT gate on plan/credits and does NOT show any UI — callers decide that.
 * The Decor8 call (and its usage_tracking/staging_usage charge) happens here
 * unconditionally on success; accepting or discarding the result afterward
 * only affects whether decluttered_url stays persisted, never whether the
 * credit was consumed — see discardDeclutteredPhoto.
 */
export async function declutterListingPhoto(params: {
  photoId: string;
  photoUrl: string;
  listingId: string;
  roomType: string;
  authUserId?: string;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const { data: signed } = await supabase.storage
      .from("inspection-photos")
      .createSignedUrl(params.photoUrl, 3600);
    const url = signed?.signedUrl;
    if (!url) throw new Error("Signed URL failed");
    const { data, error } = await supabase.functions.invoke("declutter-listing-photo", {
      body: {
        image_url: url,
        room_type: params.roomType,
        listing_id: params.listingId,
        photo_id: params.photoId,
        photo_path: params.photoUrl,
      },
    });
    if (error) {
      const { unwrapFunctionsError } = await import("@/lib/email-client");
      throw new Error(await unwrapFunctionsError(error, "Clean up failed"));
    }
    console.log("[declutter] declutter-listing-photo response", data);
    if ((data as any)?.error) throw new Error((data as any).error);
    const declutteredPathFromServer = (data as any)?.decluttered_path as string | undefined;
    if (declutteredPathFromServer) return { ok: true, path: declutteredPathFromServer };

    // Fallback: server-side persistence unavailable — persist client-side,
    // mirroring stage-listing-photo's own fallback path.
    const declutteredRemote = (data as any).decluttered_url as string;
    const resp = await fetch(declutteredRemote);
    if (!resp.ok) throw new Error("Failed to fetch decluttered image");
    const blob = await resp.blob();
    const {
      data: { user: _u },
    } = await supabase.auth.getUser();
    const uid = _u?.id ?? params.authUserId;
    if (!uid) throw new Error("Sign in required to save decluttered image");
    const declutteredPath = `${uid}/declutter/${params.listingId}/${params.photoId}-decluttered.jpg`;
    const { error: upErr } = await supabase.storage
      .from("inspection-photos")
      .upload(declutteredPath, blob, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase
      .from("listing_photos")
      .update({ decluttered_url: declutteredPath })
      .eq("id", params.photoId);
    if (dbErr) throw new Error("Failed to update photo");
    // Shared bucket with staging — no dedicated declutter_usage table.
    const { error: usageErr } = await supabase.from("staging_usage").insert({
      user_id: uid,
      listing_photo_id: params.photoId,
      style: null,
    });
    if (usageErr) throw new Error("Failed to save staging usage");
    return { ok: true, path: declutteredPath };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Clean up failed" };
  }
}

/**
 * Discards a decluttered result: deletes the stored image and clears
 * decluttered_url. Does NOT touch usage/credits — the Decor8 call that
 * produced the result has already been metered and stays metered.
 */
export async function discardDeclutteredPhoto(params: {
  photoId: string;
  declutteredUrl: string | null | undefined;
}): Promise<void> {
  if (params.declutteredUrl) {
    await supabase.storage.from("inspection-photos").remove([params.declutteredUrl]);
  }
  const { error } = await supabase
    .from("listing_photos")
    .update({ decluttered_url: null })
    .eq("id", params.photoId);
  if (error) throw error;
}
