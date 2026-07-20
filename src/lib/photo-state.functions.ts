import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PhotoTable = "inspection_photos" | "listing_photos";
type PhotoState = "raw" | "enhanced" | "staged" | "colour_adjusted";

function assertTable(t: string): asserts t is PhotoTable {
  if (t !== "inspection_photos" && t !== "listing_photos") {
    throw new Error("invalid table");
  }
}

/** Mark a photo as client-side enhanced. */
export const setPhotoEnhanced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    table: string;
    photoId: string;
    enhancedPath: string;
    adjustments?: Record<string, number> | null;
  }) => {
    assertTable(data.table);
    if (!data.photoId || !data.enhancedPath) throw new Error("photoId and enhancedPath required");
    return data as { table: PhotoTable; photoId: string; enhancedPath: string; adjustments?: Record<string, number> | null };
  })
  .handler(async ({ data, context }) => {
    const update = {
      enhanced_url: data.enhancedPath,
      photo_state: "enhanced" as const,
      adjustments: (data.adjustments ?? null) as any,
    };
    const res = data.table === "inspection_photos"
      ? await context.supabase.from("inspection_photos").update(update).eq("id", data.photoId).select("id").maybeSingle()
      : await context.supabase.from("listing_photos").update(update).eq("id", data.photoId).select("id").maybeSingle();
    if (res.error) throw new Error(res.error.message);
    if (!res.data) throw new Error("Photo not found or access denied");
    return { ok: true };
  });

/** Colour-adjust a staged photo. */
export const setPhotoColourAdjusted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    table: string;
    photoId: string;
    stagedPath: string;
    adjustments: Record<string, number>;
  }) => {
    assertTable(data.table);
    if (!data.photoId || !data.stagedPath) throw new Error("photoId and stagedPath required");
    // Only listing_photos has a staged_url column today.
    if (data.table !== "listing_photos") throw new Error("staging applies to listing_photos only");
    return data as { table: "listing_photos"; photoId: string; stagedPath: string; adjustments: Record<string, number> };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("listing_photos")
      .update({
        staged_url: data.stagedPath,
        photo_state: "colour_adjusted",
        adjustments: data.adjustments as any,
      })
      .eq("id", data.photoId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Photo not found or access denied");
    return { ok: true };
  });

/** Revert to a previous state. */
export const revertPhotoState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { table: string; photoId: string; to: string }) => {
    assertTable(data.table);
    if (!["raw", "enhanced", "staged"].includes(data.to)) throw new Error("invalid revert target");
    if (!data.photoId) throw new Error("photoId required");
    return data as { table: PhotoTable; photoId: string; to: PhotoState };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.table === "inspection_photos") {
      const { data: row, error: rowErr } = await context.supabase
        .from("inspection_photos")
        .select("id,enhanced_url,photo_state")
        .eq("id", data.photoId)
        .maybeSingle();
      if (rowErr) throw new Error(rowErr.message);
      if (!row) throw new Error("Photo not found or access denied");
      if (data.to === "raw" && row.enhanced_url) {
        await supabaseAdmin.storage.from("inspection-photos").remove([row.enhanced_url]).catch(() => {});
      }
      const { error } = await context.supabase.from("inspection_photos")
        .update({
          photo_state: data.to,
          adjustments: null as any,
          enhanced_url: data.to === "raw" ? null : row.enhanced_url,
        })
        .eq("id", data.photoId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error: rowErr } = await context.supabase
        .from("listing_photos")
        .select("id,enhanced_url,staged_url,photo_state")
        .eq("id", data.photoId)
        .maybeSingle();
      if (rowErr) throw new Error(rowErr.message);
      if (!row) throw new Error("Photo not found or access denied");
      const update: Record<string, unknown> = { photo_state: data.to, adjustments: null };
      if (data.to === "raw") {
        if (row.enhanced_url) await supabaseAdmin.storage.from("inspection-photos").remove([row.enhanced_url]).catch(() => {});
        if (row.staged_url) await supabaseAdmin.storage.from("inspection-photos").remove([row.staged_url]).catch(() => {});
        update.enhanced_url = null;
        update.staged_url = null;
      } else if (data.to === "enhanced") {
        if (row.staged_url) await supabaseAdmin.storage.from("inspection-photos").remove([row.staged_url]).catch(() => {});
        update.staged_url = null;
      }
      const { error } = await context.supabase.from("listing_photos")
        .update(update as any)
        .eq("id", data.photoId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });