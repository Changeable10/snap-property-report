import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Home as HomeIcon, Building2, Building, Warehouse, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildRoomTemplate } from "@/lib/room-templates";
import type { PropertyType } from "@/lib/property-types";
import { cn } from "@/lib/utils";
import { UpgradeModal } from "@/components/UpgradeModal";
import { usePlan, usePropertyCount, PLAN_LIMITS } from "@/lib/use-plan";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/property/new")({
  head: () => ({ meta: [{ title: "Add property — Snapsure" }] }),
  component: NewProperty,
});

const TYPES: { value: PropertyType; label: string; icon: typeof HomeIcon }[] = [
  { value: "house", label: "House", icon: HomeIcon },
  { value: "apartment", label: "Apartment", icon: Building2 },
  { value: "unit", label: "Unit", icon: Building },
  { value: "townhouse", label: "Townhouse", icon: Warehouse },
];

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-input bg-card px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-9 items-center justify-center rounded-full border border-input text-foreground disabled:opacity-40"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-4" />
        </button>
        <span className="w-6 text-center text-base font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-9 items-center justify-center rounded-full border border-input text-foreground disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function NewProperty() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const { data: plan, isLoading: planLoading } = usePlan(user.id);
  const { data: propertyCount, isLoading: countLoading } = usePropertyCount(user.id);
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("New Plymouth");
  const [postcode, setPostcode] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("house");
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = PLAN_LIMITS[plan ?? "free"];
  const blocked = !planLoading && !countLoading && (propertyCount ?? 0) >= limit;

  if (blocked) {
    return (
      <div className="min-h-screen bg-background">
        <UpgradeModal open={true} onClose={() => navigate({ to: "/" })} />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const addressTrim = address.trim();
      const suburbTrim = suburb.trim();
      const cityTrim = city.trim();
      const postcodeTrim = postcode.trim();
      if (!addressTrim || !suburbTrim || !cityTrim || !postcodeTrim) {
        setError("Address, suburb, city and postcode are all required.");
        setSaving(false);
        return;
      }

      // Safety net: re-check the user's active property count against their
      // plan limit at submit time in case the initial gate raced or was skipped.
      {
        const { count } = await supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("archived_at", null);
        if ((count ?? 0) >= limit) {
          toast.error("You've reached your plan's property limit. Upgrade to add more.");
          setSaving(false);
          navigate({ to: "/" });
          return;
        }
      }

      // Ensure a valid auth session is attached to the insert request.
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        sessionData = { session: refreshed.session };
      }
      if (!sessionData.session) {
        toast.error("Your session has expired. Please sign in again.");
        navigate({ to: "/auth" });
        return;
      }

      const { data: property, error: propErr } = await supabase
        .from("properties")
        .insert({
          user_id: user.id,
          address: addressTrim,
          suburb: suburbTrim,
          city: cityTrim,
          postcode: postcodeTrim,
          property_type: propertyType,
          bedrooms,
          bathrooms,
        })
        .select()
        .single();
      if (propErr) {
        if ((propErr as { code?: string }).code === "42501") {
          toast.error("Session error — please sign out and sign back in.");
        } else {
          toast.error(propErr.message);
        }
        setError(propErr.message);
        setSaving(false);
        return;
      }

      const template = buildRoomTemplate(propertyType, bedrooms, bathrooms);
      const { error: roomErr } = await supabase.from("rooms").insert(
        template.map((r) => ({
          property_id: property.id,
          user_id: user.id,
          name: r.name,
          sort_order: r.sort_order,
        })),
      );
      if (roomErr) {
        if ((roomErr as { code?: string }).code === "42501") {
          toast.error("Session error — please sign out and sign back in.");
        } else {
          toast.error(roomErr.message);
        }
        setError(roomErr.message);
        setSaving(false);
        return;
      }

      navigate({ to: "/property/$id", params: { id: property.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create property";
      toast.error(msg);
      setError(msg);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/"
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Add property</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter address and details for the rental.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto max-w-md px-5 py-6">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Address
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
              placeholder="42 Bell Street"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Suburb
            <input
              type="text"
              required
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            City
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Postcode
            <input
              type="text"
              required
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
              placeholder="4312"
              inputMode="numeric"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Property type</p>
            <div className="grid grid-cols-2 gap-3">
              {TYPES.map(({ value, label, icon: Icon }) => {
                const active = propertyType === value;
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setPropertyType(value)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition-colors",
                      active
                        ? "border-teal bg-teal-light text-teal-dark"
                        : "border-input bg-card text-foreground hover:bg-accent/40",
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="size-6" />
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Stepper label="Bedrooms" value={bedrooms} min={1} max={6} onChange={setBedrooms} />
          <Stepper label="Bathrooms" value={bathrooms} min={1} max={4} onChange={setBathrooms} />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </form>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create property"}
          </button>
        </div>
      </div>
    </div>
  );
}