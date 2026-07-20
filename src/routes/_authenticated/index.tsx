import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Plus,
  Bed,
  Bath,
  Home as HomeIcon,
  Building2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/property-types";
import { Onboarding, ONBOARDED_KEY } from "@/components/Onboarding";
import { UpgradeModal } from "@/components/UpgradeModal";
import { usePlan, usePropertyCount, PLAN_LIMITS } from "@/lib/use-plan";

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

interface ListingFeedRow {
  id: string;
  property_id: string;
  listing_type: string;
  target_portal: string;
  status: "draft" | "published";
  created_at: string;
  title: string | null;
}

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

const LISTING_TYPE_LABEL: Record<string, string> = {
  for_rent: "For Rent",
  for_sale: "For Sale",
  holiday: "Holiday",
  development: "Development",
  // Legacy fallbacks
  rent: "For Rent",
  sale: "For Sale",
  short_stay: "Short Stay",
};
const PORTAL_LABEL: Record<string, string> = {
  trademe: "Trade Me",
  realestate: "realestate.co.nz",
  airbnb: "Airbnb / Bookabach",
  general: "General",
};
const LISTING_STATUS_STYLE: Record<"draft" | "published", string> = {
  draft: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
  published: "bg-condition-good/15 text-condition-good ring-condition-good/40",
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
  const navigate = useNavigate();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [openSections, setOpenSections] = useState({
    actions: false,
    properties: true,
    recent: false,
  });
  const toggleSection = (key: keyof typeof openSections) => () =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  const { data: plan } = usePlan(user.id);
  const { data: ownPropertyCount } = usePropertyCount(user.id);
  const rawName =
    (user.user_metadata as { name?: string; full_name?: string; display_name?: string } | undefined)?.display_name ??
    (user.user_metadata as { name?: string; full_name?: string } | undefined)?.name ??
    (user.user_metadata as { name?: string; full_name?: string } | undefined)?.full_name ??
    (user.email ? user.email.split("@")[0] : "there");
  const displayName = (rawName as string)
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,address,suburb,postcode,property_type,bedrooms,bathrooms,created_at")
        .is("archived_at", null)
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

  const { data: listings } = useQuery({
    queryKey: ["all-listings-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id,property_id,listing_type,target_portal,status,created_at,title")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ListingFeedRow[];
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

  type FeedEntry =
    | { kind: "inspection"; date: string; ins: InspectionRow }
    | { kind: "listing"; date: string; listing: ListingFeedRow };
  const feed: FeedEntry[] = [
    ...(inspections ?? []).map((ins) => ({
      kind: "inspection" as const,
      date: ins.inspection_date,
      ins,
    })),
    ...(listings ?? []).map((listing) => ({
      kind: "listing" as const,
      date: listing.created_at,
      listing,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{formatLongDate(now)}</p>
        <h1 className="mt-0.5 truncate text-3xl font-extrabold tracking-tight text-foreground">
          {greetingFor(now)}, {displayName}
        </h1>
      </header>

      <div>
        {/* Stat cards */}
        <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Properties"
            value={properties?.length ?? 0}
          />
          <StatCard
            label="Due this month"
            value={inspectionsDueThisMonth}
          />
          <StatCard
            label="Open maintenance"
            value={openMaintenance.length}
          />
          <StatCard
            label="Completed this year"
            value={completedThisYear}
          />
        </section>

        {/* Your Properties */}
        <CollapsibleSection
          title="Your properties"
          count={properties?.length ?? 0}
          icon={<HomeIcon className="size-5 text-primary" />}
          isOpen={openSections.properties}
          onToggle={toggleSection("properties")}
        >
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

            <button
              type="button"
              onClick={() => {
                const limit = PLAN_LIMITS[plan ?? "free"];
                const count = ownPropertyCount ?? properties?.length ?? 0;
                if (count >= limit) {
                  setUpgradeOpen(true);
                } else {
                  navigate({ to: "/property/new" });
                }
              }}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-teal/50 hover:text-teal"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-teal-light text-teal-dark">
                <Plus className="size-5" />
              </div>
              Add property
            </button>
          </div>
        </CollapsibleSection>

        {/* Actions Required */}
        {actionsByProperty.size > 0 ? (
          <CollapsibleSection
            title="Actions required"
            count={openMaintenance.length}
            isOpen={openSections.actions}
            onToggle={toggleSection("actions")}
          >
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
          </CollapsibleSection>
        ) : null}

        {/* Recent Inspections & Listings */}
        {feed.length > 0 ? (
          <CollapsibleSection
            title="Recent Inspections & Listings"
            count={feed.length}
            isOpen={openSections.recent}
            onToggle={toggleSection("recent")}
          >
            <ul className="flex flex-col gap-2">
              {feed.map((entry) => {
                if (entry.kind === "inspection") {
                  const ins = entry.ins;
                  const prop = propertyById.get(ins.property_id);
                  const count = (items ?? []).filter((i) => i.inspection_id === ins.id).length;
                  const to =
                    ins.status === "in_progress"
                      ? ("/inspection/$id/capture" as const)
                      : ins.status === "completed"
                        ? ("/inspection/$id/review" as const)
                        : ("/inspection/$id/report" as const);
                  return (
                    <li key={`ins-${ins.id}`}>
                      <Link
                        to={to}
                        params={{ id: ins.id }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-dark">
                              {TYPE_LABEL[ins.inspection_type] ?? "Inspection"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-foreground">
                            {prop?.address ?? "Property"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDMY(ins.inspection_date)} · {count} items
                          </p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[ins.status]}`}>
                          {STATUS_LABEL[ins.status]}
                        </span>
                      </Link>
                    </li>
                  );
                }
                const l = entry.listing;
                const prop = propertyById.get(l.property_id);
                return (
                  <li key={`lst-${l.id}`}>
                    <Link
                      to="/listing/$id/review"
                      params={{ id: l.id }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Listing
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">
                          {l.title || prop?.address || "Listing"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {LISTING_TYPE_LABEL[l.listing_type] ?? l.listing_type} · {PORTAL_LABEL[l.target_portal] ?? l.target_portal} · {formatDMY(l.created_at)}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${LISTING_STATUS_STYLE[l.status]}`}>
                        {l.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CollapsibleSection>
        ) : null}
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  icon?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={onToggle}
        className="mb-3 flex w-full items-center justify-between rounded-xl py-1 text-left transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
          {icon}
          {title}
          <span className="ml-1 text-sm font-normal text-muted-foreground">({count})</span>
        </span>
        {isOpen ? (
          <ChevronDown className="size-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-5 text-muted-foreground" />
        )}
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

function StatCard({
  label, value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className="text-[28px] font-extrabold leading-none tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
