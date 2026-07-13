import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Home as HomeIcon,
  Building2,
  Building,
  Warehouse,
  Minus,
  Plus,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { buildRoomTemplate } from "@/lib/room-templates";
import type { PropertyType } from "@/lib/property-types";
import { cn } from "@/lib/utils";

export const ONBOARDED_KEY = "snapsure_onboarded";

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

export function Onboarding({ user, onFinish }: { user: User; onFinish: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("New Plymouth");
  const [postcode, setPostcode] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("house");
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
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
      if (propErr) throw propErr;

      const template = buildRoomTemplate(propertyType, bedrooms, bathrooms);
      const { error: roomErr } = await supabase.from("rooms").insert(
        template.map((r) => ({
          property_id: property.id,
          user_id: user.id,
          name: r.name,
          sort_order: r.sort_order,
        })),
      );
      if (roomErr) throw roomErr;

      try {
        localStorage.setItem(ONBOARDED_KEY, "true");
      } catch {
        /* ignore */
      }
      setPropertyId(property.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create property");
    } finally {
      setSaving(false);
    }
  }

  if (step === 1) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-teal-light text-teal-dark">
          <Sparkles className="size-8" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
          Welcome to Snapsure
        </h1>
        <p className="mt-3 max-w-sm text-base text-muted-foreground">
          Let's set up your first property.
        </p>
        <button
          type="button"
          onClick={() => setStep(2)}
          className="mt-8 flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark"
        >
          Get started
        </button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-background pb-32">
        <header className="border-b border-border px-5 pt-6 pb-4">
          <div className="mx-auto max-w-md">
            <p className="text-xs font-medium uppercase tracking-wide text-teal">Step 2 of 3</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
              Property details
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the address and details of your rental in New Zealand.
            </p>
          </div>
        </header>

        <form onSubmit={handleCreate} className="mx-auto max-w-md px-5 py-6">
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
          <div className="mx-auto flex max-w-md gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-input bg-card px-5 text-sm font-semibold text-foreground"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="flex min-h-12 flex-[2] items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create property"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-condition-good/15 text-condition-good">
        <CheckCircle2 className="size-8" />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Your property is ready
      </h1>
      <p className="mt-3 max-w-sm text-base text-muted-foreground">
        Start your first inspection or explore the dashboard.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            if (propertyId) {
              navigate({
                to: "/inspection/setup/$propertyId",
                params: { propertyId },
              });
            }
          }}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark"
        >
          Start inspection
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-input bg-card px-5 text-sm font-semibold text-foreground"
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}