import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, LogIn, RefreshCw, LogOut, HeartPulse, ClipboardList, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlan } from "@/lib/use-plan";
import { useListingsThisMonth, LISTING_MONTHLY_LIMIT } from "@/lib/use-listing-limit";
import { UpgradeModal } from "@/components/UpgradeModal";

export const Route = createFileRoute("/_authenticated/inspection/setup/$propertyId")({
  head: () => ({ meta: [{ title: "Inspection setup — Snapsure" }] }),
  component: InspectionSetup,
});

type InspectionType = "entry" | "routine" | "exit" | "healthy_homes";
type Mode = "inspection" | "listing";
type ListingType = "for_sale" | "for_rent" | "holiday" | "development";
type ListingPortal = "trademe" | "realestate" | "general" | "airbnb";

const TYPES: { value: InspectionType; label: string; description: string; Icon: typeof LogIn }[] = [
  { value: "entry", label: "Entry inspection", description: "First inspection when tenant moves in", Icon: LogIn },
  { value: "routine", label: "Routine inspection", description: "Periodic check during tenancy", Icon: RefreshCw },
  { value: "exit", label: "Exit inspection", description: "Final inspection when tenant moves out", Icon: LogOut },
  { value: "healthy_homes", label: "Healthy Homes", description: "NZ Healthy Homes Standards compliance check", Icon: HeartPulse },
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
        .select("id,address,suburb,city,postcode,bedrooms,bathrooms")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: plan = "free" } = usePlan(user.id);
  const { data: listingsThisMonth = 0 } = useListingsThisMonth(user.id);
  const listingLimit = LISTING_MONTHLY_LIMIT[plan];
  const listingLimitReached = listingsThisMonth >= listingLimit;

  const [mode, setMode] = useState<Mode>("inspection");
  const [type, setType] = useState<InspectionType>("routine");
  const [tenants, setTenants] = useState("");
  const [date, setDate] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Listing state
  const [listingType, setListingType] = useState<ListingType>("for_sale");
  const [portal, setPortal] = useState<ListingPortal>("trademe");
  const [title, setTitle] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [keyFeatures, setKeyFeatures] = useState("");
  const [beds, setBeds] = useState<number | "">("");
  const [baths, setBaths] = useState<number | "">("");

  // Pre-fill beds/baths from property once loaded
  if (property && beds === "" && typeof property.bedrooms === "number") {
    setBeds(property.bedrooms);
  }
  if (property && baths === "" && typeof property.bathrooms === "number") {
    setBaths(property.bathrooms);
  }

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
    if (type === "healthy_homes") {
      navigate({ to: "/inspection/$id/healthy-homes", params: { id: data.id } });
    } else {
      navigate({ to: "/inspection/$id/capture", params: { id: data.id } });
    }
  }

  async function startListing() {
    if (listingLimitReached) {
      setShowUpgrade(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase
      .from("listings")
      .insert({
        property_id: propertyId,
        user_id: user.id,
        listing_type: listingType,
        target_portal: portal,
        title: title.trim() || null,
        asking_price: askingPrice.trim() || null,
        key_features: keyFeatures.trim() || null,
        bedrooms: typeof beds === "number" ? beds : null,
        bathrooms: typeof baths === "number" ? baths : null,
      })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    navigate({ to: "/listing/$id/capture", params: { id: data.id } });
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
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {mode === "inspection" ? "New inspection" : "New listing"}
          </h1>
          {property ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {property.address}, {property.suburb}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Mode</h2>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "inspection", label: "Inspection", Icon: ClipboardList },
              { value: "listing", label: "Listing", Icon: Megaphone },
            ] as const).map(({ value, label, Icon }) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors ${
                    active
                      ? "border-teal bg-teal-light"
                      : "border-border bg-card hover:border-teal/40"
                  }`}
                >
                  <div
                    className={`flex size-10 items-center justify-center rounded-lg ${
                      active ? "bg-teal text-teal-foreground" : "bg-teal-light text-teal-dark"
                    }`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                </button>
              );
            })}
          </div>
        </section>

        {mode === "inspection" ? (
          <>
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
          </>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Listing title <span className="font-normal text-muted-foreground">(optional)</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="AI will generate one if blank"
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Listing type
                <select
                  value={listingType}
                  onChange={(e) => setListingType(e.target.value as ListingType)}
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                >
                  <option value="for_sale">For Sale</option>
                  <option value="for_rent">For Rent</option>
                  <option value="holiday">Holiday Rental</option>
                  <option value="development">Development</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Target portal
                <select
                  value={portal}
                  onChange={(e) => setPortal(e.target.value as ListingPortal)}
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                >
                  <option value="trademe">Trade Me Property</option>
                  <option value="realestate">realestate.co.nz</option>
                  <option value="general">General</option>
                  <option value="airbnb">Airbnb / Bookabach</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Bedrooms
                  <input
                    type="number"
                    min={0}
                    value={beds}
                    onChange={(e) => setBeds(e.target.value === "" ? "" : Number(e.target.value))}
                    className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Bathrooms
                  <input
                    type="number"
                    min={0}
                    value={baths}
                    onChange={(e) => setBaths(e.target.value === "" ? "" : Number(e.target.value))}
                    className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Asking price or weekly rent <span className="font-normal text-muted-foreground">(optional)</span>
                <input
                  type="text"
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  placeholder="e.g. $850,000 or $650/week"
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Key features to highlight
                <textarea
                  value={keyFeatures}
                  onChange={(e) => setKeyFeatures(e.target.value)}
                  placeholder="e.g. new kitchen, sea views, close to schools"
                  rows={3}
                  className="rounded-xl border border-input bg-card px-3 py-2 text-base"
                />
              </label>
            </section>

            {listingLimitReached ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                You've used {listingsThisMonth} of {listingLimit === Infinity ? "∞" : listingLimit} listings this month on the {plan} plan. Upgrade to create more.
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                {listingsThisMonth} of {listingLimit === Infinity ? "unlimited" : listingLimit} listings used this month.
              </p>
            )}

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            <button
              type="button"
              onClick={startListing}
              disabled={submitting}
              className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              {submitting ? "Starting…" : "Start capture"}
            </button>
          </>
        )}
      </main>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
}