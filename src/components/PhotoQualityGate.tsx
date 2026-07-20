import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { laplacianVariance, averageLuminance } from "@/lib/camera-quality";

const BLUR_VARIANCE_MIN = 100;
const LUMINANCE_MIN = 40;
const LUMINANCE_MAX = 220;
const ANALYSIS_MAX_WIDTH = 640;

interface Props {
  imageFile: File | null;
  open: boolean;
  onAccept: (file: File) => void;
  onRetake: () => void;
}

/**
 * Runs a fast client-side quality check (blur + exposure) on a just-captured
 * still photo. If the photo passes, onAccept fires immediately with no UI.
 * If it fails, a warning dialog is shown letting the user retake or keep it.
 */
export function PhotoQualityGate({ imageFile, open, onAccept, onRetake }: Props) {
  const [checking, setChecking] = useState(false);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !imageFile) {
      setWarnings(null);
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);
    setChecking(true);
    setWarnings(null);

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const w = Math.min(ANALYSIS_MAX_WIDTH, img.naturalWidth || ANALYSIS_MAX_WIDTH);
        const h = Math.round(((img.naturalHeight || w) / (img.naturalWidth || w)) * w);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          if (!cancelled) { setChecking(false); onAccept(imageFile); }
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const blurVariance = laplacianVariance(data);
        const luminance = averageLuminance(data);

        const found: string[] = [];
        if (blurVariance < BLUR_VARIANCE_MIN) found.push("This photo appears blurry.");
        if (luminance < LUMINANCE_MIN) found.push("This photo is too dark.");
        if (luminance > LUMINANCE_MAX) found.push("This photo is overexposed.");

        if (cancelled) return;
        setChecking(false);
        if (found.length === 0) {
          onAccept(imageFile);
        } else {
          setWarnings(found);
        }
      } catch {
        if (!cancelled) { setChecking(false); onAccept(imageFile); }
      }
    };
    img.onerror = () => {
      if (!cancelled) { setChecking(false); onAccept(imageFile); }
    };
    img.src = objectUrl;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageFile]);

  if (!open || !imageFile || checking || !warnings || warnings.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Photo quality check"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <AlertTriangle className="size-4 text-amber-600" />
          <p className="text-sm font-semibold text-foreground">Check this photo</p>
        </div>

        {previewUrl && (
          <div className="aspect-square w-full overflow-hidden bg-muted">
            <img src={previewUrl} alt="Captured photo" className="size-full object-cover" />
          </div>
        )}

        <div className="space-y-1.5 px-4 py-3">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 pt-0">
          <button
            type="button"
            onClick={onRetake}
            className="flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-accent"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={() => onAccept(imageFile)}
            className="flex min-h-11 items-center justify-center rounded-lg bg-teal px-3 text-sm font-semibold text-teal-foreground hover:bg-teal-dark"
          >
            Keep anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// Exported for the (rare) checking state, in case callers want a spinner
// while analysis runs. Kept simple: most photos pass in well under 100ms.
export function PhotoQualityChecking() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Loader2 className="size-6 animate-spin text-white" />
    </div>
  );
}
