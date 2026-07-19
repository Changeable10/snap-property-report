import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Table = "inspection_photos" | "listing_photos";

export function DeletePhotoButton({
  photoId,
  table,
  storagePaths,
  onDeleted,
  className,
}: {
  photoId: string;
  table: Table;
  /** All storage paths to remove (original, enhanced, staged, etc.). Falsy entries are ignored. */
  storagePaths: Array<string | null | undefined>;
  onDeleted?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      const paths = storagePaths.filter((p): p is string => !!p);
      if (paths.length > 0) {
        try {
          await supabase.storage.from("inspection-photos").remove(paths);
        } catch {
          // Non-fatal: continue removing the DB row so the UI clears.
        }
      }
      const { error } = await supabase.from(table).delete().eq("id", photoId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setOpen(false);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Delete photo"
        className={
          className ??
          "absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white shadow backdrop-blur-sm hover:bg-black/75"
        }
      >
        <Trash2 className="size-3.5" />
      </button>
      <AlertDialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the photo from the room. Any items already detected from this
              photo will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}