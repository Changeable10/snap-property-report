import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Snapsure" }] }),
  component: CompliancePage,
});

type Status = "in_progress" | "completed" | "signed";

interface Row {
  id: string;
  inspection_date: string;
  status: Status;
  property: { address: string; suburb: string | null } | null;
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

function formatDMY(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

function targetFor(status: Status) {
  if (status === "in_progress") return "/inspection/$id/healthy-homes" as const;
  if (status === "completed") return "/inspection/$id/hh-report" as const;
  return "/inspection/$id/hh-report" as const;
}

function CompliancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id,inspection_date,status,property:properties(address,suburb)")
        .eq("inspection_type", "healthy_homes")
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <PageShell title="Compliance" subtitle="Healthy Homes assessments.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-light text-teal-dark">
            <ShieldCheck className="size-6" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">No Healthy Homes assessments yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((ins) => (
            <li key={ins.id}>
              <Link
                to={targetFor(ins.status)}
                params={{ id: ins.id }}
                className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Healthy Homes assessment
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ins.property?.address ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDMY(ins.inspection_date)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[ins.status]}`}
                  >
                    {STATUS_LABEL[ins.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}