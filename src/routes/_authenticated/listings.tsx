import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/listings")({
  head: () => ({ meta: [{ title: "Listings — Snapsure" }] }),
  component: ListingsPage,
});

type ListingStatus = "draft" | "published";
type ListingType = "rent" | "sale" | "short_stay" | string;
type Portal = "trademe" | "realestate" | "airbnb" | "general" | string;

interface Row {
  id: string;
  listing_type: ListingType;
  target_portal: Portal;
  status: ListingStatus;
  created_at: string;
  title: string | null;
  property: { address: string; suburb: string | null } | null;
}

const STATUS_STYLE: Record<ListingStatus, string> = {
  draft: "bg-condition-fair/15 text-condition-fair ring-condition-fair/40",
  published: "bg-condition-good/15 text-condition-good ring-condition-good/40",
};

export const LISTING_TYPE_LABEL: Record<string, string> = {
  rent: "For Rent",
  sale: "For Sale",
  short_stay: "Short Stay",
};

export const PORTAL_LABEL: Record<string, string> = {
  trademe: "Trade Me",
  realestate: "realestate.co.nz",
  airbnb: "Airbnb / Bookabach",
  general: "General",
};

function formatDMY(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

function ListingsPage() {
  const { data: listings, isLoading } = useQuery({
    queryKey: ["all-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id,listing_type,target_portal,status,created_at,title,property:properties(address,suburb)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <PageShell title="Listings" subtitle="All rental and sale listings.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !listings || listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-light text-teal-dark">
            <Tag className="size-6" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">No listings yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {listings.map((l) => (
            <li key={l.id}>
              <Link
                to="/listing/$id/review"
                params={{ id: l.id }}
                className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {l.title || l.property?.address || "Listing"}
                    </p>
                    {l.title && l.property?.address ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {l.property.address}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {LISTING_TYPE_LABEL[l.listing_type] ?? l.listing_type}
                      </span>
                      <span aria-hidden>•</span>
                      <span>{PORTAL_LABEL[l.target_portal] ?? l.target_portal}</span>
                      <span aria-hidden>•</span>
                      <span>{formatDMY(l.created_at)}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${STATUS_STYLE[l.status] ?? ""}`}
                  >
                    {l.status}
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