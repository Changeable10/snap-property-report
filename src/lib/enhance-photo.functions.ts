import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EnhanceInput = {
  photoId: string;
  table: "inspection_photos" | "listing_photos";
  photoPath: string;
};

const ENHANCE_PROMPT =
  "Auto-enhance this real-estate / property-inspection photo. Apply gentle, realistic corrections only: balance exposure and contrast so the image is well-lit without blowing out highlights, normalise white balance, and slightly increase sharpness and clarity. Do NOT add, remove, restyle or move any objects, furniture, people, text or watermarks. Keep composition, framing, aspect ratio and all room contents identical. Return only the corrected photograph.";

/**
 * Enhance a photo (inspection or listing) using Lovable AI (Gemini image edit).
 * - Downloads the original from the `inspection-photos` bucket.
 * - Runs a single edit pass.
 * - Uploads the result to `${userId}/enhanced/${photoId}.jpg` in the same bucket.
 * - Sets `enhanced_url` on the target row.
 * Returns `{ enhancedPath, unchanged }`. When `unchanged` is true no enhancement
 * was applied (photo already looks good) and the client should surface a toast.
 */
export const enhancePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EnhanceInput) => {
    if (!data?.photoId || !data?.photoPath) throw new Error("photoId and photoPath required");
    if (data.table !== "inspection_photos" && data.table !== "listing_photos") {
      throw new Error("invalid table");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { photoId, table, photoPath } = data;
    const { userId } = context;

    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) throw new Error("Enhancement service not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller owns (or team-shares) the photo row via RLS-scoped client.
    const { data: row, error: rowErr } = await context.supabase
      .from(table)
      .select("id,user_id,photo_url")
      .eq("id", photoId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Photo not found or access denied");

    // Download original
    const dl = await supabaseAdmin.storage.from("inspection-photos").download(photoPath);
    if (dl.error || !dl.data) throw new Error(`Failed to read original: ${dl.error?.message ?? "not found"}`);
    const originalBuf = new Uint8Array(await dl.data.arrayBuffer());
    if (originalBuf.byteLength === 0) throw new Error("Original photo is empty");

    // Convert to base64 (chunked to avoid stack overflow on large images).
    const b64 = bytesToBase64(originalBuf);
    const mime = guessMime(photoPath);
    const dataUrl = `data:${mime};base64,${b64}`;

    // Call Lovable AI Gateway — Gemini 3.1 flash image (fast image editing).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let respJson: any;
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image",
          modalities: ["image", "text"],
          messages: [{
            role: "user",
            content: [
              { type: "text", text: ENHANCE_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          }],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
        if (resp.status === 429) throw new Error("Rate limit reached — try again in a moment.");
        throw new Error(`Enhancement failed (${resp.status}): ${errText.slice(0, 200)}`);
      }
      respJson = await resp.json();
    } finally {
      clearTimeout(timer);
    }

    const outB64: string | undefined = respJson?.data?.[0]?.b64_json;
    if (!outB64) {
      // Fall back to text signal — if the model refused/couldn't improve, treat as unchanged.
      return { enhancedPath: null, unchanged: true };
    }

    const outBytes = base64ToBytes(outB64);
    // If the model returned an image byte-identical (or near-identical) to
    // the input, treat it as "already looks good".
    if (Math.abs(outBytes.byteLength - originalBuf.byteLength) < 512 && outBytes.byteLength > 0) {
      // Rough content check — hash first + last 1KB.
      const sameEnds =
        equalRange(outBytes, originalBuf, 0, 1024) &&
        equalRange(outBytes, originalBuf, Math.max(0, outBytes.byteLength - 1024), 1024);
      if (sameEnds) return { enhancedPath: null, unchanged: true };
    }

    const enhancedPath = `${userId}/enhanced/${photoId}.jpg`;
    const up = await supabaseAdmin.storage
      .from("inspection-photos")
      .upload(enhancedPath, outBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (up.error) throw new Error(`Failed to save enhanced photo: ${up.error.message}`);

    const { error: updErr } = await supabaseAdmin
      .from(table)
      .update({ enhanced_url: enhancedPath, photo_state: "enhanced" })
      .eq("id", photoId);
    if (updErr) throw new Error(updErr.message);

    return { enhancedPath, unchanged: false };
  });

/**
 * Discard an enhanced version — delete storage object and clear the row.
 */
export const discardEnhancement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { photoId: string; table: "inspection_photos" | "listing_photos" }) => {
    if (!data?.photoId) throw new Error("photoId required");
    if (data.table !== "inspection_photos" && data.table !== "listing_photos") throw new Error("invalid table");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { photoId, table } = data;
    // Confirm row visibility to caller.
    const { data: row, error } = await context.supabase
      .from(table)
      .select("id,enhanced_url")
      .eq("id", photoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Photo not found or access denied");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (row.enhanced_url) {
      await supabaseAdmin.storage.from("inspection-photos").remove([row.enhanced_url]);
    }
    const { error: updErr } = await supabaseAdmin
      .from(table)
      .update({ enhanced_url: null, photo_state: "raw" })
      .eq("id", photoId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function equalRange(a: Uint8Array, b: Uint8Array, start: number, len: number): boolean {
  const end = Math.min(start + len, a.length, b.length);
  for (let i = start; i < end; i++) if (a[i] !== b[i]) return false;
  return true;
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}