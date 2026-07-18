import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, Bed, Bath, Home as HomeIcon, Building2, Plus, Pencil, Trash2,
  Check, X, ClipboardList, Phone, Mail, Download, FileText, Play, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/property-types";
import { toast } from "sonner";
import { usePlan } from "@/lib/use-plan";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  buildInspectionCsv,
  downloadCsv,
  todayStamp,
  type InspectionExportRow,
  type InspectionItemAgg,
} from "@/lib/csv-export";

export const Route = createFileRoute("/_authenticated/property/$id")({
  head: () => ({ meta: [{ title: "Property — Snapsure" }] }),
  component: PropertyDetail,
});

interface Property {
  id: string;
  address: string;
  suburb: string;
  city: string;
  postcode: string;
  property_type: PropertyType;
  bedrooms: number;
  bathrooms: number;
}

interface Room {
  id: string;
  name: string;
  sort_order: number;
}

type InspectionStatus = "in_progress" | "completed" | "signed";
interface InspectionRow {
  id: string;
  inspection_type: "entry" | "routine" | "exit" | "healthy_homes";
  inspection_date: string;
  status: InspectionStatus;
}

type Condition = "good" | "fair" | "poor" | "damaged";
type Priority = "low" | "medium" | "high";

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

type ContactRole = "landlord" | "tenant" | "property_manager" | "builder" | "electrician" | "plumber" | "contractor" | "other";
interface Contact {
  id: string;
  property_id: string;
  contact_name: string;
  contact_role: ContactRole;
  phone: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
}
const CONTACT_ROLES: { value: ContactRole; label: string }[] = [
  { value: "landlord", label: "Landlord" },
  { value: "tenant", label: "Tenant" },
  { value: "property_manager", label: "Property manager" },
  { value: "builder", label: "Builder" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];
const CONTACT_ROLE_LABEL = Object.fromEntries(CONTACT_ROLES.map((r) => [r.value, r.label])) as Record<ContactRole, string>;

const STATUS_LABEL: Record<InspectionStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  signed: "Signed",
};
const STATUS_STYLE: Record<InspectionStatus, string> = {
  in_progress: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
  completed: "bg-teal-light text-teal-dark ring-teal/30",
  signed: "bg-condition-good/15 text-condition-good ring-condition-good/40",
};
const TYPE_LABEL: Record<InspectionRow["inspection_type"], string> = {
  entry: "Entry", routine: "Routine", exit: "Exit", healthy_homes: "Healthy Homes",
};
const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40",
  medium: "bg-condition-poor/15 text-condition-poor ring-condition-poor/40",
  low: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
};
const COND_BG: Record<Condition, string> = {
  good: "bg-condition-good", fair: "bg-condition-fair",
  poor: "bg-condition-poor", damaged: "bg-condition-damaged",
};
function formatDMY(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

function PropertyDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: property } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Property;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });

  const { data: inspections } = useQuery({
    queryKey: ["inspections", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id,inspection_type,inspection_date,status")
        .eq("property_id", id)
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InspectionRow[];
    },
  });

  const { data: propListings } = useQuery({
    queryKey: ["property-listings", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id,listing_type,target_portal,status,created_at,title")
        .eq("property_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ListingRow[];
    },
  });

  const inspectionIds = (inspections ?? []).map((i) => i.id);
  const { data: items } = useQuery({
    queryKey: ["property-items", id, inspectionIds.join(",")],
    enabled: inspectionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspection_items")
        .select("id,inspection_id,room_id,item_name,condition,description,maintenance_required,maintenance_notes,maintenance_priority,maintenance_resolved")
        .in("inspection_id", inspectionIds);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_contacts")
        .select("*")
        .eq("property_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [maintFilter, setMaintFilter] = useState<"all" | "open" | "resolved">("all");
  const { data: plan } = usePlan(user.id);
  const [showUpgrade, setShowUpgrade] = useState(false);

  function handleExportInspections() {
    if (!plan || plan === "free") {
      setShowUpgrade(true);
      return;
    }
    if (!property || !inspections || inspections.length === 0) {
      toast.info("Nothing to export");
      return;
    }
    const propRef = {
      address: property.address,
      suburb: property.suburb ?? null,
      city: property.city ?? null,
    };
    const rows: InspectionExportRow[] = inspections.map((ins) => ({
      id: ins.id,
      inspection_type: ins.inspection_type,
      inspection_date: ins.inspection_date,
      status: ins.status,
      inspector_name: null,
      tenant_names: null,
      property: propRef,
    }));
    const aggItems: InspectionItemAgg[] = (items ?? []).map((i) => ({
      inspection_id: i.inspection_id,
      condition: i.condition,
      maintenance_required: i.maintenance_required,
    }));
    const csv = buildInspectionCsv(rows, aggItems);
    downloadCsv(`snapsure-inspections-export-${todayStamp()}.csv`, csv);
    toast.success("Inspections CSV downloaded");
  }

  const addRoom = useMutation({
    mutationFn: async (name: string) => {
      const maxSort = rooms?.reduce((m, r) => Math.max(m, r.sort_order), 0) ?? 0;
      const { error } = await supabase.from("rooms").insert({
        property_id: id,
        user_id: user.id,
        name,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewRoom("");
      qc.invalidateQueries({ queryKey: ["rooms", id] });
    },
  });

  const renameRoom = useMutation({
    mutationFn: async ({ roomId, name }: { roomId: string; name: string }) => {
      const { error } = await supabase.from("rooms").update({ name }).eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["rooms", id] });
    },
  });

  const deleteRoom = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from("rooms").delete().eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms", id] }),
  });

  const addContact = useMutation({
    mutationFn: async (payload: Omit<Contact, "id" | "property_id">) => {
      const { error } = await supabase.from("property_contacts").insert({
        ...payload,
        property_id: id,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowContactForm(false);
      qc.invalidateQueries({ queryKey: ["contacts", id] });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from("property_contacts").delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", id] }),
  });

  const toggleMaintenance = useMutation({
    mutationFn: async ({ itemId, resolved }: { itemId: string; resolved: boolean }) => {
      const { error } = await supabase
        .from("inspection_items")
        .update({
          maintenance_resolved: resolved,
          maintenance_resolved_at: resolved ? new Date().toISOString() : null,
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property-items", id] }),
  });

  const updateProperty = useMutation({
    mutationFn: async (patch: Partial<Property>) => {
      const { error } = await supabase.from("properties").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingProperty(false);
      qc.invalidateQueries({ queryKey: ["property", id] });
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
  });

  const Icon = property?.property_type === "apartment" || property?.property_type === "unit" ? Building2 : HomeIcon;

  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));
  const inspectionById = new Map((inspections ?? []).map((i) => [i.id, i]));

  const maintenanceRows = (items ?? [])
    .filter((i) => i.maintenance_required)
    .sort((a, b) => {
      const da = inspectionById.get(a.inspection_id)?.inspection_date ?? "";
      const db = inspectionById.get(b.inspection_id)?.inspection_date ?? "";
      return db.localeCompare(da);
    });
  const filteredMaintenance = maintenanceRows.filter((it) =>
    maintFilter === "all" ? true : maintFilter === "resolved" ? it.maintenance_resolved : !it.maintenance_resolved,
  );
  const openCount = maintenanceRows.filter((i) => !i.maintenance_resolved).length;
  const resolvedCount = maintenanceRows.length - openCount;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          {property ? (
            <div className="flex items-start gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal-dark">
                <Icon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                  {property.address}
                </h1>
                <p className="truncate text-sm text-muted-foreground">
                  {property.suburb}, {property.city} {property.postcode}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
                    {PROPERTY_TYPE_LABEL[property.property_type]}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    <Bed className="size-3.5" />
                    {property.bedrooms}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    <Bath className="size-3.5" />
                    {property.bathrooms}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setEditingProperty((v) => !v)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  <Pencil className="size-3.5" />
                  {editingProperty ? "Cancel" : "Edit property"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/inspection/setup/$propertyId", params: { propertyId: id } })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <ClipboardList className="size-3.5" />
                  New inspection
                </button>
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-bold tracking-tight text-foreground">Property</h1>
          )}
          {editingProperty && property ? (
            <PropertyEditForm
              property={property}
              onSave={(patch) => updateProperty.mutate(patch)}
              saving={updateProperty.isPending}
            />
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6">
        {/* Contacts */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setContactsOpen((v) => !v)}
              className="inline-flex items-center gap-2 text-lg font-semibold text-foreground"
            >
              <ChevronDown className={`size-4 transition-transform ${contactsOpen ? "" : "-rotate-90"}`} />
              Contacts
              <span className="text-xs font-normal text-muted-foreground">({contacts?.length ?? 0})</span>
            </button>
            {contactsOpen ? (
              <button
                type="button"
                onClick={() => setShowContactForm((v) => !v)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground hover:bg-teal-dark"
              >
                <Plus className="size-4" />
                {showContactForm ? "Close" : "Add contact"}
              </button>
            ) : null}
          </div>

          {contactsOpen && showContactForm ? (
            <ContactForm
              onSubmit={(payload) => addContact.mutate(payload)}
              submitting={addContact.isPending}
            />
          ) : null}

          {contactsOpen ? (
            !contacts || contacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No contacts yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {contacts.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center rounded-full bg-teal-light px-2 py-0.5 text-[11px] font-semibold text-teal-dark">
                        {CONTACT_ROLE_LABEL[c.contact_role]}
                      </span>
                      <p className="mt-1.5 text-sm font-semibold text-foreground">{c.contact_name}</p>
                      {c.company ? <p className="text-xs text-muted-foreground">{c.company}</p> : null}
                      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                            <Phone className="size-3.5" />{c.phone}
                          </a>
                        ) : null}
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                            <Mail className="size-3.5" />{c.email}
                          </a>
                        ) : null}
                      </div>
                      {c.notes ? <p className="mt-2 text-xs text-muted-foreground">{c.notes}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteContact.mutate(c.id)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                      aria-label="Delete contact"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )
          ) : null}
        </section>

        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">Inspections</h2>
            {inspections && inspections.length > 0 ? (
              <button
                type="button"
                onClick={handleExportInspections}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-accent"
              >
                <Download className="size-3.5" /> Export
              </button>
            ) : null}
          </div>
          {!inspections || inspections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No inspections yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {inspections.map((ins) => {
                const insItems = (items ?? []).filter((i) => i.inspection_id === ins.id);
                const counts: Record<Condition, number> = { good: 0, fair: 0, poor: 0, damaged: 0 };
                insItems.forEach((i) => { if (counts[i.condition] !== undefined) counts[i.condition]++; });
                const total = insItems.length;
                const maintCount = insItems.filter((i) => i.maintenance_required).length;
                return (
                  <li key={ins.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-foreground">
                            {TYPE_LABEL[ins.inspection_type]} · {formatDMY(ins.inspection_date)}
                          </p>
                          {ins.inspection_type === "healthy_homes" ? (
                            <span className="inline-flex items-center rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-dark">
                              Healthy Homes
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ins.inspection_type === "healthy_homes"
                            ? "Six-standard compliance assessment"
                            : <>{total} items · <span className={maintCount > 0 ? "text-condition-poor font-medium" : ""}>{maintCount} maintenance</span></>}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[ins.status]}`}>
                        {STATUS_LABEL[ins.status]}
                      </span>
                    </div>
                    {ins.inspection_type !== "healthy_homes" && total > 0 ? (
                      <>
                        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                          {(["good","fair","poor","damaged"] as Condition[]).map((c) =>
                            counts[c] > 0 ? (
                              <span key={c} className={`h-full ${COND_BG[c]}`} style={{ width: `${(counts[c] / total) * 100}%` }} />
                            ) : null,
                          )}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {counts.good} good · {counts.fair} fair · {counts.poor} poor · {counts.damaged} damaged
                        </p>
                      </>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ins.status === "in_progress" ? (
                        <Link
                          to={ins.inspection_type === "healthy_homes" ? "/inspection/$id/healthy-homes" : "/inspection/$id/capture"}
                          params={{ id: ins.id }}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground hover:bg-teal-dark"
                        >
                          <Play className="size-3.5" />
                          Continue
                        </Link>
                      ) : (
                        <>
                          {ins.inspection_type !== "healthy_homes" ? (
                            <Link
                              to="/inspection/$id/review"
                              params={{ id: ins.id }}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-accent"
                            >
                              <FileText className="size-3.5" />
                              View review
                            </Link>
                          ) : null}
                          <Link
                            to={ins.inspection_type === "healthy_homes" ? "/inspection/$id/hh-report" : "/inspection/$id/report"}
                            params={{ id: ins.id }}
                            className={
                              ins.status === "signed"
                                ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground hover:bg-teal-dark"
                                : "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-accent"
                            }
                          >
                            <Download className="size-3.5" />
                            {ins.inspection_type === "healthy_homes" ? "View report" : "Download PDF"}
                          </Link>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">Maintenance log</h2>
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
              {([
                ["all", `All (${maintenanceRows.length})`],
                ["open", `Open (${openCount})`],
                ["resolved", `Resolved (${resolvedCount})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMaintFilter(key)}
                  className={
                    maintFilter === key
                      ? "rounded-md bg-teal px-2.5 py-1 font-semibold text-teal-foreground"
                      : "rounded-md px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {filteredMaintenance.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {maintenanceRows.length === 0 ? "No maintenance items logged." : "Nothing matches this filter."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Room</th>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="hidden px-3 py-2 font-semibold md:table-cell">Issue</th>
                    <th className="px-3 py-2 font-semibold">Priority</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaintenance.map((it) => {
                    const ins = inspectionById.get(it.inspection_id);
                    const room = roomById.get(it.room_id);
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{ins ? formatDMY(ins.inspection_date) : "—"}</td>
                        <td className="px-3 py-2 text-foreground">{room?.name ?? "—"}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{it.item_name}</td>
                        <td className="hidden max-w-xs px-3 py-2 text-muted-foreground md:table-cell">
                          {it.maintenance_notes ?? it.description ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${PRIORITY_STYLE[it.maintenance_priority]}`}>
                            {it.maintenance_priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleMaintenance.mutate({ itemId: it.id, resolved: !it.maintenance_resolved })}
                            className={
                              it.maintenance_resolved
                                ? "inline-flex min-h-8 items-center gap-1 rounded-full bg-condition-good/15 px-2.5 py-1 text-[11px] font-semibold text-condition-good ring-1 ring-inset ring-condition-good/40"
                                : "inline-flex min-h-8 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border"
                            }
                          >
                            {it.maintenance_resolved ? "Resolved" : "Open"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Rooms</h2>
          <ul className="flex flex-col gap-2">
            {rooms?.map((room) => (
              <li
                key={room.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                {editingId === room.id ? (
                  <>
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() =>
                        editValue.trim() && renameRoom.mutate({ roomId: room.id, name: editValue.trim() })
                      }
                      className="flex size-9 items-center justify-center rounded-lg text-teal"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {room.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(room.id);
                        setEditValue(room.name);
                      }}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                      aria-label="Rename room"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRoom.mutate(room.id)}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                      aria-label="Delete room"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              placeholder="Add a custom room"
              className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => newRoom.trim() && addRoom.mutate(newRoom.trim())}
              disabled={!newRoom.trim() || addRoom.isPending}
              className="flex size-11 items-center justify-center rounded-xl bg-teal text-teal-foreground disabled:opacity-40"
              aria-label="Add room"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </section>
      </main>

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
}

function PropertyEditForm({
  property, onSave, saving,
}: {
  property: Property;
  onSave: (patch: Partial<Property>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    address: property.address,
    suburb: property.suburb,
    city: property.city,
    postcode: property.postcode,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2"
    >
      <TextField label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
      <TextField label="Suburb" value={form.suburb} onChange={(v) => setForm({ ...form, suburb: v })} />
      <TextField label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
      <TextField label="Postcode" value={form.postcode} onChange={(v) => setForm({ ...form, postcode: v })} />
      <NumberField label="Bedrooms" value={form.bedrooms} onChange={(v) => setForm({ ...form, bedrooms: v })} />
      <NumberField label="Bathrooms" value={form.bathrooms} onChange={(v) => setForm({ ...form, bathrooms: v })} />
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
      />
    </label>
  );
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
      />
    </label>
  );
}

function ContactForm({
  onSubmit, submitting,
}: {
  onSubmit: (payload: Omit<Contact, "id" | "property_id">) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<Omit<Contact, "id" | "property_id">>({
    contact_name: "", contact_role: "landlord",
    phone: "", email: "", company: "", notes: "",
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.contact_name.trim()) return;
        onSubmit({
          ...form,
          phone: form.phone || null,
          email: form.email || null,
          company: form.company || null,
          notes: form.notes || null,
        });
      }}
      className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2"
    >
      <TextField label="Name" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Role
        <select
          value={form.contact_role}
          onChange={(e) => setForm({ ...form, contact_role: e.target.value as ContactRole })}
          className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
        >
          {CONTACT_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>
      <TextField label="Phone" value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} />
      <TextField label="Email" value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
      <TextField label="Company" value={form.company ?? ""} onChange={(v) => setForm({ ...form, company: v })} />
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
        Notes
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={submitting || !form.contact_name.trim()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save contact"}
        </button>
      </div>
    </form>
  );
}
