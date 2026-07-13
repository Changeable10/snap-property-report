import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Wrench, Download } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { usePlan } from "@/lib/use-plan";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  buildMaintenanceCsv,
  downloadCsv,
  todayStamp,
  type MaintenanceExportRow,
} from "@/lib/csv-export";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — Snapsure" }] }),
  component: MaintenancePage,
});

type Priority = "high" | "medium" | "low";
type InspectionType = "entry" | "routine" | "exit" | "healthy_homes";

interface MaintRow {
  id: string;
  item_name: string;
  description: string | null;
  maintenance_notes: string | null;
  maintenance_priority: Priority;
  maintenance_resolved: boolean;
  maintenance_resolved_at: string | null;
  created_at: string;
  room: { name: string } | null;
  inspection: {
    inspection_type: InspectionType;
    property: { address: string; suburb: string | null; city: string | null } | null;
  } | null;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40",
  medium: "bg-condition-poor/15 text-condition-poor ring-condition-poor/40",
  low: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
};
const TYPE_LABEL: Record<InspectionType, string> = {
  entry: "Entry",
  routine: "Routine",
  exit: "Exit",
  healthy_homes: "Healthy Homes",
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return d.split("T")[0];
}

function MaintenancePage() {
  const { user } = Route.useRouteContext();
  const { data: plan } = usePlan(user.id);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["maintenance-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspection_items")
        .select(
          "id,item_name,description,maintenance_notes,maintenance_priority,maintenance_resolved,maintenance_resolved_at,created_at,room:rooms(name),inspection:inspections(inspection_type,property:properties(address,suburb,city))",
        )
        .eq("maintenance_required", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MaintRow[];
    },
  });

  function handleExport() {
    if (!plan || plan === "free") {
      setShowUpgrade(true);
      return;
    }
    const rows: MaintenanceExportRow[] = (items ?? []).map((it) => ({
      property_address: it.inspection?.property?.address ?? "",
      room: it.room?.name ?? "",
      item: it.item_name,
      issue: it.maintenance_notes ?? it.description ?? "",
      priority: it.maintenance_priority,
      status: it.maintenance_resolved ? "Resolved" : "Open",
      date_flagged: formatDate(it.created_at),
      date_resolved: formatDate(it.maintenance_resolved_at),
      inspection_type: it.inspection?.inspection_type ?? "",
    }));
    if (rows.length === 0) {
      toast.info("Nothing to export");
      return;
    }
    downloadCsv(`snapsure-maintenance-export-${todayStamp()}.csv`, buildMaintenanceCsv(rows));
    toast.success("Maintenance CSV downloaded");
  }

  return (
    <PageShell title="Maintenance" subtitle="All flagged maintenance items across your properties.">
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent"
        >
          <Download className="size-4" /> Export
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !items || items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-light text-teal-dark">
            <Wrench className="size-6" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">No maintenance items</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const address = it.inspection?.property?.address ?? "—";
            const room = it.room?.name ?? "—";
            const issue = it.maintenance_notes ?? it.description ?? "";
            const resolved = it.maintenance_resolved;
            return (
              <li
                key={it.id}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {it.item_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {address} · {room}
                    </p>
                    {issue ? (
                      <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{issue}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Flagged {formatDate(it.created_at)}</span>
                      {resolved && it.maintenance_resolved_at ? (
                        <>
                          <span aria-hidden>•</span>
                          <span>Resolved {formatDate(it.maintenance_resolved_at)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PRIORITY_STYLE[it.maintenance_priority]}`}
                    >
                      {it.maintenance_priority}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                        resolved
                          ? "bg-condition-good/15 text-condition-good ring-condition-good/40"
                          : "bg-condition-fair/15 text-condition-fair ring-condition-fair/40"
                      }`}
                    >
                      {resolved ? "Resolved" : "Open"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </PageShell>
  );
}