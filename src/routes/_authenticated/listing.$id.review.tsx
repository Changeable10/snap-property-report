import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Loader2, Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/listing/$id/review")({
  head: () => ({ meta: [{ title: "Listing review — Snapsure" }] }),
  component: ListingReview,
});

const PORTAL_LABEL: Record<string, string> = {
  trademe: "Trade Me Property",
  realestate: "realestate.co.nz",
  airbnb: "Airbnb / Bookabach",
  general: "General",
};

const LISTING_TYPE_LABEL: Record<string, string> = {
  for_sale: "For sale",
  for_rent: "For rent",
  holiday: "Holiday / short-stay",
  development: "Development",
};

interface ListingRow {
  id: string;
  property_id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  features: string | null;
  key_features: string | null;
  listing_type: string;
  target_portal: string;
  asking_price: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  ai_generated_at: string | null;
}

interface PropertyRow {
  id: string;
  address: string | null;
  suburb: string | null;
  city: string | null;
  postcode: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
}

interface RoomRow { id: string; name: string; sort_order: number }
interface ListingRoomRow { room_id: string; transcript: string | null; notes: string | null }
interface PhotoRow { id: string; photo_url: string; room_id: string | null; source: string }

function SignedImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    let cancel = false;
    supabase.storage.from("inspection-photos").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancel) setUrl(data?.signedUrl);
    });
    return () => { cancel = true; };
  }, [path]);
  return (
    <div className="aspect-square overflow-hidden rounded-lg bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed");
  }
}

function ListingReview() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: listing } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("listings")
        .select("id,property_id,user_id,title,description,features,key_features,listing_type,target_portal,asking_price,bedrooms,bathrooms,ai_generated_at")
        .eq("id", id).single();
      if (error) throw error;
      return data as ListingRow;
    },
  });

  const { data: property } = useQuery({
    queryKey: ["listing-property", listing?.property_id],
    enabled: !!listing?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties")
        .select("id,address,suburb,city,postcode,property_type,bedrooms,bathrooms")
        .eq("id", listing!.property_id).single();
      if (error) throw error;
      return data as PropertyRow;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", listing?.property_id],
    enabled: !!listing?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", listing!.property_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
  });

  const { data: listingRooms } = useQuery({
    queryKey: ["listing-rooms", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("listing_rooms")
        .select("room_id,transcript,notes").eq("listing_id", id);
      if (error) throw error;
      return (data ?? []) as ListingRoomRow[];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["listing-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("listing_photos")
        .select("id,photo_url,room_id,source").eq("listing_id", id)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhotoRow[];
    },
  });

  // Editable AI output
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");
  const [priceLine, setPriceLine] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    if (!listing) return;
    setTitle(listing.title ?? "");
    setDescription(listing.description ?? "");
    setFeatures(listing.features ?? "");
    setHasGenerated(!!listing.ai_generated_at);
  }, [listing?.id]);

  const roomNotes = useMemo(() => {
    const map = new Map((listingRooms ?? []).map((r) => [r.room_id, r]));
    return (rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      transcript: map.get(r.id)?.transcript ?? "",
      notes: map.get(r.id)?.notes ?? "",
    }));
  }, [rooms, listingRooms]);

  async function generate() {
    if (!listing || !property) return;
    setGenerating(true);
    try {
      const payload = {
        address: property.address,
        suburb: property.suburb,
        city: property.city,
        property_type: property.property_type,
        listing_type: listing.listing_type,
        target_portal: listing.target_portal,
        bedrooms: listing.bedrooms ?? property.bedrooms,
        bathrooms: listing.bathrooms ?? property.bathrooms,
        asking_price: listing.asking_price,
        key_features: listing.key_features,
        rooms: roomNotes
          .filter((r) => r.transcript || r.notes)
          .map((r) => ({ name: r.name, transcript: r.transcript, notes: r.notes })),
      };
      const { data, error } = await supabase.functions.invoke("generate-listing", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const out = data as { title: string; description: string; features: string[]; price_line: string };
      setTitle(out.title || "");
      setDescription(out.description || "");
      setFeatures((out.features ?? []).map((f) => `• ${f}`).join("\n"));
      setPriceLine(out.price_line || "");
      setHasGenerated(true);
      toast.success("Listing generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!listing) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("listings").update({
        title: title || null,
        description: description || null,
        features: features || null,
        status: "published",
        ai_generated_at: hasGenerated ? new Date().toISOString() : listing.ai_generated_at,
      }).eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Listing saved");
      navigate({ to: "/property/$id", params: { id: listing.property_id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!listing || !property) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-teal" />
      </div>
    );
  }

  const addressLine = [property.address, property.suburb, property.city].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/listing/$id/capture"
            params={{ id }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" /> Back to capture
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Generate listing</h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-teal">Listing mode</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-5 py-6">
        {/* Property summary */}
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">{addressLine || "Property"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Listing type</dt>
            <dd className="text-foreground">{LISTING_TYPE_LABEL[listing.listing_type] ?? listing.listing_type}</dd>
            <dt className="text-muted-foreground">Target portal</dt>
            <dd className="text-foreground">{PORTAL_LABEL[listing.target_portal] ?? listing.target_portal}</dd>
            <dt className="text-muted-foreground">Bedrooms</dt>
            <dd className="text-foreground">{listing.bedrooms ?? property.bedrooms ?? "—"}</dd>
            <dt className="text-muted-foreground">Bathrooms</dt>
            <dd className="text-foreground">{listing.bathrooms ?? property.bathrooms ?? "—"}</dd>
            <dt className="text-muted-foreground">Asking price</dt>
            <dd className="text-foreground">{listing.asking_price || "—"}</dd>
          </dl>
        </section>

        {/* Photos */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Photos ({photos?.length ?? 0})
          </p>
          {photos && photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => <SignedImg key={p.id} path={p.photo_url} />)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No photos captured.</p>
          )}
        </section>

        {/* Room notes */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Walkthrough notes
          </p>
          <div className="space-y-2">
            {roomNotes.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                {r.transcript ? <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{r.transcript}</p> : null}
                {r.notes ? <p className="mt-1 text-xs italic text-muted-foreground whitespace-pre-wrap">{r.notes}</p> : null}
                {!r.transcript && !r.notes ? <p className="mt-1 text-xs text-muted-foreground">(no notes)</p> : null}
              </div>
            ))}
          </div>
        </section>

        {/* Key features */}
        {listing.key_features ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key features</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{listing.key_features}</p>
          </section>
        ) : null}

        {/* Generate / result */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">AI listing description</p>
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground disabled:opacity-60"
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {hasGenerated ? "Regenerate" : "Generate listing description"}
            </button>
          </div>

          {hasGenerated || title || description ? (
            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                <span className="flex items-center justify-between">
                  Title <span className="text-[10px]">{title.length}/80</span>
                </span>
                <div className="flex gap-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => copyText(title, "Title")}
                    className="rounded-lg border border-border p-2 text-muted-foreground"
                    aria-label="Copy title"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Description
                <div className="flex gap-2">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={10}
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => copyText(description, "Description")}
                    className="self-start rounded-lg border border-border p-2 text-muted-foreground"
                    aria-label="Copy description"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Feature list
                <textarea
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              {priceLine ? (
                <div className="rounded-lg bg-teal-light px-3 py-2 text-sm font-medium text-teal">
                  {priceLine}
                </div>
              ) : null}

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save listing
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Tap Generate to produce a title, description, and feature list from the walkthrough notes and property details. Photos are not sent to the AI.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}