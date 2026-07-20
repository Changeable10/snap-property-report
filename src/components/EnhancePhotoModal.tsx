import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { enhancePhoto, discardEnhancement } from "@/lib/enhance-photo.functions";
import { usePlan } from "@/lib/use-plan";
import {
  useMonthlyUsage,
  incrementUsage,
  ENHANCEMENT_LIMIT,
  currentMonthLabel,
} from "@/lib/use-usage";
import { useQueryClient } from "@tanstack/react-query";

type Table = "inspection_photos" | "listing_photos";

interface Props {
  open: boolean;
  onClose: () => void;
  photoId: string;
  photoPath: string;
  table: Table;
  onApplied?: (enhancedPath: string) => void;
  onDiscarded?: () => void;
}

/**
 * AI photo enhancement modal. Shows a side-by-side Original / Enhanced
 * comparison. On mount runs the enhance server fn; the row's `enhanced_url`
 * is written server-side. User can Use enhanced (keep) or Keep original
 * (discard & clear).
 */
export function EnhancePhotoModal({
  open,
  onClose,
  photoId,
  photoPath,
  table,
  onApplied,
  onDiscarded,
}: Props) {
  const enhance = useServerFn(enhancePhoto);
  const discard = useServerFn(discardEnhancement);
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);
  const { data: plan } = usePlan(userId);
  const { data: used = 0 } = useMonthlyUsage(userId, "enhancement");
  const limit = plan ? ENHANCEMENT_LIMIT[plan] : 0;
  const atLimit = Number.isFinite(limit) && used >= limit;
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [enhUrl, setEnhUrl] = useState<string | null>(null);
  const [enhancedPath, setEnhancedPath] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (atLimit) return;
    let cancelled = false;
    setError(null);
    setEnhUrl(null);
    setEnhancedPath(null);
    (async () => {
      const { data } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(photoPath, 3600);
      if (!cancelled) setOrigUrl(data?.signedUrl ?? null);
    })();
    (async () => {
      setRunning(true);
      try {
        const res = await enhance({ data: { photoId, photoPath, table } });
        if (cancelled) return;
        if (res.unchanged || !res.enhancedPath) {
          toast.success("Photo already looks good — no enhancement needed.");
          onClose();
          return;
        }
        setEnhancedPath(res.enhancedPath);
        void incrementUsage("enhancement").then(() =>
          qc.invalidateQueries({ queryKey: ["usage-tracking"] }),
        );
        const { data: signed } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(res.enhancedPath, 3600);
        if (!cancelled) setEnhUrl(signed?.signedUrl ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Enhancement failed");
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoId, photoPath, table, atLimit]);

  if (!open) return null;

  async function keepOriginal() {
    setDiscarding(true);
    try {
      await discard({ data: { photoId, table } });
      onDiscarded?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to discard enhancement");
    } finally {
      setDiscarding(false);
    }
  }

  function useEnhanced() {
    if (!enhancedPath) return;
    toast.success("Enhanced photo saved.");
    onApplied?.(enhancedPath);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-teal" />
            <p className="text-sm font-semibold">AI photo enhancement</p>
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
        {atLimit ? (
          <div className="p-6 text-center text-sm">
            <p className="font-semibold text-foreground">
              You've used all {limit} enhancements this month.
            </p>
            <p className="mt-1 text-muted-foreground">
              Upgrade your plan for more monthly enhancements.
            </p>
            <TopUpEnhancement />
            <button
              type="button"
              onClick={onClose}
              className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="relative aspect-square overflow-hidden bg-muted">
            {origUrl ? (
              <img src={origUrl} alt="Original" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-xs text-muted-foreground">Loading…</div>
            )}
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
              Original
            </span>
          </div>
          <div className="relative aspect-square overflow-hidden bg-muted">
            {enhUrl ? (
              <img src={enhUrl} alt="Enhanced" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center gap-2 text-center text-xs text-muted-foreground">
                {running ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-5 animate-spin text-teal" />
                    <span>Enhancing…</span>
                  </div>
                ) : error ? (
                  <span className="px-4 text-red-600">{error}</span>
                ) : (
                  "—"
                )}
              </div>
            )}
            <span className="absolute left-2 top-2 rounded bg-teal px-2 py-0.5 text-[10px] font-semibold text-teal-foreground">
              Enhanced
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3">
          <button
            type="button"
            disabled={discarding}
            onClick={keepOriginal}
            className="flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            {discarding ? <Loader2 className="size-4 animate-spin" /> : "Keep original"}
          </button>
          <button
            type="button"
            disabled={!enhancedPath || running}
            onClick={useEnhanced}
            className="flex min-h-11 items-center justify-center rounded-lg bg-teal px-3 text-sm font-semibold text-teal-foreground disabled:opacity-60"
          >
            Use enhanced
          </button>
        </div>
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
          {Number.isFinite(limit)
            ? `${used} of ${limit} enhancements used — ${currentMonthLabel()}`
            : `Unlimited enhancements — ${currentMonthLabel()}`}
        </p>
          </>
        )}
      </div>
    </div>
  );
}