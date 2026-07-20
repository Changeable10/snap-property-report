import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PhotoTable = "inspection_photos" | "listing_photos";
type PhotoState = "raw" | "enhanced" | "staged" | "colour_adjusted";

function assertTable(t: string): asserts t is PhotoTable {
  if (t !== "inspection_photos" && t !== "listing_photos") {
    throw new Error("invalid table");
  }
}

/** Mark a photo as client-side enhanced. `enhancedPath` is the storage path of the enhanced blob. */
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
    const { data: row, error: rowErr } = await context.supabase
      .from(data.table).select("id").eq("id", data.photoId).maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Photo not found or access denied");
    const { error } = await context.supabase
      .from(data.table)
      .update({
        enhanced_url: data.enhancedPath,
        photo_state: "enhanced",
        adjustments: data.adjustments ?? null,
      })
      .eq("id", data.photoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Colour-adjust a staged photo (limited pipeline). Overwrites staged_url with the new blob. */
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
    return data as { table: PhotoTable; photoId: string; stagedPath: string; adjustments: Record<string, number> };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error: rowErr } = await context.supabase
      .from(data.table).select("id,photo_state").eq("id", data.photoId).maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Photo not found or access denied");
    const { error } = await context.supabase
      .from(data.table)
      .update({
        staged_url: data.stagedPath,
        photo_state: "colour_adjusted",
        adjustments: data.adjustments,
      })
      .eq("id", data.photoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Revert to a previous state. Client passes the target state. */
export const revertPhotoState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { table: string; photoId: string; to: string }) => {
    assertTable(data.table);
    if (!["raw", "enhanced", "staged"].includes(data.to)) throw new Error("invalid revert target");
    if (!data.photoId) throw new Error("photoId required");
    return data as { table: PhotoTable; photoId: string; to: PhotoState };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error: rowErr } = await context.supabase
      .from(data.table)
      .select("id,enhanced_url,staged_url,photo_state")
      .eq("id", data.photoId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Photo not found or access denied");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: Record<string, unknown> = { photo_state: data.to, adjustments: null };
    if (data.to === "raw") {
      // Drop enhanced and staged artefacts.
      if (row.enhanced_url) {
        await supabaseAdmin.storage.from("inspection-photos").remove([row.enhanced_url as string]).catch(() => {});
      }
      if (row.staged_url) {
        await supabaseAdmin.storage.from("inspection-photos").remove([row.staged_url as string]).catch(() => {});
      }
      update.enhanced_url = null;
      update.staged_url = null;
    } else if (data.to === "enhanced") {
      // Drop the staged artefact only.
      if (row.staged_url) {
        await supabaseAdmin.storage.from("inspection-photos").remove([row.staged_url as string]).catch(() => {});
      }
      update.staged_url = null;
    } else if (data.to === "staged") {
      // Revert colour adjust — client re-uploads the previous staged blob via setPhotoColourAdjusted.
      // Here we only flip the state and clear adjustments.
    }
    const { error } = await context.supabase
      .from(data.table).update(update).eq("id", data.photoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });