import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, LogIn, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/inspection/setup/$propertyId")({
  head: () => ({ meta: [{ title: "Inspection setup — Snapsure" }] }),
  component: InspectionSetup,
});

type InspectionType = "entry" | "routine" | "exit";

const TYPES: { value: InspectionType; label: string; description: string; Icon: typeof LogIn }[] = [
  { value: "entry", label: "Entry inspection", description: "First inspection when tenant moves in", Icon: LogIn },
  { value: "routine", label: "Routine inspection", description: "Periodic check during tenancy", Icon: RefreshCw },
  { value: "exit", label: "Exit inspection", description: "Final inspection when tenant moves out", Icon: LogOut },
];

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function InspectionSetup() {
  const { propertyId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const { data: property } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,address,suburb,city,postcode")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [type, setType] = useState<InspectionType>("routine");
  const [tenants, setTenants] = useState("");
  const [date, setDate] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase
      .from("inspections")
      .insert({
        property_id: propertyId,
        user_id: user.id,
        inspection_type: type,
        inspection_date: date,
        inspector_name: user.email ?? "Unknown",
        tenant_names: tenants.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    navigate({ to: "/inspection/$id/capture", params: { id: data.id } });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/property/$id"
            params={{ id: propertyId }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">New inspection</h1>
          {property ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {property.address}, {property.suburb}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Inspection type</h2>
          <div className="flex flex-col gap-2">
            {TYPES.map(({ value, label, description, Icon }) => {
              const active = type === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? "border-teal bg-teal-light"
                      : "border-border bg-card hover:border-teal/40"
                  }`}
                >
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-teal text-teal-foreground" : "bg-teal-light text-teal-dark"
                    }`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tenant name(s)
            <input
              type="text"
              value={tenants}
              onChange={(e) => setTenants(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Inspection date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
        </section>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <button
          type="button"
          onClick={start}
          disabled={submitting}
          className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
        >
          {submitting ? "Starting…" : "Start inspection"}
        </button>
      </main>
    </div>
  );
}