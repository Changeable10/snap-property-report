import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Mic, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/inspection/$id/capture")({
  head: () => ({ meta: [{ title: "Capture — Snapsure" }] }),
  component: CapturePage,
});

interface Room {
  id: string;
  name: string;
  sort_order: number;
}

function CapturePage() {
  const { id } = Route.useParams();

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, property_id")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", inspection!.property_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });

  const [index, setIndex] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const total = rooms?.length ?? 0;
  const current = rooms?.[index];

  // Mark first room visited once loaded
  useMemo(() => {
    if (current && !visited.has(current.id)) {
      setVisited((prev) => {
        const next = new Set(prev);
        next.add(current.id);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    const url = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [current.id]: url }));
    setDone((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    e.target.value = "";
  }

  function goPrev() {
    setIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    if (!rooms) return;
    const nextIdx = Math.min(rooms.length - 1, index + 1);
    setIndex(nextIdx);
    const nextRoom = rooms[nextIdx];
    if (nextRoom) {
      setVisited((prev) => {
        const next = new Set(prev);
        next.add(nextRoom.id);
        return next;
      });
    }
  }

  const progressPct = total > 0 ? (visited.size / total) * 100 : 0;
  const photo = current ? photos[current.id] : undefined;

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/"
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Exit
          </Link>
          {total > 0 && current ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
                  {current.name}
                </h1>
                <span className="shrink-0 text-sm font-medium text-muted-foreground">
                  {index + 1} of {total}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-teal-light">
                <div
                  className="h-full bg-teal transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <h1 className="text-xl font-bold tracking-tight text-foreground">Loading…</h1>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!current}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-base font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
        >
          <Camera className="size-5" />
          Capture photo
        </button>

        {photo ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <img src={photo} alt="Captured" className="h-48 w-full object-cover" />
          </div>
        ) : null}

        <button
          type="button"
          disabled
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-base font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
        >
          <Mic className="size-5" />
          Describe this room
        </button>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Detected items</h2>
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            AI-detected items will appear here after you capture a photo and voice note.
          </div>
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-teal disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
            Previous
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {done.size} of {total} done
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={!rooms || index >= (rooms.length - 1)}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-4" />
          </button>
        </div>
      </nav>
    </div>
  );
}