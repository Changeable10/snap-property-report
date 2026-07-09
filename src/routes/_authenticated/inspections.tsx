import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/inspections")({
  head: () => ({ meta: [{ title: "Inspections — Snapsure" }] }),
  component: InspectionsPage,
});

type Status = "in_progress" | "completed" | "signed";
type InspectionType = "entry" | "routine" | "exit";

interface Row {
  id: string;
  inspection_type: InspectionType;
  inspection_date: string;
  status: Status;
  property: { address: string; suburb: string | null } | null;
  item_count: { count: number }[];
}

const STATUS_LABEL: Record<Status, string> = {
  in_progress: "In progress",
  completed: "Completed",
  signed: "Signed",
};
const STATUS_STYLE: Record<Status, string> = {
  in_progress: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
  completed: "bg-teal-light text-teal-dark ring-teal/30",
  signed: "bg-condition-good/15 text-condition-good ring-condition-good/40",
};
const TYPE_LABEL: Record<InspectionType, string> = {
  entry: "Entry",
  routine: "Routine",
  exit: "Exit",
};

function formatDMY(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

function targetFor(status: Status) {
  if (status === "in_progress") return "/inspection/$id/capture" as const;
  if (status === "completed") return "/inspection/$id/review" as const;
  return "/inspection/$id/report" as const;
}

function InspectionsPage() {
  const { data: inspections, isLoading } = useQuery({
    queryKey: ["all-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select(
          "id,inspection_type,inspection_date,status,property:properties(address,suburb),item_count:inspection_items(count)",
        )
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <PageShell
      title="Inspections"
      subtitle="All entry, routine and exit inspections."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !inspections || inspections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-light text-teal-dark">
            <ClipboardList className="size-6" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">No inspections yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {inspections.map((ins) => {
            const count = ins.item_count?.[0]?.count ?? 0;
            return (
              <li key={ins.id}>
                <Link
                  to={targetFor(ins.status)}
                  params={{ id: ins.id }}
                  className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {TYPE_LABEL[ins.inspection_type]} inspection
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ins.property?.address ?? "—"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{formatDMY(ins.inspection_date)}</span>
                        {count > 0 ? (
                          <>
                            <span aria-hidden>•</span>
                            <span>
                              {count} {count === 1 ? "item" : "items"}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[ins.status]}`}
                    >
                      {STATUS_LABEL[ins.status]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}