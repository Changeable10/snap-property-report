import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Bed,
  Bath,
  Home as HomeIcon,
  Building2,
  ClipboardList,
  AlertTriangle,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/property-types";
import { Onboarding, ONBOARDED_KEY } from "@/components/Onboarding";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

type Condition = "good" | "fair" | "poor" | "damaged";
type Priority = "low" | "medium" | "high";
type InspectionStatus = "in_progress" | "completed" | "signed";
type InspectionType = "entry" | "routine" | "exit";

interface PropertyRow {
  id: string;
  address: string;
  suburb: string;
  postcode: string;
  property_type: PropertyType;
  bedrooms: number;
  bathrooms: number;
  created_at: string;
}
interface InspectionRow {
  id: string;
  property_id: string;
  inspection_type: InspectionType;
  inspection_date: string;
  status: InspectionStatus;
}
interface ItemRow {
  id: string;
  inspection_id: string;
  room_id: string;
  item_name: string;
  condition: Condition;
  description: string | null;
  maintenance_required: boolean;
  maintenance_notes: string | null;
  maintenance_priority: Priority;
  maintenance_resolved: boolean;
}
interface RoomRow { id: string; name: string; property_id: string }

const TYPE_LABEL: Record<InspectionType, string> = {
  entry: "Entry", routine: "Routine", exit: "Exit",
};
const STATUS_LABEL: Record<InspectionStatus, string> = {
  in_progress: "In progress", completed: "Completed", signed: "Signed",
};
const STATUS_STYLE: Record<InspectionStatus, string> = {
  in_progress: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
  completed: "bg-teal-light text-teal-dark ring-teal/30",
  signed: "bg-condition-good/15 text-condition-good ring-condition-good/40",
};
const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40",
  medium: "bg-condition-poor/15 text-condition-poor ring-condition-poor/40",
  low: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
};
const COND_BG: Record<Condition, string> = {
  good: "bg-condition-good",
  fair: "bg-condition-fair",
  poor: "bg-condition-poor",
  damaged: "bg-condition-damaged",
};

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
function formatDMY(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}
function formatLongDate(d: Date) {
  return d.toLocaleDateString("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function addMonths(iso: string, months: number) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d;
}
function daysBetween(a: Date, b: Date) {
  const ms = a.setHours(0,0,0,0) - b.setHours(0,0,0,0);
  return Math.round(ms / 86_400_000);
}

function Index() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const displayName =
    (user.user_metadata as { name?: string; full_name?: string } | undefined)?.name ??
    (user.user_metadata as { name?: string; full_name?: string } | undefined)?.full_name ??
    (user.email ? user.email.split("@")[0] : "there");

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,address,suburb,postcode,property_type,bedrooms,bathrooms,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PropertyRow[];
    },
  });

  const { data: inspections } = useQuery({
    queryKey: ["all-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id,property_id,inspection_type,inspection_date,status")
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InspectionRow[];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["all-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspection_items")
        .select("id,inspection_id,room_id,item_name,condition,description,maintenance_required,maintenance_notes,maintenance_priority,maintenance_resolved");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["all-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id,name,property_id");
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
  });

  const now = new Date();

  const hasOnboardedFlag =
    typeof window !== "undefined" && localStorage.getItem(ONBOARDED_KEY) === "true";
  if (
    properties !== undefined &&
    properties.length === 0 &&
    !hasOnboardedFlag &&
    !onboardingDismissed
  ) {
    return (
      <Onboarding
        user={user}
        onFinish={() => {
          setOnboardingDismissed(true);
          queryClient.invalidateQueries({ queryKey: ["properties"] });
        }}
      />
    );
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));

  const latestByProperty = new Map<string, InspectionRow>();
  (inspections ?? []).forEach((ins) => {
    if (!latestByProperty.has(ins.property_id)) latestByProperty.set(ins.property_id, ins);
  });

  // next due (3 months after most recent routine or entry)
  function nextDueFor(propId: string): Date | null {
    const relevant = (inspections ?? []).find(
      (i) => i.property_id === propId && (i.inspection_type === "routine" || i.inspection_type === "entry"),
    );
    if (!relevant) return null;
    return addMonths(relevant.inspection_date, 3);
  }

  const inspectionsDueThisMonth = (properties ?? []).filter((p) => {
    const due = nextDueFor(p.id);
    return due && due >= monthStart && due <= monthEnd;
  }).length;

  const openMaintenance = (items ?? []).filter(
    (i) => i.maintenance_required && !i.maintenance_resolved,
  );
  const completedThisYear = (inspections ?? []).filter(
    (i) => i.status !== "in_progress" && new Date(i.inspection_date) >= yearStart,
  ).length;

  // Actions grouped by property
  const inspectionById = new Map((inspections ?? []).map((i) => [i.id, i]));
  const actionsByProperty = new Map<string, Array<{ item: ItemRow; inspection: InspectionRow }>>();
  openMaintenance.forEach((item) => {
    const ins = inspectionById.get(item.inspection_id);
    if (!ins) return;
    const list = actionsByProperty.get(ins.property_id) ?? [];
    list.push({ item, inspection: ins });
    actionsByProperty.set(ins.property_id, list);
  });

  const recentInspections = (inspections ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-8 pb-4">
        <p className="text-sm text-muted-foreground">{formatLongDate(now)}</p>
        <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-foreground">
          {greetingFor(now)}, {displayName}
        </h1>
      </header>

      <main className="mx-auto max-w-3xl px-5">
        {/* Stat cards */}
        <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            variant="teal"
            icon={<HomeIcon className="size-4" />}
            label="Properties"
            value={properties?.length ?? 0}
          />
          <StatCard
            variant="teal"
            icon={<ClipboardList className="size-4" />}
            label="Due this month"
            value={inspectionsDueThisMonth}
          />
          <StatCard
            variant="warn"
            icon={<Wrench className="size-4" />}
            label="Open maintenance"
            value={openMaintenance.length}
          />
          <StatCard
            variant="muted"
            icon={<CheckCircle2 className="size-4" />}
            label="Completed this year"
            value={completedThisYear}
          />
        </section>

        {/* Actions required */}
        {actionsByProperty.size > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <AlertTriangle className="size-5 text-condition-damaged" />
              Actions required
            </h2>
            <div className="flex flex-col gap-4">
              {Array.from(actionsByProperty.entries()).map(([propId, list]) => {
                const prop = propertyById.get(propId);
                if (!prop) return null;
                return (
                  <div key={propId} className="rounded-2xl border border-border bg-card p-4">
                    <Link
                      to="/property/$id"
                      params={{ id: propId }}
                      className="block text-sm font-semibold text-foreground hover:text-teal"
                    >
                      {prop.address}
                    </Link>
                    <p className="text-xs text-muted-foreground">{prop.suburb}</p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {list.map(({ item, inspection }) => {
                        const room = roomById.get(item.room_id);
                        return (
                          <li key={item.id} className="rounded-xl border border-border/70 bg-background p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">
                                  {item.item_name}
                                  {room ? (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                      · {room.name}
                                    </span>
                                  ) : null}
                                </p>
                                {item.maintenance_notes || item.description ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {item.maintenance_notes ?? item.description}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PRIORITY_STYLE[item.maintenance_priority]}`}
                              >
                                {item.maintenance_priority.toUpperCase()}
                              </span>
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              Flagged {formatDMY(inspection.inspection_date)} · {TYPE_LABEL[inspection.inspection_type]}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Properties grid */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Your properties</h2>
            {properties && properties.length > 0 ? (
              <span className="text-xs text-muted-foreground">{properties.length}</span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(properties ?? []).map((p) => {
              const Icon = p.property_type === "apartment" || p.property_type === "unit" ? Building2 : HomeIcon;
              const latest = latestByProperty.get(p.id);
              const propItems = latest
                ? (items ?? []).filter((i) => i.inspection_id === latest.id)
                : [];
              const counts: Record<Condition, number> = { good: 0, fair: 0, poor: 0, damaged: 0 };
              propItems.forEach((i) => {
                if (counts[i.condition] !== undefined) counts[i.condition]++;
              });
              const total = propItems.length;
              const due = nextDueFor(p.id);
              const dueDiff = due ? daysBetween(new Date(due), new Date()) : null;
              let statusColor = "bg-condition-good";
              let statusText = "Up to date";
              if (dueDiff === null) {
                statusColor = "bg-muted-foreground";
                statusText = "Not inspected";
              } else if (dueDiff < 0) {
                statusColor = "bg-condition-damaged";
                statusText = "Overdue";
              } else if (dueDiff <= 30) {
                statusColor = "bg-condition-fair";
                statusText = "Due soon";
              }

              return (
                <Link
                  key={p.id}
                  to="/property/$id"
                  params={{ id: p.id }}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-teal/40 hover:bg-accent/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal-dark">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-foreground">{p.address}</h3>
                      <p className="truncate text-sm text-muted-foreground">{p.suburb}</p>
                    </div>
                    <span className={`mt-1 size-2.5 shrink-0 rounded-full ${statusColor}`} aria-label={statusText} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
                      {PROPERTY_TYPE_LABEL[p.property_type]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Bed className="size-3.5" />{p.bedrooms}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Bath className="size-3.5" />{p.bathrooms}
                    </span>
                  </div>

                  {total > 0 ? (
                    <div>
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        {(["good","fair","poor","damaged"] as Condition[]).map((c) =>
                          counts[c] > 0 ? (
                            <span
                              key={c}
                              className={`h-full ${COND_BG[c]}`}
                              style={{ width: `${(counts[c] / total) * 100}%` }}
                            />
                          ) : null,
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {counts.good} good · {counts.fair} fair · {counts.poor} poor · {counts.damaged} damaged
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No inspection data yet</p>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {latest
                        ? `Last: ${TYPE_LABEL[latest.inspection_type]} · ${formatDMY(latest.inspection_date)}`
                        : "No inspections yet"}
                    </span>
                    <span>
                      {due ? `Next: ${due.toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}` : "—"}
                    </span>
                  </div>
                </Link>
              );
            })}

            <Link
              to="/property/new"
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-teal/50 hover:text-teal"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-teal-light text-teal-dark">
                <Plus className="size-5" />
              </div>
              Add property
            </Link>
          </div>
        </section>

        {/* Recent inspections */}
        {recentInspections.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Recent inspections</h2>
            <ul className="flex flex-col gap-2">
              {recentInspections.map((ins) => {
                const prop = propertyById.get(ins.property_id);
                const count = (items ?? []).filter((i) => i.inspection_id === ins.id).length;
                const target =
                  ins.status === "in_progress"
                    ? { to: "/inspection/$id/capture" as const }
                    : ins.status === "completed"
                    ? { to: "/inspection/$id/review" as const }
                    : { to: "/inspection/$id/report" as const };
                return (
                  <li key={ins.id}>
                    <Link
                      to={target.to}
                      params={{ id: ins.id }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {prop?.address ?? "Property"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {TYPE_LABEL[ins.inspection_type]} · {formatDMY(ins.inspection_date)} · {count} items
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[ins.status]}`}>
                        {STATUS_LABEL[ins.status]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>

      <BottomNav />
    </div>
  );
}

function StatCard({
  icon, label, value, variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant: "teal" | "warn" | "muted";
}) {
  const styles = {
    teal: "bg-teal text-teal-foreground",
    warn: "bg-condition-poor/10 text-foreground ring-1 ring-inset ring-condition-poor/30",
    muted: "bg-card text-foreground ring-1 ring-inset ring-border",
  }[variant];
  const iconColor = variant === "teal" ? "text-teal-foreground/80" : "text-muted-foreground";
  const labelColor = variant === "teal" ? "text-teal-foreground/80" : "text-muted-foreground";
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-4 shadow-sm ${styles}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${labelColor}`}>
        <span className={iconColor}>{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}