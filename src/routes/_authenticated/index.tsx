import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Plus, Bed, Bath, Home as HomeIcon, Building2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { mockProperties, type Property, type PropertyType } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/_authenticated/")({
  component: Index,
});

function getGreeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const typeLabel: Record<PropertyType, string> = {
  house: "House",
  apartment: "Apartment",
  townhouse: "Townhouse",
  unit: "Unit",
};

const inspectionLabel: Record<string, string> = {
  entry: "Entry",
  routine: "Routine",
  exit: "Exit",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PropertyCard({ p }: { p: Property }) {
  const Icon = p.type === "apartment" || p.type === "unit" ? Building2 : HomeIcon;
  return (
    <Link
      to="/property/$id"
      params={{ id: p.id }}
      className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40 active:bg-accent"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal-dark">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">
              {p.address}
            </h3>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {p.suburb} {p.postcode}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
              {typeLabel[p.type]}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Bed className="size-3.5" />
              {p.beds}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Bath className="size-3.5" />
              {p.baths}
            </span>
          </div>
          {p.lastInspection ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last inspection:{" "}
              <span className="font-medium text-foreground">
                {inspectionLabel[p.lastInspection.type]}
              </span>{" "}
              · {formatDate(p.lastInspection.date)}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No inspections yet</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function Index() {
  const properties = mockProperties;
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-8 pb-4">
        <p className="text-sm text-muted-foreground">{greeting},</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
          Snapsure
        </h1>
      </header>

      <main className="mx-auto max-w-md px-5">
        <section aria-labelledby="your-properties">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="your-properties"
              className="text-lg font-semibold text-foreground"
            >
              Your properties
            </h2>
            {properties.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {properties.length}
              </span>
            ) : null}
          </div>

          {properties.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-light text-teal-dark">
                <HomeIcon className="size-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">
                Add your first property
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start capturing inspections in minutes — no forms, just photos
                and your voice.
              </p>
              <Link
                to="/property/new"
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark"
              >
                <Plus className="size-4" />
                Add property
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {properties.map((p) => (
                <li key={p.id}>
                  <PropertyCard p={p} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {properties.length > 0 ? (
          <div className="mt-5">
            <Link
              to="/property/new"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark active:bg-teal-dark"
            >
              <Plus className="size-5" />
              Add property
            </Link>
          </div>
        ) : null}
      </main>

      <BottomNav />
    </div>
  );
}
