import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sofa, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { stageListingPhoto, discardStagedPhoto } from "@/lib/stage-listing-photo";
import { bestSourceForStaging, type PhotoActionFields } from "@/lib/photo-actions";
import { incrementUsage } from "@/lib/use-usage";
import { STAGING_STYLES } from "@/lib/use-staging-limit";

interface Props {
  open: boolean;
  onClose: () => void;
  photo: PhotoActionFields & { id: string; photo_url: string };
  listingId: string;
  /** Required unconditionally — sent to the staging Decor8 call itself, not just used for an auto-declutter pass. */
  roomType: string;
  onApplied?: (stagedPath: string) => void;
  onDiscarded?: () => void;
}

/**
 * Standalone "Stage" modal — mirrors EnhancePhotoModal/DeclutterPhotoModal's
 * shape: a style-picker step, then a side-by-side Original / Staged
 * comparison with tap-to-enlarge fullscreen and explicit accept/decline.
 *
 * If the photo hasn't been decluttered yet, stageListingPhoto chains a
 * declutter pass in first — that intermediate result is never shown or
 * reviewed separately here, only the final staged photo is. Both Decor8
 * calls that actually run (declutter, if needed, and stage) are metered as
 * soon as they succeed, independent of accept/decline below.
 *
 * "Original" is deliberately bestSourceForStaging(photo), not the raw
 * photo_url and not bestPhotoPath — it must show exactly what stageListingPhoto
 * actually sent to Decor8 (decluttered > enhanced > raw, never a prior staged
 * result), so before/after here reflects reality.
 */
export function StagePhotoModal({
  open,
  onClose,
  photo,
  listingId,
  roomType,
  onApplied,
  onDiscarded,
}: Props) {
  const qc = useQueryClient();
  const [view, setView] = useState<"style" | "result">("style");
  const [chosenStyle, setChosenStyle] = useState<string | null>(null);
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [stagedPath, setStagedPath] = useState<string | null>(null);
  const [ranDeclutter, setRanDeclutter] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [fullscreen, setFullscreen] = useState<"original" | "staged" | null>(null);

  useEffect(() => {
    if (!open) return;
    setView("style");
    setChosenStyle(null);
    setStagedUrl(null);
    setStagedPath(null);
    setRanDeclutter(false);
    setError(null);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(bestSourceForStaging(photo), 3600);
      if (!cancelled) setOrigUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photo.photo_url, photo.decluttered_url, photo.enhanced_url]);

  if (!open) return null;

  async function chooseStyle(styleKey: string) {
    setChosenStyle(styleKey);
    setView("result");
    setRunning(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await stageListingPhoto({
        photoId: photo.id,
        photo,
        listingId,
        styleKey,
        roomType,
        authUserId: user?.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStagedPath(result.stagedPath);
      setRanDeclutter(!!result.declutteredPath);
      void incrementUsage("staging").then(() =>
        qc.invalidateQueries({ queryKey: ["usage-tracking"] }),
      );
      void qc.invalidateQueries({ queryKey: ["staging-this-month"] });
      if (result.declutteredPath) {
        void qc.invalidateQueries({ queryKey: ["listing-photos"] });
      }
      const { data: signed } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(result.stagedPath, 3600);
      setStagedUrl(signed?.signedUrl ?? null);
    } finally {
      setRunning(false);
    }
  }

  async function keepOriginal() {
    setDiscarding(true);
    try {
      await discardStagedPhoto({ photoId: photo.id, stagedUrl: stagedPath });
      onDiscarded?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to discard staged photo");
    } finally {
      setDiscarding(false);
    }
  }

  function useStaged() {
    if (!stagedPath) return;
    toast.success("Staged version saved.");
    onApplied?.(stagedPath);
    onClose();
  }

  const fullscreenUrl =
    fullscreen === "original" ? origUrl : fullscreen === "staged" ? stagedUrl : null;
  const fullscreenLabel = fullscreen === "original" ? "Original" : "Staged";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
        <div className="relative w-full max-w-2xl max-h-[95dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sofa className="size-4 text-teal" />
              <p className="text-sm font-semibold">
                {view === "style" ? "Choose a style" : "Virtual staging"}
              </p>
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

          {view === "style" ? (
            <div className="p-4">
              <p className="text-xs text-muted-foreground">
                The AI will furnish this room in your chosen style.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {STAGING_STYLES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => chooseStyle(s.key)}
                    className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-teal hover:bg-teal-light"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
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
                  onClick={() => stagedUrl && setFullscreen("staged")}
                  className="relative block w-full aspect-[4/3] overflow-hidden bg-muted"
                >
                  {stagedUrl ? (
                    <img src={stagedUrl} alt="Staged" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center gap-2 text-center text-xs text-muted-foreground">
                      {running ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="size-5 animate-spin text-teal" />
                          <span>
                            {ranDeclutter || !photo.decluttered_url
                              ? "Cleaning up, then staging…"
                              : "Staging…"}
                          </span>
                        </div>
                      ) : error ? (
                        <span className="px-4 text-red-600">{error}</span>
                      ) : (
                        "—"
                      )}
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-teal px-2 py-0.5 text-[10px] font-semibold text-teal-foreground">
                    Staged{chosenStyle ? ` · ${chosenStyle}` : ""}
                  </span>
                  {stagedUrl && (
                    <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                      Tap to enlarge
                    </span>
                  )}
                </button>
              </div>
              {ranDeclutter ? (
                <p className="px-4 pt-2 text-[11px] text-muted-foreground">
                  This photo was cleaned up automatically before staging.
                </p>
              ) : null}

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
                  disabled={!stagedPath || running}
                  onClick={useStaged}
                  className="flex min-h-12 items-center justify-center rounded-lg bg-teal px-3 text-sm font-semibold text-teal-foreground disabled:opacity-60"
                >
                  Use staged
                </button>
              </div>
            </>
          )}
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
                  onClick={() => setFullscreen(fullscreen === "original" ? "staged" : "original")}
                  disabled={fullscreen === "staged" ? !origUrl : !stagedUrl}
                  className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-white/20 text-sm font-semibold text-white disabled:opacity-30"
                >
                  View {fullscreen === "original" ? "Staged" : "Original"}
                </button>
                {fullscreen === "staged" && stagedPath ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFullscreen(null);
                      useStaged();
                    }}
                    className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-teal text-sm font-semibold text-teal-foreground"
                  >
                    <Sofa className="size-4" /> Use staged
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
