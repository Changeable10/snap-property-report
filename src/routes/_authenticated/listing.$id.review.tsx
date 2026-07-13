import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Loader2, Sparkles, Check, Camera, Star, Download, Wand2, RotateCcw, Sofa, X, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { renderEnhancedBlob, toFilterString, type EnhanceRecs } from "@/lib/photo-enhance";
import { usePlan } from "@/lib/use-plan";
import { useStagingThisMonth, STAGING_MONTHLY_LIMIT, STAGING_STYLES } from "@/lib/use-staging-limit";
import { UpgradeModal } from "@/components/UpgradeModal";
import { exportListingPackage } from "@/lib/listing-export";

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
interface PhotoRow {
  id: string;
  photo_url: string;
  room_id: string | null;
  source: string;
  featured?: boolean;
  is_hero?: boolean;
  quality_score?: number | null;
  quality_reason?: string | null;
  enhanced_url?: string | null;
  staged_url?: string | null;
  staging_style?: string | null;
}

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
        .select("id,photo_url,room_id,source,featured,is_hero,quality_score,quality_reason,enhanced_url,staged_url,staging_style")
        .eq("listing_id", id)
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

  // Best-shot scoring state
  const [scoring, setScoring] = useState(false);
  const [scoreProgress, setScoreProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [downloadingAll, setDownloadingAll] = useState(false);

  // Bulk enhancement state
  const [bulkEnhancing, setBulkEnhancing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [bulkTarget, setBulkTarget] = useState<string | null>(null); // photo id to trigger enhance-and-preview flow

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

  async function scorePhotos() {
    if (!photos || photos.length === 0) {
      toast.error("No photos to score");
      return;
    }
    setScoring(true);
    setScoreProgress({ done: 0, total: photos.length });
    const results: { id: string; score: number; reason: string }[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        try {
          const { data: signed } = await supabase.storage
            .from("inspection-photos")
            .createSignedUrl(p.photo_url, 3600);
          const url = signed?.signedUrl;
          if (!url) throw new Error("signed url failed");
          const { data, error } = await supabase.functions.invoke("score-listing-photo", {
            body: { image_url: url },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          const score = Number((data as any).overall ?? 0);
          const reason = String((data as any).reason ?? "");
          results.push({ id: p.id, score, reason });
          await supabase.from("listing_photos")
            .update({ quality_score: score, quality_reason: reason })
            .eq("id", p.id);
        } catch (e) {
          console.warn("score failed for", p.id, e);
        }
        setScoreProgress({ done: i + 1, total: photos.length });
      }

      // Pre-select top N (top 5 or top 30%, whichever is fewer)
      const ranked = [...results].sort((a, b) => b.score - a.score);
      const pick = Math.max(1, Math.min(5, Math.floor(ranked.length * 0.3) || 1));
      const featuredIds = new Set(ranked.slice(0, pick).map((r) => r.id));
      const heroId = ranked[0]?.id;

      // Reset featured/is_hero for the whole set, then set the picks
      await supabase.from("listing_photos")
        .update({ featured: false, is_hero: false })
        .eq("listing_id", id);
      if (featuredIds.size > 0) {
        await supabase.from("listing_photos")
          .update({ featured: true })
          .in("id", Array.from(featuredIds));
      }
      if (heroId) {
        await supabase.from("listing_photos")
          .update({ is_hero: true })
          .eq("id", heroId);
      }
      await qc.invalidateQueries({ queryKey: ["listing-photos", id] });
      toast.success(`Scored ${results.length} photo${results.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  async function toggleFeatured(photoId: string, next: boolean) {
    await supabase.from("listing_photos").update({ featured: next }).eq("id", photoId);
    qc.invalidateQueries({ queryKey: ["listing-photos", id] });
  }

  async function setHero(photoId: string) {
    await supabase.from("listing_photos").update({ is_hero: false }).eq("listing_id", id);
    await supabase.from("listing_photos").update({ is_hero: true, featured: true }).eq("id", photoId);
    qc.invalidateQueries({ queryKey: ["listing-photos", id] });
    toast.success("Hero image set");
  }

  async function downloadSelected() {
    if (!photos) return;
    const featured = photos.filter((p) => p.featured);
    if (featured.length === 0) {
      toast.error("No photos selected");
      return;
    }
    setDownloadingAll(true);
    try {
      for (let i = 0; i < featured.length; i++) {
        const p = featured[i];
        const { data: signed } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(p.photo_url, 3600);
        if (!signed?.signedUrl) continue;
        const resp = await fetch(signed.signedUrl);
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        const ext = p.photo_url.split(".").pop()?.split("?")[0] || "jpg";
        const heroTag = p.is_hero ? "hero-" : "";
        a.download = `listing-${heroTag}${String(i + 1).padStart(2, "0")}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
        // small delay so browser doesn't drop rapid downloads
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(`Downloaded ${featured.length} photo${featured.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    } finally {
      setDownloadingAll(false);
    }
  }

  // -------- Photo enhancement --------
  const [recsById, setRecsById] = useState<Record<string, EnhanceRecs>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function analyzePhoto(p: PhotoRow): Promise<EnhanceRecs | null> {
    setAnalyzingId(p.id);
    try {
      const { data: signed } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(p.photo_url, 3600);
      const url = signed?.signedUrl;
      if (!url) throw new Error("Signed URL failed");
      const { data, error } = await supabase.functions.invoke("enhance-listing-photo", {
        body: { image_url: url },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const recs = data as EnhanceRecs;
      setRecsById((prev) => ({ ...prev, [p.id]: recs }));
      return recs;
    } catch (e: any) {
      toast.error(e?.message ?? "Enhancement analysis failed");
      return null;
    } finally {
      setAnalyzingId(null);
    }
  }

  async function applyEnhancement(p: PhotoRow) {
    const recs = recsById[p.id];
    if (!recs) return;
    setApplyingId(p.id);
    try {
      const { data: signed } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(p.photo_url, 3600);
      if (!signed?.signedUrl) throw new Error("Signed URL failed");
      const blob = await renderEnhancedBlob(signed.signedUrl, recs);
      const rawName = p.photo_url.split("/").pop() ?? `${p.id}.jpg`;
      const baseName = rawName.replace(/\.[^.]+$/, "");
      const enhancedPath = `listing-${id}/enhanced-${baseName}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("inspection-photos")
        .upload(enhancedPath, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("listing_photos")
        .update({ enhanced_url: enhancedPath })
        .eq("id", p.id);
      if (dbErr) throw dbErr;
      await qc.invalidateQueries({ queryKey: ["listing-photos", id] });
      toast.success("Enhanced version saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Apply failed");
    } finally {
      setApplyingId(null);
    }
  }

  async function resetEnhancement(p: PhotoRow) {
    setRecsById((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    if (p.enhanced_url) {
      try {
        await supabase.storage.from("inspection-photos").remove([p.enhanced_url]);
      } catch { /* ignore */ }
      await supabase.from("listing_photos").update({ enhanced_url: null }).eq("id", p.id);
      await qc.invalidateQueries({ queryKey: ["listing-photos", id] });
    }
    toast.success("Reset to original");
  }

  async function bulkEnhanceFeatured() {
    if (!photos) return;
    const featured = photos.filter((p) => p.featured);
    if (featured.length === 0) {
      toast.error("No featured photos to enhance");
      return;
    }
    setBulkEnhancing(true);
    setBulkProgress({ done: 0, total: featured.length });
    try {
      for (let i = 0; i < featured.length; i++) {
        setBulkProgress({ done: i, total: featured.length });
        await analyzePhoto(featured[i]);
      }
      setBulkProgress({ done: featured.length, total: featured.length });
      toast.success(`Analysed ${featured.length} photo${featured.length === 1 ? "" : "s"}. Review before/after and Apply.`);
    } finally {
      setBulkEnhancing(false);
    }
  }

  const scoredPhotos = useMemo(() => {
    return [...(photos ?? [])].sort((a, b) => {
      const sa = a.quality_score ?? -1;
      const sb = b.quality_score ?? -1;
      if (sb !== sa) return sb - sa;
      return 0;
    });
  }, [photos]);
  const hasScores = (photos ?? []).some((p) => (p.quality_score ?? null) !== null);
  const featuredCount = (photos ?? []).filter((p) => p.featured).length;

  // -------- Virtual staging --------
  const { data: plan = "free" } = usePlan(listing?.user_id);
  const { data: stagingUsed = 0, refetch: refetchStagingUsage } = useStagingThisMonth(listing?.user_id);
  const stagingLimit = STAGING_MONTHLY_LIMIT[plan];
  const stagingRemaining = stagingLimit === Infinity ? Infinity : Math.max(0, stagingLimit - stagingUsed);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [styleModalFor, setStyleModalFor] = useState<PhotoRow | "bulk" | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [bulkStaging, setBulkStaging] = useState(false);
  const [bulkStageProgress, setBulkStageProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  async function stagePhoto(p: PhotoRow, styleKey: string): Promise<boolean> {
    setStagingId(p.id);
    try {
      const { data: signed } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(p.photo_url, 3600);
      const url = signed?.signedUrl;
      if (!url) throw new Error("Signed URL failed");
      const { data, error } = await supabase.functions.invoke("stage-listing-photo", {
        body: { image_url: url, style: styleKey },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const stagedUrl = (data as any).staged_url as string;
      const resp = await fetch(stagedUrl);
      if (!resp.ok) throw new Error("Failed to fetch staged image");
      const blob = await resp.blob();
      const rawName = p.photo_url.split("/").pop() ?? `${p.id}.jpg`;
      const baseName = rawName.replace(/\.[^.]+$/, "");
      const stagedPath = `listing-${id}/staged-${baseName}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("inspection-photos")
        .upload(stagedPath, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("listing_photos")
        .update({ staged_url: stagedPath, staging_style: styleKey })
        .eq("id", p.id);
      if (dbErr) throw dbErr;
      await supabase.from("staging_usage").insert({
        user_id: listing!.user_id,
        listing_photo_id: p.id,
        style: styleKey,
      });
      await qc.invalidateQueries({ queryKey: ["listing-photos", id] });
      await refetchStagingUsage();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Staging failed");
      return false;
    } finally {
      setStagingId(null);
    }
  }

  async function handleStyleChosen(styleKey: string) {
    const target = styleModalFor;
    setStyleModalFor(null);
    if (!target) return;
    if (target === "bulk") {
      const featured = (photos ?? []).filter((p) => p.featured);
      if (featured.length === 0) return;
      if (stagingRemaining < featured.length) {
        toast.error(`Only ${stagingRemaining} staging credits remaining this month`);
        setShowUpgrade(true);
        return;
      }
      setBulkStaging(true);
      setBulkStageProgress({ done: 0, total: featured.length });
      for (let i = 0; i < featured.length; i++) {
        setBulkStageProgress({ done: i, total: featured.length });
        const ok = await stagePhoto(featured[i], styleKey);
        if (!ok) break;
      }
      setBulkStageProgress({ done: featured.length, total: featured.length });
      setBulkStaging(false);
      toast.success("Bulk staging complete");
    } else {
      if (stagingRemaining < 1) {
        setShowUpgrade(true);
        return;
      }
      const ok = await stagePhoto(target, styleKey);
      if (ok) toast.success("Staged version ready");
    }
  }

  function requestStage(target: PhotoRow | "bulk") {
    if (plan === "free") {
      setShowUpgrade(true);
      return;
    }
    if (stagingRemaining < 1) {
      setShowUpgrade(true);
      return;
    }
    setStyleModalFor(target);
  }

  const featuredPhotos = useMemo(() => (photos ?? []).filter((p) => p.featured), [photos]);

  const roomNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms ?? []) m.set(r.id, r.name);
    return m;
  }, [rooms]);

  const [exporting, setExporting] = useState(false);
  const canExport = hasGenerated && !!title && !!description;

  async function handleExport() {
    if (!listing || !property) return;
    if (!canExport) {
      toast.error("Generate a listing description first");
      return;
    }
    setExporting(true);
    try {
      await exportListingPackage({
        listing: {
          title,
          description,
          features,
          price_line: priceLine,
          listing_type: listing.listing_type,
          target_portal: listing.target_portal,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          asking_price: listing.asking_price,
        },
        property,
        photos: (photos ?? []) as any,
        roomNameById,
      });
      toast.success("Listing package downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
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
                <div className="flex gap-2">
                  <textarea
                    value={features}
                    onChange={(e) => setFeatures(e.target.value)}
                    rows={6}
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => copyText(features, "Features")}
                    className="self-start rounded-lg border border-border p-2 text-muted-foreground"
                    aria-label="Copy features"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
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

        {/* Best shots */}
        {hasGenerated ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Best shots</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  AI rates each photo on composition, lighting, and listing appeal.
                </p>
              </div>
              <button
                type="button"
                onClick={scorePhotos}
                disabled={scoring || !photos || photos.length === 0}
                className="flex min-h-10 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground disabled:opacity-60"
              >
                {scoring ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                {hasScores ? "Re-score" : "Select best shots"}
              </button>
            </div>

            {scoring ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Analysing photo {scoreProgress.done} of {scoreProgress.total}…
              </p>
            ) : null}

            {hasScores && !scoring ? (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {featuredCount} featured
                  </p>
                  <button
                    type="button"
                    onClick={bulkEnhanceFeatured}
                    disabled={bulkEnhancing || featuredCount === 0}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-teal px-3 text-xs font-semibold text-teal disabled:opacity-60"
                  >
                    {bulkEnhancing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    Enhance all featured
                  </button>
                </div>
                {bulkEnhancing ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Enhancing photo {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}…
                  </p>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {scoredPhotos.map((p) => (
                    <ScoredCard
                      key={p.id}
                      photo={p}
                      recs={recsById[p.id]}
                      analyzing={analyzingId === p.id}
                      applying={applyingId === p.id}
                      onEnhance={() => analyzePhoto(p)}
                      onApply={() => applyEnhancement(p)}
                      onReset={() => resetEnhancement(p)}
                      onToggleFeatured={(next) => toggleFeatured(p.id, next)}
                      onSetHero={() => setHero(p.id)}
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {featuredCount} selected for export
                  </p>
                  <button
                    type="button"
                    onClick={downloadSelected}
                    disabled={downloadingAll || featuredCount === 0}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-teal px-3 text-xs font-semibold text-teal disabled:opacity-60"
                  >
                    {downloadingAll ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Download selected photos
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {/* Virtual staging */}
        {hasScores && featuredPhotos.length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Virtual staging</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  AI-furnish featured rooms in the style of your choice.
                </p>
              </div>
              <button
                type="button"
                onClick={() => requestStage("bulk")}
                disabled={bulkStaging || featuredPhotos.length === 0}
                className="flex min-h-10 items-center gap-1.5 rounded-lg border border-teal px-3 text-xs font-semibold text-teal disabled:opacity-60"
              >
                {bulkStaging ? <Loader2 className="size-4 animate-spin" /> : <Sofa className="size-4" />}
                Stage all featured
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {stagingLimit === Infinity
                ? "Unlimited staging on your plan."
                : `${stagingRemaining} staged image${stagingRemaining === 1 ? "" : "s"} remaining this month.`}
            </p>
            {bulkStaging ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Staging photo {Math.min(bulkStageProgress.done + 1, bulkStageProgress.total)} of {bulkStageProgress.total}…
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {featuredPhotos.map((p) => (
                <StagedCard
                  key={p.id}
                  photo={p}
                  staging={stagingId === p.id}
                  onStage={() => requestStage(p)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Export listing package */}
        {canExport ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Export listing</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Download a ready-to-paste text file, featured photos (enhanced and staged where available), and a printable one-page PDF summary. Works with Trade Me Property, realestate.co.nz, PropertyMe, Palace, Rex, and more.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copyText(title, "Title")}
                className="flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground"
              >
                <Copy className="size-3.5" /> Copy title
              </button>
              <button
                type="button"
                onClick={() => copyText(description, "Description")}
                className="flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground"
              >
                <Copy className="size-3.5" /> Copy description
              </button>
              <button
                type="button"
                onClick={() => copyText(features, "Features")}
                className="flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground"
              >
                <Copy className="size-3.5" /> Copy features
              </button>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-60"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}
              Export listing package
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Includes {featuredPhotos.length} featured photo{featuredPhotos.length === 1 ? "" : "s"}. Tap photos above to change which are included.
            </p>
          </section>
        ) : null}
      </main>

      {styleModalFor ? (
        <StyleModal
          onClose={() => setStyleModalFor(null)}
          onChoose={handleStyleChosen}
          bulk={styleModalFor === "bulk"}
          bulkCount={featuredPhotos.length}
        />
      ) : null}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
}

function StyleModal({
  onClose,
  onChoose,
  bulk,
  bulkCount,
}: {
  onClose: () => void;
  onChoose: (styleKey: string) => void;
  bulk: boolean;
  bulkCount: number;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-background p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          <X className="size-5" />
        </button>
        <h3 className="pr-10 text-lg font-semibold text-foreground">Choose a style</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {bulk
            ? `Staging ${bulkCount} featured photo${bulkCount === 1 ? "" : "s"} in this style.`
            : "Applied to this photo."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {STAGING_STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onChoose(s.key)}
              className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-teal hover:bg-teal-light"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StagedCard({
  photo,
  staging,
  onStage,
}: {
  photo: PhotoRow;
  staging: boolean;
  onStage: () => void;
}) {
  const [origUrl, setOrigUrl] = useState<string | undefined>();
  const [stagedUrl, setStagedUrl] = useState<string | undefined>();
  const [showStaged, setShowStaged] = useState(true);
  useEffect(() => {
    let cancel = false;
    supabase.storage.from("inspection-photos").createSignedUrl(photo.photo_url, 3600).then(({ data }) => {
      if (!cancel) setOrigUrl(data?.signedUrl);
    });
    return () => { cancel = true; };
  }, [photo.photo_url]);
  useEffect(() => {
    let cancel = false;
    if (photo.staged_url) {
      supabase.storage.from("inspection-photos").createSignedUrl(photo.staged_url, 3600).then(({ data }) => {
        if (!cancel) setStagedUrl(data?.signedUrl);
      });
    } else {
      setStagedUrl(undefined);
    }
    return () => { cancel = true; };
  }, [photo.staged_url]);
  const hasStaged = !!photo.staged_url;
  const displaySrc = hasStaged && showStaged ? stagedUrl : origUrl;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {displaySrc ? <img src={displaySrc} alt="" className="size-full object-cover" /> : null}
        {staging ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
            <Loader2 className="size-5 animate-spin" />
            <p className="mt-1 text-[11px] font-medium">Staging in progress…</p>
          </div>
        ) : null}
        {hasStaged && !staging ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-teal px-1.5 py-0.5 text-[10px] font-semibold text-teal-foreground">
            {showStaged ? `Staged · ${photo.staging_style ?? ""}` : "Original"}
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5 p-2">
        {hasStaged ? (
          <button
            type="button"
            onClick={() => setShowStaged((v) => !v)}
            className="flex w-full items-center justify-center rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground"
          >
            {showStaged ? "Show original" : "Show staged"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStage}
          disabled={staging}
          className="flex min-h-8 w-full items-center justify-center gap-1 rounded-md bg-teal px-2 text-[11px] font-semibold text-teal-foreground disabled:opacity-60"
        >
          {staging ? <Loader2 className="size-3 animate-spin" /> : <Sofa className="size-3" />}
          {hasStaged ? "Try another style" : "Stage this room"}
        </button>
      </div>
    </div>
  );
}

function ScoredCard({
  photo,
  recs,
  analyzing,
  applying,
  onEnhance,
  onApply,
  onReset,
  onToggleFeatured,
  onSetHero,
}: {
  photo: PhotoRow;
  recs?: EnhanceRecs;
  analyzing: boolean;
  applying: boolean;
  onEnhance: () => void;
  onApply: () => void;
  onReset: () => void;
  onToggleFeatured: (next: boolean) => void;
  onSetHero: () => void;
}) {
  const [url, setUrl] = useState<string | undefined>();
  const [enhancedUrl, setEnhancedUrl] = useState<string | undefined>();
  const [showEnhanced, setShowEnhanced] = useState(false);
  useEffect(() => {
    let cancel = false;
    supabase.storage.from("inspection-photos").createSignedUrl(photo.photo_url, 3600).then(({ data }) => {
      if (!cancel) setUrl(data?.signedUrl);
    });
    return () => { cancel = true; };
  }, [photo.photo_url]);

  useEffect(() => {
    let cancel = false;
    if (photo.enhanced_url) {
      supabase.storage.from("inspection-photos").createSignedUrl(photo.enhanced_url, 3600).then(({ data }) => {
        if (!cancel) setEnhancedUrl(data?.signedUrl);
      });
    } else {
      setEnhancedUrl(undefined);
    }
    return () => { cancel = true; };
  }, [photo.enhanced_url]);

  // Auto-show enhanced preview once recs arrive
  useEffect(() => {
    if (recs) setShowEnhanced(true);
  }, [recs]);

  const score = photo.quality_score;
  const featured = !!photo.featured;
  const hasApplied = !!photo.enhanced_url;
  const filterStyle = recs && showEnhanced ? { filter: toFilterString(recs) } : undefined;
  const displaySrc = hasApplied && !recs ? enhancedUrl ?? url : url;

  return (
    <div className={`overflow-hidden rounded-lg border ${featured ? "border-teal ring-2 ring-teal" : "border-border"} bg-background`}>
      <button
        type="button"
        onClick={onSetHero}
        className="relative block aspect-square w-full overflow-hidden bg-muted"
        aria-label="Set as hero image"
      >
        {displaySrc ? (
          <img
            src={displaySrc}
            alt=""
            className="size-full object-cover transition-[filter] duration-200"
            style={filterStyle}
          />
        ) : null}
        {photo.is_hero ? (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-teal px-1.5 py-0.5 text-[10px] font-semibold text-teal-foreground">
            <Star className="size-3 fill-current" /> Hero
          </span>
        ) : null}
        {score !== null && score !== undefined ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
            {Number(score).toFixed(1)}/10
          </span>
        ) : null}
        {recs && showEnhanced ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-teal px-1.5 py-0.5 text-[10px] font-semibold text-teal-foreground">
            Enhanced
          </span>
        ) : recs && !showEnhanced ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
            Original
          </span>
        ) : hasApplied ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-teal/90 px-1.5 py-0.5 text-[10px] font-semibold text-teal-foreground">
            Applied
          </span>
        ) : null}
      </button>
      <div className="p-2">
        <label className="flex items-start gap-1.5 text-[11px] text-foreground">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => onToggleFeatured(e.target.checked)}
            className="mt-0.5 size-3.5 accent-teal"
          />
          <span className="line-clamp-3 text-muted-foreground">{photo.quality_reason || "—"}</span>
        </label>

        {!recs ? (
          <button
            type="button"
            onClick={onEnhance}
            disabled={analyzing}
            className="mt-2 flex min-h-8 w-full items-center justify-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-teal disabled:opacity-60"
          >
            {analyzing ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
            {hasApplied ? "Re-enhance" : "Enhance"}
          </button>
        ) : (
          <div className="mt-2 space-y-1.5">
            {recs.suggestion ? (
              <p className="text-[10px] leading-tight text-muted-foreground">{recs.suggestion}</p>
            ) : null}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setShowEnhanced((v) => !v)}
                className="flex-1 rounded-md border border-border px-1.5 py-1 text-[10px] font-semibold text-foreground"
              >
                {showEnhanced ? "Show original" : "Show enhanced"}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onApply}
                disabled={applying}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-teal px-1.5 py-1 text-[10px] font-semibold text-teal-foreground disabled:opacity-60"
              >
                {applying ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                Apply
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={applying}
                className="flex items-center justify-center gap-1 rounded-md border border-border px-1.5 py-1 text-[10px] font-semibold text-muted-foreground disabled:opacity-60"
                aria-label="Reset to original"
              >
                <RotateCcw className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}