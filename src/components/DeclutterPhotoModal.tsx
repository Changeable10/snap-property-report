import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Eraser, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { declutterListingPhoto, discardDeclutteredPhoto } from "@/lib/declutter-photo";
import { incrementUsage } from "@/lib/use-usage";

interface Props {
  open: boolean;
  onClose: () => void;
  photoId: string;
  photoUrl: string;
  listingId: string;
  roomType: string;
  onApplied?: (declutteredPath: string) => void;
  onDiscarded?: () => void;
}

/**
 * Standalone "Clean up" modal — mirrors EnhancePhotoModal's shape exactly: a
 * side-by-side Original / Cleaned up comparison, tap-to-enlarge fullscreen,
 * and explicit accept/decline. Only used for the standalone Clean up action;
 * the chained declutter-then-stage flow in stagePhoto calls
 * declutterListingPhoto directly and never opens this.
 *
 * The Decor8 call (and its staging_usage charge) runs once, as soon as the
 * modal opens — accept/decline below only decide whether decluttered_url
 * stays persisted, not whether the credit was consumed.
 */
export function DeclutterPhotoModal({
  open,
  onClose,
  photoId,
  photoUrl,
  listingId,
  roomType,
  onApplied,
  onDiscarded,
}: Props) {
  const qc = useQueryClient();
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [cleanUrl, setCleanUrl] = useState<string | null>(null);
  const [declutteredPath, setDeclutteredPath] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [fullscreen, setFullscreen] = useState<"original" | "clean" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCleanUrl(null);
    setDeclutteredPath(null);
    (async () => {
      const { data } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(photoUrl, 3600);
      if (!cancelled) setOrigUrl(data?.signedUrl ?? null);
    })();
    (async () => {
      setRunning(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const result = await declutterListingPhoto({
          photoId,
          photoUrl,
          listingId,
          roomType,
          authUserId: user?.id,
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDeclutteredPath(result.path);
        void incrementUsage("staging").then(() =>
          qc.invalidateQueries({ queryKey: ["usage-tracking"] }),
        );
        void qc.invalidateQueries({ queryKey: ["staging-this-month"] });
        const { data: signed } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(result.path, 3600);
        if (!cancelled) setCleanUrl(signed?.signedUrl ?? null);
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoId, photoUrl, listingId, roomType]);

  if (!open) return null;

  async function keepOriginal() {
    setDiscarding(true);
    try {
      await discardDeclutteredPhoto({ photoId, declutteredUrl: declutteredPath });
      onDiscarded?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to discard cleaned up photo");
    } finally {
      setDiscarding(false);
    }
  }

  function useCleaned() {
    if (!declutteredPath) return;
    toast.success("Cleaned up photo saved.");
    onApplied?.(declutteredPath);
    onClose();
  }

  const fullscreenUrl =
    fullscreen === "original" ? origUrl : fullscreen === "clean" ? cleanUrl : null;
  const fullscreenLabel = fullscreen === "original" ? "Original" : "Cleaned up";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
        <div className="relative w-full max-w-2xl max-h-[95dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Eraser className="size-4 text-teal" />
              <p className="text-sm font-semibold">Clean up photo</p>
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

          <div className="space-y-px bg-border">
            <button
              type="button"
              onClick={() => origUrl && setFullscreen("original")}
              className="relative block w-full aspect-[4/3] overflow-hidden bg-muted"
            >
              {origUrl ? (
                <img src={origUrl} alt="Original" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-xs text-muted-foreground">
                  Loading…
                </div>
              )}
              <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                Original
              </span>
              {origUrl && (
                <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                  Tap to enlarge
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => cleanUrl && setFullscreen("clean")}
              className="relative block w-full aspect-[4/3] overflow-hidden bg-muted"
            >
              {cleanUrl ? (
                <img src={cleanUrl} alt="Cleaned up" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center gap-2 text-center text-xs text-muted-foreground">
                  {running ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="size-5 animate-spin text-teal" />
                      <span>Cleaning up…</span>
                    </div>
                  ) : error ? (
                    <span className="px-4 text-red-600">{error}</span>
                  ) : (
                    "—"
                  )}
                </div>
              )}
              <span className="absolute left-2 top-2 rounded bg-teal px-2 py-0.5 text-[10px] font-semibold text-teal-foreground">
                Cleaned up
              </span>
              {cleanUrl && (
                <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                  Tap to enlarge
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            <button
              type="button"
              disabled={discarding}
              onClick={keepOriginal}
              className="flex min-h-12 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {discarding ? <Loader2 className="size-4 animate-spin" /> : "Keep original"}
            </button>
            <button
              type="button"
              disabled={!declutteredPath || running}
              onClick={useCleaned}
              className="flex min-h-12 items-center justify-center rounded-lg bg-teal px-3 text-sm font-semibold text-teal-foreground disabled:opacity-60"
            >
              Use cleaned up
            </button>
          </div>
        </div>
      </div>
      {fullscreen &&
        fullscreenUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
            onClick={() => setFullscreen(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-semibold text-white">{fullscreenLabel}</span>
              <button
                type="button"
                onClick={() => setFullscreen(null)}
                className="grid size-9 place-items-center rounded-full bg-white/20 text-white"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div
              className="flex flex-1 items-center justify-center px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={fullscreenUrl}
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
                alt={fullscreenLabel}
              />
            </div>
            <div
              className="shrink-0 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFullscreen(fullscreen === "original" ? "clean" : "original")}
                  disabled={fullscreen === "clean" ? !origUrl : !cleanUrl}
                  className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-white/20 text-sm font-semibold text-white disabled:opacity-30"
                >
                  View {fullscreen === "original" ? "Cleaned up" : "Original"}
                </button>
                {fullscreen === "clean" && declutteredPath ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFullscreen(null);
                      useCleaned();
                    }}
                    className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-teal text-sm font-semibold text-teal-foreground"
                  >
                    <Eraser className="size-4" /> Use cleaned up
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFullscreen(null);
                      keepOriginal();
                    }}
                    disabled={discarding}
                    className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-white/20 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Keep original
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
