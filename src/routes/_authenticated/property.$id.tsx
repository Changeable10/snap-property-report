import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Bed, Bath, Home as HomeIcon, Building2, Plus, Pencil, Trash2, Check, X, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/property-types";

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
  inspection_type: "entry" | "routine" | "exit";
  inspection_date: string;
  status: InspectionStatus;
}

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
  entry: "Entry", routine: "Routine", exit: "Exit",
};
function formatDMY(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

function PropertyDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newRoom, setNewRoom] = useState("");

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

  const Icon = property?.property_type === "apartment" || property?.property_type === "unit" ? Building2 : HomeIcon;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/"
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          {property ? (
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal-dark">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
                  {property.address}
                </h1>
                <p className="truncate text-sm text-muted-foreground">
                  {property.suburb}, {property.city} {property.postcode}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
                    {PROPERTY_TYPE_LABEL[property.property_type]}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Bed className="size-3.5" />
                    {property.bedrooms}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Bath className="size-3.5" />
                    {property.bathrooms}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-bold tracking-tight text-foreground">Property</h1>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        <Link
          to="/inspection/setup/$propertyId"
          params={{ propertyId: id }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark"
        >
          <ClipboardList className="size-5" />
          New inspection
        </Link>

        <section className="mt-8">
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

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Inspection history</h2>
          {!inspections || inspections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No inspections yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {inspections.map((ins) => {
                const content = (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {TYPE_LABEL[ins.inspection_type]} inspection
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDMY(ins.inspection_date)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[ins.status]}`}>
                      {STATUS_LABEL[ins.status]}
                    </span>
                  </div>
                );
                const target =
                  ins.status === "in_progress"
                    ? { to: "/inspection/$id/capture" as const }
                    : ins.status === "completed"
                    ? { to: "/inspection/$id/review" as const }
                    : { to: "/inspection/$id/report" as const };
                return (
                  <li key={ins.id}>
                    <Link to={target.to} params={{ id: ins.id }} className="block">
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}