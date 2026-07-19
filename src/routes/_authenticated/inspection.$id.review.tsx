import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Pencil, RefreshCw, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConditionBadge } from "@/components/ConditionBadge";
import type { Condition } from "@/lib/parse-transcript";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inspection/$id/review")({
  head: () => ({ meta: [{ title: "Review — Snapsure" }] }),
  component: ReviewPage,
});

interface Room { id: string; name: string; sort_order: number }
interface ItemRow {
  id: string; room_id: string; item_name: string;
  condition: Condition; description: string | null;
  maintenance_required: boolean; maintenance_notes: string | null;
}
type ChangeSeverity = "none" | "minor" | "moderate" | "significant";
interface AcceptedChange {
  id: string; room_id: string; item_name: string; description: string | null;
  severity: ChangeSeverity;
}
const SEV_BADGE: Record<ChangeSeverity, string> = {
  none: "bg-green-600 text-white",
  minor: "bg-amber-500 text-white",
  moderate: "bg-orange-500 text-white",
  significant: "bg-red-600 text-white",
};
const SEV_LABEL: Record<ChangeSeverity, string> = {
  none: "None", minor: "Minor", moderate: "Moderate", significant: "Significant",
};

const CONDITIONS: Condition[] = ["good", "fair", "poor", "damaged"];
const COND_LABEL: Record<Condition, string> = {
  good: "Good", fair: "Fair", poor: "Poor", damaged: "Damaged",
};
const COND_BG: Record<Condition, string> = {
  good: "bg-condition-good",
  fair: "bg-condition-fair",
  poor: "bg-condition-poor",
  damaged: "bg-condition-damaged",
};

function ReviewPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [gate, setGate] = useState<null | "empty" | "partial">(null);

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, property_id, status, completed_at")
        .eq("id", id).single();
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

  const { data: items } = useQuery({
    queryKey: ["inspection-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description,maintenance_required,maintenance_notes")
        .eq("inspection_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: acceptedChanges } = useQuery({
    queryKey: ["comparison-photo-changes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("comparison_results")
        .select("id, room_id, item_name, description, severity, status, changes_detected")
        .eq("inspection_id", id)
        .eq("status", "confirmed")
        .not("changes_detected", "is", null);
      if (error) throw error;
      return (data ?? []) as AcceptedChange[];
    },
  });

  const changesByRoom = useMemo(() => {
    const m = new Map<string, AcceptedChange[]>();
    for (const c of acceptedChanges ?? []) {
      const arr = m.get(c.room_id) ?? [];
      arr.push(c);
      m.set(c.room_id, arr);
    }
    return m;
  }, [acceptedChanges]);

  // Note: inspection status is only marked "completed" when the user explicitly
  // taps "Generate report" — not merely by opening the review screen.

  const counts = useMemo(() => {
    const c: Record<Condition, number> = { good: 0, fair: 0, poor: 0, damaged: 0 };
    for (const it of items ?? []) {
      if (it.condition && it.condition in c) c[it.condition]++;
    }
    return c;
  }, [items]);

  const totalItems = (items ?? []).length;
  const roomsWithItems = useMemo(() => {
    const s = new Set<string>();
    for (const it of items ?? []) s.add(it.room_id);
    return s;
  }, [items]);

  const maintenanceItems = useMemo(
    () => (items ?? []).filter((i) => i.maintenance_required),
    [items],
  );

  const roomsById = useMemo(() => {
    const m = new Map<string, Room>();
    for (const r of rooms ?? []) m.set(r.id, r);
    return m;
  }, [rooms]);

  const itemsByRoom = useMemo(() => {
    const m = new Map<string, ItemRow[]>();
    for (const it of items ?? []) {
      const arr = m.get(it.room_id) ?? [];
      arr.push(it);
      m.set(it.room_id, arr);
    }
    return m;
  }, [items]);

  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [openChanges, setOpenChanges] = useState<Set<string>>(new Set());

  const toggleChanges = (roomId: string) => {
    setOpenChanges((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const totalRooms = rooms?.length ?? 0;
  const emptyRoomCount = Math.max(0, totalRooms - roomsWithItems.size);

  async function markCompletedIfNeeded() {
    if (!inspection) return;
    if (inspection.status === "completed" || inspection.status === "signed") return;
    const { error } = await supabase.from("inspections")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["inspection", id] });
  }

  async function handleGenerate() {
    if (totalItems === 0) {
      setGate("empty");
      return;
    }
    if (emptyRoomCount > 0) {
      setGate("partial");
      return;
    }
    await markCompletedIfNeeded();
    navigate({ to: "/inspection/$id/report", params: { id } });
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link to="/inspection/$id/capture" params={{ id }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Review inspection</h1>
          <p className="mt-1 text-sm text-muted-foreground">Check the AI-structured notes before generating the report.</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Items inspected" value={totalItems} />
          <StatCard label="Rooms completed" value={`${roomsWithItems.size} / ${rooms?.length ?? 0}`} />
        </div>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {CONDITIONS.map((c) => {
              const pct = totalItems > 0 ? (counts[c] / totalItems) * 100 : 0;
              if (pct === 0) return null;
              return <span key={c} className={COND_BG[c]} style={{ width: `${pct}%` }} />;
            })}
          </div>
          <ul className="mt-4 space-y-2">
            {CONDITIONS.map((c) => (
              <li key={c} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={`inline-block size-2.5 rounded-full ${COND_BG[c]}`} />
                  <span className="font-medium text-foreground">{COND_LABEL[c]}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">{counts[c]}</span>
              </li>
            ))}
          </ul>
        </section>

        {maintenanceItems.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wrench className="size-4 text-condition-poor" /> Maintenance required
            </h2>
            <ul className="space-y-2">
              {maintenanceItems.map((it) => (
                <li key={it.id} className="rounded-xl border border-border bg-card p-3 border-l-4 border-l-condition-poor">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">{roomsById.get(it.room_id)?.name ?? "Room"}</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">{it.item_name}</p>
                      {it.maintenance_notes && (
                        <p className="mt-1 text-xs text-muted-foreground">{it.maintenance_notes}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-condition-poor/15 px-2 py-0.5 text-[11px] font-semibold text-condition-poor ring-1 ring-inset ring-condition-poor/30">
                      Priority
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Rooms</h2>
          <ul className="space-y-2">
            {(rooms ?? []).map((r) => {
              const roomItems = itemsByRoom.get(r.id) ?? [];
              const rc: Record<Condition, number> = { good: 0, fair: 0, poor: 0, damaged: 0 };
              for (const it of roomItems) {
                if (it.condition && it.condition in rc) rc[it.condition]++;
              }
              const open = openRoom === r.id;
              return (
                <li key={r.id} className="overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setOpenRoom(open ? null : r.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {roomItems.length} {roomItems.length === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {CONDITIONS.map((c) => rc[c] > 0 ? (
                        <span key={c} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${COND_BG[c]}`}>
                          {rc[c]}
                        </span>
                      ) : null)}
                    </div>
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <ul className="border-t border-border divide-y divide-border">
                      {roomItems.length === 0 ? (
                        <li className="px-4 py-3 text-xs text-muted-foreground">No items captured for this room.</li>
                      ) : roomItems.map((it) => (
                        <ReviewItemRow key={it.id} item={it}
                          onEdited={() => qc.invalidateQueries({ queryKey: ["inspection-items", id] })} />
                      ))}
                      {(changesByRoom.get(r.id)?.length ?? 0) > 0 && (
                        <li className="border-t border-border px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleChanges(r.id)}
                            className="mb-2 flex w-full items-center justify-between text-left"
                          >
                            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <RefreshCw className="size-3.5" />
                              Changes from previous inspection
                            </span>
                            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${openChanges.has(r.id) ? "rotate-180" : ""}`} />
                          </button>
                          {openChanges.has(r.id) && (
                            <ul className="space-y-2">
                              {(changesByRoom.get(r.id) ?? []).map((c) => (
                                <li key={c.id} className="rounded-lg border border-border bg-background p-2.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_BADGE[c.severity]}`}>
                                      {SEV_LABEL[c.severity]}
                                    </span>
                                    <p className="text-sm font-semibold text-foreground">{c.item_name}</p>
                                  </div>
                                  {c.description && (
                                    <p className="mt-1.5 text-xs text-muted-foreground">{c.description}</p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link to="/inspection/$id/capture" params={{ id }}
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-card text-sm font-semibold text-foreground">
            Edit
          </Link>
          <button type="button" onClick={handleGenerate}
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-teal text-sm font-semibold text-teal-foreground hover:bg-teal-dark">
            Generate report
          </button>
        </div>
      </nav>

      {gate !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"
          onClick={() => setGate(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {gate === "empty" ? (
              <>
                <h3 className="text-base font-semibold text-foreground">No inspection data captured</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  At least one room must have photos, voice notes, or manually added items before generating a report. Return to the inspection to capture data.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <Link
                    to="/inspection/$id/capture"
                    params={{ id }}
                    className="flex min-h-11 items-center justify-center rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark"
                  >
                    Return to inspection
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-foreground">Some rooms have no data</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {emptyRoomCount} of {totalRooms} rooms have no inspection data. Generate report anyway?
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setGate(null)}
                    className="min-h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground"
                  >
                    Go back
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setGate(null);
                      await markCompletedIfNeeded();
                      navigate({ to: "/inspection/$id/report", params: { id } });
                    }}
                    className="min-h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function ReviewItemRow({ item, onEdited }: { item: ItemRow; onEdited: () => void }) {
  const [editing, setEditing] = useState(false);
  const [condition, setCondition] = useState<Condition>(item.condition);
  const [description, setDescription] = useState(item.description ?? "");

  async function save() {
    const { error } = await supabase.from("inspection_items")
      .update({ condition, description })
      .eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setEditing(false);
    onEdited();
  }

  if (editing) {
    return (
      <li className="space-y-2 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{item.item_name}</p>
        <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm">
          {CONDITIONS.map((c) => <option key={c} value={c}>{COND_LABEL[c]}</option>)}
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground">Cancel</button>
          <button onClick={save} className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-teal-foreground">Save</button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-full ${COND_BG[item.condition]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{item.item_name}</p>
          <ConditionBadge condition={item.condition} />
        </div>
        {item.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.description}</p>
        )}
      </div>
      <button onClick={() => setEditing(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
        <Pencil className="size-4" />
      </button>
    </li>
  );
}