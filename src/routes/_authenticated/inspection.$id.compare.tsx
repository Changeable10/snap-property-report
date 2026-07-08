import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Check, X, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConditionBadge } from "@/components/ConditionBadge";
import type { Condition } from "@/lib/parse-transcript";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inspection/$id/compare")({
  head: () => ({ meta: [{ title: "Compare — Snapsure" }] }),
  component: ComparePage,
});

type ChangeType = "new" | "removed" | "deterioration" | "improvement" | "new_damage" | "repair";
type Severity = "minor" | "moderate" | "significant";
type Status = "pending" | "confirmed" | "dismissed";

interface Room { id: string; name: string; sort_order: number }
interface ItemRow {
  id: string; room_id: string; item_name: string;
  condition: Condition; description: string | null;
}
interface PhotoRow { id: string; room_id: string; photo_url: string; inspection_id: string }
interface ComparisonRow {
  id: string; room_id: string; item_name: string; description: string | null;
  change_type: ChangeType; severity: Severity; status: Status;
  previous_condition: Condition | null; current_condition: Condition | null;
}

const CONDITION_RANK: Record<Condition, number> = { good: 0, fair: 1, poor: 2, damaged: 3 };

const CHANGE_LABEL: Record<ChangeType, string> = {
  new: "New item",
  removed: "Removed",
  deterioration: "Deterioration",
  improvement: "Improvement",
  new_damage: "New damage",
  repair: "Repair",
};

const CHANGE_COLOR: Record<ChangeType, string> = {
  new: "bg-condition-poor/15 text-condition-poor ring-condition-poor/40",
  removed: "bg-muted text-muted-foreground ring-border",
  deterioration: "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40",
  improvement: "bg-condition-good/15 text-condition-good ring-condition-good/40",
  new_damage: "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40",
  repair: "bg-condition-good/15 text-condition-good ring-condition-good/40",
};

const SEVERITY_BG: Record<Severity, string> = {
  minor: "bg-condition-fair text-white",
  moderate: "bg-condition-poor text-white",
  significant: "bg-condition-damaged text-white",
};

function fmtDate(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

function useSignedUrl(path: string | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancel = false;
    if (!path) { setUrl(undefined); return; }
    supabase.storage.from("inspection-photos").createSignedUrl(path, 3600)
      .then(({ data }) => { if (!cancel) setUrl(data?.signedUrl); });
    return () => { cancel = true; };
  }, [path]);
  return url;
}

function ComparePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id,property_id,user_id,inspection_date,inspection_type")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: previous } = useQuery({
    queryKey: ["previous-inspection", inspection?.property_id, id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id,inspection_date,status")
        .eq("property_id", inspection!.property_id)
        .neq("id", id)
        .in("status", ["completed", "signed"])
        .order("inspection_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", inspection!.property_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });

  const { data: currentItems } = useQuery({
    queryKey: ["inspection-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description")
        .eq("inspection_id", id);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: previousItems } = useQuery({
    queryKey: ["inspection-items", previous?.id],
    enabled: !!previous?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description")
        .eq("inspection_id", previous!.id);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["compare-photos", id, previous?.id],
    enabled: !!previous?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_photos")
        .select("id,room_id,photo_url,inspection_id")
        .in("inspection_id", [id, previous!.id]);
      if (error) throw error;
      return (data ?? []) as PhotoRow[];
    },
  });

  const { data: comparisons } = useQuery({
    queryKey: ["comparisons", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("comparison_results")
        .select("id,room_id,item_name,description,change_type,severity,status,previous_condition,current_condition")
        .eq("inspection_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComparisonRow[];
    },
  });

  // Auto-detect and persist comparisons once when both datasets loaded and none exist.
  const [detected, setDetected] = useState(false);
  useEffect(() => {
    if (detected) return;
    if (!inspection || !previous || !currentItems || !previousItems || !comparisons) return;
    if (comparisons.length > 0) { setDetected(true); return; }

    const rows: Array<{
      user_id: string; inspection_id: string; room_id: string;
      item_name: string; description: string | null;
      change_type: ChangeType; severity: Severity;
      previous_condition: Condition | null; current_condition: Condition | null;
    }> = [];

    const prevByKey = new Map<string, ItemRow>();
    for (const p of previousItems) prevByKey.set(`${p.room_id}::${p.item_name.toLowerCase()}`, p);
    const currByKey = new Map<string, ItemRow>();
    for (const c of currentItems) currByKey.set(`${c.room_id}::${c.item_name.toLowerCase()}`, c);

    for (const c of currentItems) {
      const key = `${c.room_id}::${c.item_name.toLowerCase()}`;
      const prev = prevByKey.get(key);
      if (!prev) {
        const isDamage = c.condition === "poor" || c.condition === "damaged";
        rows.push({
          user_id: inspection.user_id, inspection_id: id, room_id: c.room_id,
          item_name: c.item_name, description: c.description,
          change_type: isDamage ? "new_damage" : "new",
          severity: c.condition === "damaged" ? "significant" : c.condition === "poor" ? "moderate" : "minor",
          previous_condition: null, current_condition: c.condition,
        });
      } else {
        const dp = CONDITION_RANK[c.condition] - CONDITION_RANK[prev.condition];
        if (dp > 0) {
          rows.push({
            user_id: inspection.user_id, inspection_id: id, room_id: c.room_id,
            item_name: c.item_name, description: c.description,
            change_type: c.condition === "damaged" ? "new_damage" : "deterioration",
            severity: dp >= 2 ? "significant" : c.condition === "damaged" ? "significant" : "moderate",
            previous_condition: prev.condition, current_condition: c.condition,
          });
        } else if (dp < 0) {
          rows.push({
            user_id: inspection.user_id, inspection_id: id, room_id: c.room_id,
            item_name: c.item_name, description: c.description,
            change_type: prev.condition === "damaged" ? "repair" : "improvement",
            severity: "minor",
            previous_condition: prev.condition, current_condition: c.condition,
          });
        }
      }
    }
    for (const p of previousItems) {
      const key = `${p.room_id}::${p.item_name.toLowerCase()}`;
      if (!currByKey.has(key)) {
        rows.push({
          user_id: inspection.user_id, inspection_id: id, room_id: p.room_id,
          item_name: p.item_name, description: p.description,
          change_type: "removed", severity: "moderate",
          previous_condition: p.condition, current_condition: null,
        });
      }
    }

    setDetected(true);
    if (rows.length === 0) return;
    supabase.from("comparison_results").insert(rows).then(({ error }) => {
      if (error) toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["comparisons", id] });
    });
  }, [detected, inspection, previous, currentItems, previousItems, comparisons, id, qc]);

  const [roomIndex, setRoomIndex] = useState(0);
  const room = rooms?.[roomIndex];
  const total = rooms?.length ?? 0;
  const progressPct = total > 0 ? ((roomIndex + 1) / total) * 100 : 0;

  const roomComparisons = useMemo(
    () => (comparisons ?? []).filter((c) => c.room_id === room?.id),
    [comparisons, room?.id],
  );
  const prevPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.room_id === room?.id && p.inspection_id === previous?.id),
    [photos, room?.id, previous?.id],
  );
  const currPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.room_id === room?.id && p.inspection_id === id),
    [photos, room?.id, id],
  );

  const totals = useMemo(() => {
    const t = { confirmed: 0, dismissed: 0, pending: 0 };
    for (const c of comparisons ?? []) t[c.status]++;
    return t;
  }, [comparisons]);

  const pendingCount = roomComparisons.filter((c) => c.status === "pending").length;

  async function updateStatus(rowId: string, status: Status) {
    const { error } = await supabase.from("comparison_results")
      .update({ status }).eq("id", rowId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["comparisons", id] });
  }

  async function acceptAll() {
    const ids = roomComparisons.filter((c) => c.status === "pending").map((c) => c.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("comparison_results")
      .update({ status: "confirmed" }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["comparisons", id] });
  }

  function goPrev() { setRoomIndex((i) => Math.max(0, i - 1)); }
  function goNext() {
    if (!rooms) return;
    if (roomIndex >= rooms.length - 1) {
      navigate({ to: "/inspection/$id/review", params: { id } });
      return;
    }
    setRoomIndex((i) => Math.min(rooms.length - 1, i + 1));
  }

  // No previous inspection → nothing to compare.
  if (previous === null) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-md">
          <Link to="/inspection/$id/capture" params={{ id }} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-teal">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No previous inspection found for this property. Comparison is only available for follow-up inspections.
          </div>
          <Link
            to="/inspection/$id/review" params={{ id }}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground"
          >
            Continue to review
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link to="/inspection/$id/capture" params={{ id }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
              {room?.name ?? "Comparison"}
            </h1>
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              {total ? `${roomIndex + 1} of ${total}` : ""}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-teal-light">
            <div className="h-full bg-teal transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          {pendingCount > 1 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button" onClick={acceptAll}
                className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-teal-foreground"
              >
                Accept all ({pendingCount})
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6 space-y-6">
        <section className="space-y-3">
          <SplitPane
            label="Previous inspection"
            date={previous ? fmtDate(previous.inspection_date) : "—"}
            photos={prevPhotos}
          />
          <SplitPane
            label="Current"
            date={inspection ? fmtDate(inspection.inspection_date) : "—"}
            photos={currPhotos}
          />
        </section>

        <div>
          {roomComparisons.length === 0 ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-condition-good/15 px-3 py-1.5 text-xs font-semibold text-condition-good ring-1 ring-condition-good/40">
              <Check className="size-3.5" /> No changes detected
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-light px-3 py-1.5 text-xs font-semibold text-teal-dark">
              {roomComparisons.length} change{roomComparisons.length === 1 ? "" : "s"} detected
            </div>
          )}
        </div>

        <ul className="space-y-3">
          {roomComparisons.map((c, i) => (
            <ChangeCard
              key={c.id} row={c} index={i + 1}
              onConfirm={() => updateStatus(c.id, "confirmed")}
              onDismiss={() => updateStatus(c.id, "dismissed")}
            />
          ))}
        </ul>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button type="button" onClick={goPrev} disabled={roomIndex === 0}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-teal disabled:opacity-40">
            <ChevronLeft className="size-4" /> Previous room
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {totals.confirmed} confirmed · {totals.dismissed} dismissed
          </span>
          <button type="button" onClick={goNext} disabled={!rooms}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-40">
            {rooms && roomIndex >= rooms.length - 1 ? "Finish" : "Next room"} <ChevronRight className="size-4" />
          </button>
        </div>
      </nav>
    </div>
  );
}

function SplitPane({ label, date, photos }: { label: string; date: string; photos: PhotoRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xs font-medium text-foreground">{date}</span>
      </div>
      {photos.length === 0 ? (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ImageOff className="size-6" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.slice(0, 4).map((p) => <ComparePhoto key={p.id} path={p.photo_url} />)}
        </div>
      )}
    </div>
  );
}

function ComparePhoto({ path }: { path: string }) {
  const url = useSignedUrl(path);
  return (
    <div className="aspect-square overflow-hidden rounded-lg border border-border bg-muted">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

function ChangeCard({
  row, index, onConfirm, onDismiss,
}: {
  row: ComparisonRow; index: number;
  onConfirm: () => void; onDismiss: () => void;
}) {
  const confirmed = row.status === "confirmed";
  const dismissed = row.status === "dismissed";
  return (
    <li
      className={[
        "rounded-2xl border bg-card p-4 transition-opacity",
        confirmed ? "border-teal ring-1 ring-teal" : "border-border",
        dismissed ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${SEVERITY_BG[row.severity]}`}>
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{row.item_name}</p>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CHANGE_COLOR[row.change_type]}`}>
              {CHANGE_LABEL[row.change_type]}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${SEVERITY_BG[row.severity]}`}>
              {row.severity}
            </span>
          </div>
          {row.description && (
            <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs">
            {row.previous_condition
              ? <ConditionBadge condition={row.previous_condition} />
              : <span className="text-muted-foreground">—</span>}
            <ArrowRight className="size-3.5 text-muted-foreground" />
            {row.current_condition
              ? <ConditionBadge condition={row.current_condition} />
              : <span className="text-muted-foreground">—</span>}
          </div>
        </div>
      </div>
      {!confirmed && !dismissed && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onDismiss}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
            <X className="size-3.5" /> Dismiss
          </button>
          <button type="button" onClick={onConfirm}
            className="inline-flex items-center gap-1 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-teal-foreground">
            <Check className="size-3.5" /> Confirm
          </button>
        </div>
      )}
    </li>
  );
}