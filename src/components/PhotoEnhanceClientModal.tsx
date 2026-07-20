import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X, RotateCcw, Sliders } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { autoEnhance, manualAdjust, colourAdjustStaged, type AdjustmentValues } from "@/lib/photo-enhance-canvas";
import { setPhotoEnhanced, setPhotoColourAdjusted, revertPhotoState } from "@/lib/photo-state.functions";

type Table = "inspection_photos" | "listing_photos";
type PhotoState = "raw" | "enhanced" | "staged" | "colour_adjusted";
type Mode = "enhance" | "adjust" | "colour_adjust";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  photoId: string;
  photoPath: string;           // original raw path
  stagedPath?: string | null;  // for colour_adjust mode
  photoState: PhotoState;
  table: Table;
  userId: string;
  queryKey: readonly unknown[]; // parent list to invalidate
}

/**
 * Client-side photo enhancement / adjustment modal.
 * - Enhance: runs the full auto pipeline on the raw photo, uploads result, sets state=enhanced.
 * - Adjust: manual sliders (brightness/contrast/warmth/sharpness), same target state.
 * - Colour Adjust: limited pipeline for staged photos (brightness/contrast/warmth only).
 */
export function PhotoEnhanceClientModal({
  open,
  onClose,
  mode,
  photoId,
  photoPath,
  stagedPath,
  photoState,
  table,
  userId,
  queryKey,
}: Props) {
  const qc = useQueryClient();
  const setEnhanced = useServerFn(setPhotoEnhanced);
  const setColourAdjusted = useServerFn(setPhotoColourAdjusted);
  const revert = useServerFn(revertPhotoState);

  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // Manual sliders (used in adjust / colour_adjust modes).
  const [brightness, setBrightness] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [warmth, setWarmth] = useState(0);
  const [sharpness, setSharpness] = useState(0.3);
  const sliderDebounce = useRef<number | null>(null);
  const sourceBlobRef = useRef<Blob | null>(null);

  const sourcePath = mode === "colour_adjust" && stagedPath ? stagedPath : photoPath;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPreviewUrl(null);
    setOutBlob(null);
    setBrightness(1.0);
    setContrast(1.0);
    setWarmth(0);
    setSharpness(0.3);

    (async () => {
      const { data } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(sourcePath, 3600);
      if (cancelled) return;
      setOrigUrl(data?.signedUrl ?? null);
      if (!data?.signedUrl) {
        setError("Failed to load photo");
        return;
      }
      // Fetch source into a Blob we can re-run the pipeline on.
      try {
        const resp = await fetch(data.signedUrl);
        const blob = await resp.blob();
        if (cancelled) return;
        sourceBlobRef.current = blob;
        if (mode === "enhance") {
          await runAutoEnhance(blob);
        } else {
          // Adjust / colour_adjust: start with a pass-through preview.
          setPreviewUrl(data.signedUrl);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load photo");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourcePath, mode]);

  async function runAutoEnhance(blob: Blob) {
    setProcessing(true);
    setError(null);
    try {
      const out = await autoEnhance(blob);
      setOutBlob(out);
      setPreviewUrl(URL.createObjectURL(out));
    } catch (e: any) {
      setError(e?.message ?? "Enhancement failed");
    } finally {
      setProcessing(false);
    }
  }

  function scheduleAdjustPreview() {
    if (sliderDebounce.current) window.clearTimeout(sliderDebounce.current);
    sliderDebounce.current = window.setTimeout(async () => {
      const src = sourceBlobRef.current;
      if (!src) return;
      setProcessing(true);
      try {
        const values: AdjustmentValues = { brightness, contrast, warmth, sharpness };
        const out = mode === "colour_adjust"
          ? await colourAdjustStaged(src, values)
          : await manualAdjust(src, values);
        setOutBlob(out);
        if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(out));
      } finally {
        setProcessing(false);
      }
    }, 250);
  }

  useEffect(() => {
    if (mode === "enhance") return;
    scheduleAdjustPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brightness, contrast, warmth, sharpness]);

  async function save() {
    if (!outBlob) return;
    setProcessing(true);
    try {
      if (mode === "colour_adjust") {
        const path = `${userId}/staging/${photoId}-adjusted-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("inspection-photos")
          .upload(path, outBlob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;
        await setColourAdjusted({ data: {
          table,
          photoId,
          stagedPath: path,
          adjustments: { brightness, contrast, warmth },
        }});
        toast.success("Colour adjustment saved");
      } else {
        const path = `${userId}/enhanced/${photoId}-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("inspection-photos")
          .upload(path, outBlob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;
        const adjustments = mode === "adjust"
          ? { brightness, contrast, warmth, sharpness }
          : null;
        await setEnhanced({ data: { table, photoId, enhancedPath: path, adjustments }});
        toast.success("Photo enhanced");
      }
      await qc.invalidateQueries({ queryKey });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setProcessing(false);
    }
  }

  async function undo() {
    setProcessing(true);
    try {
      const to = mode === "colour_adjust" ? "staged" : (photoState === "enhanced" ? "raw" : "raw");
      await revert({ data: { table, photoId, to } });
      await qc.invalidateQueries({ queryKey });
      toast.success("Reverted");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to revert");
    } finally {
      setProcessing(false);
    }
  }

  const title = mode === "enhance"
    ? "Enhance photo"
    : mode === "colour_adjust"
      ? "Colour adjust staged photo"
      : "Adjust photo";

  const canUndo = useMemo(() => {
    if (mode === "colour_adjust") return photoState === "colour_adjusted";
    return photoState === "enhanced" || photoState === "colour_adjusted";
  }, [mode, photoState]);

  if (!open) return null;

  const displayUrl = showOriginal ? origUrl : (previewUrl ?? origUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === "enhance" ? <Sparkles className="size-4 text-teal" /> : <Sliders className="size-4 text-teal" />}
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-muted">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Photo preview"
              className="size-full object-contain select-none"
              draggable={false}
              onPointerDown={() => setShowOriginal(true)}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
            />
          ) : (
            <div className="grid size-full place-items-center">
              <Loader2 className="size-6 animate-spin text-teal" />
            </div>
          )}
          {processing ? (
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-center text-xs text-white">
              Enhancing…
            </div>
          ) : null}
          {previewUrl && !showOriginal ? (
            <span className="absolute left-2 top-2 rounded bg-teal px-2 py-0.5 text-[10px] font-semibold text-teal-foreground">
              {mode === "colour_adjust" ? "Adjusted" : "Enhanced"}
            </span>
          ) : null}
          {showOriginal ? (
            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
              Original
            </span>
          ) : null}
        </div>

        {mode !== "enhance" ? (
          <div className="space-y-3 border-t border-border p-4 text-sm">
            <Slider label="Brightness" value={brightness} min={0.5} max={1.5} step={0.01} onChange={setBrightness} />
            <Slider label="Contrast" value={contrast} min={0.5} max={1.5} step={0.01} onChange={setContrast} />
            <Slider label="Warmth" value={warmth} min={-1} max={1} step={0.02} onChange={setWarmth} />
            {mode === "adjust" ? (
              <Slider label="Sharpness" value={sharpness} min={0} max={1} step={0.02} onChange={setSharpness} />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="border-t border-border bg-red-50 px-4 py-2 text-xs text-red-800">{error}</p>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border p-3">
          {canUndo ? (
            <button
              type="button"
              disabled={processing}
              onClick={undo}
              className="flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              <RotateCcw className="size-3.5" /> Undo
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!outBlob || processing}
            onClick={save}
            className="flex min-h-11 items-center justify-center rounded-lg bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-60"
          >
            {processing ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </button>
        </div>
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
          Tap and hold the photo to see the original.
        </p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}