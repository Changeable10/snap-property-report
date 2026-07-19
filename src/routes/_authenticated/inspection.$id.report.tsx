import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, PenLine, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  generateReportPdf, reportFilename, refNumber,
  type PdfProperty, type PdfInspection, type PdfRoom,
  type PdfItem, type PdfPhoto, type PdfSignature, type PdfComparisonChange,
} from "@/lib/report-pdf";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadPdfBranding } from "@/lib/branding";
import { useResolvedInspectorName } from "@/lib/display-name";

export const Route = createFileRoute("/_authenticated/inspection/$id/report")({
  head: () => ({ meta: [{ title: "Report — Snapsure" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const isMobile = useIsMobile();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("inspection-report.pdf");
  const [generating, setGenerating] = useState(true);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections")
        .select("id, property_id, inspection_type, inspection_date, inspector_name, tenant_names")
        .eq("id", id).single();
      if (error) throw error;
      return data as PdfInspection;
    },
  });
  const resolvedInspectorName = useResolvedInspectorName({
    user,
    inspectorName: inspection?.inspector_name,
    propertyId: inspection?.property_id,
  });

  const { data: property } = useQuery({
    queryKey: ["property", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties")
        .select("id,address,suburb,city,postcode,property_type,bedrooms,bathrooms")
        .eq("id", inspection!.property_id).single();
      if (error) throw error;
      return data as PdfProperty;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", inspection!.property_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PdfRoom[];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["inspection-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description,maintenance_required,maintenance_notes,sort_order")
        .eq("inspection_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PdfItem[];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["inspection-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_photos")
        .select("id,room_id,photo_url,enhanced_url,captured_at,inspection_item_id,voice_transcript,ai_classification")
        .eq("inspection_id", id)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PdfPhoto[];
    },
  });

  const { data: signatures } = useQuery({
    queryKey: ["inspection-signatures", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_signatures")
        .select("signer_role, signer_name, signature_data, signed_at")
        .eq("inspection_id", id);
      if (error) throw error;
      return (data ?? []) as PdfSignature[];
    },
  });

  const { data: changes } = useQuery({
    queryKey: ["comparison-photo-changes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("comparison_results")
        .select("id, room_id, item_name, description, severity, status, changes_detected")
        .eq("inspection_id", id)
        .eq("status", "confirmed")
        .not("changes_detected", "is", null);
      if (error) throw error;
      return (data ?? []) as PdfComparisonChange[];
    },
  });

  useEffect(() => {
    if (!inspection || !property || !rooms || !items || !photos || !signatures || !changes) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setGenerating(true);
      setFilename(reportFilename(property, inspection));
      const branding = await loadPdfBranding();
      const inspectionForPdf: PdfInspection = {
        ...inspection,
        inspector_name: resolvedInspectorName || inspection.inspector_name,
      };
      const blob = await generateReportPdf({
        inspection: inspectionForPdf, property, rooms, items, photos, changes, signatures, branding,
      });
      createdUrl = URL.createObjectURL(blob);
      if (!cancelled) {
        setPdfBlob(blob);
        setPdfUrl(createdUrl);
        setGenerating(false);
      } else {
        URL.revokeObjectURL(createdUrl);
      }
    })().catch((e) => {
      console.error(e);
      if (!cancelled) {
        toast.error("Failed to generate report");
        setGenerating(false);
      }
    });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [inspection, property, rooms, items, photos, signatures, changes, resolvedInspectorName]);

  function download() {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    if (!pdfBlob) return;
    const file = new File([pdfBlob], filename, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch { /* user cancelled */ return; }
    }
    try {
      await navigator.clipboard.writeText(pdfUrl ?? "");
      toast.success("Report link copied to clipboard");
    } catch {
      toast.error("Couldn't share report");
    }
  }

  const summary = useMemo(() => {
    const counts = { excellent: 0, good: 0, fair: 0, poor: 0, damaged: 0 } as Record<string, number>;
    (items ?? []).forEach((i) => {
      const c = String(i.condition ?? "").toLowerCase();
      if (c in counts) counts[c] += 1;
    });
    return counts;
  }, [items]);

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link to="/inspection/$id/review" params={{ id }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Report preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Compliant NZ tenancy inspection report.</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        {isMobile ? (
          <MobileSummary
            generating={generating}
            inspection={inspection}
            property={property}
            itemCount={items?.length ?? 0}
            maintenanceCount={items?.filter((i) => i.maintenance_required).length ?? 0}
            counts={summary}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {generating || !pdfUrl ? (
              <div className="flex aspect-[1/1.4] items-center justify-center text-sm text-muted-foreground">
                Generating report…
              </div>
            ) : (
              <iframe title="Report preview" src={pdfUrl}
                className="block h-[70vh] w-full border-0" />
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Link to="/inspection/$id/sign" params={{ id }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark">
            <PenLine className="size-4" /> Sign report
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={download} disabled={!pdfBlob}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-50">
              <Download className="size-4" /> Download PDF
            </button>
            <button type="button" onClick={share} disabled={!pdfBlob}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-50">
              <Share2 className="size-4" /> Share
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function MobileSummary({
  generating, inspection, property, itemCount, maintenanceCount, counts,
}: {
  generating: boolean;
  inspection: PdfInspection | undefined;
  property: PdfProperty | undefined;
  itemCount: number;
  maintenanceCount: number;
  counts: Record<string, number>;
}) {
  const ref = inspection ? refNumber(inspection.id) : "—";
  const address = property
    ? [property.address, property.suburb, property.city, property.postcode].filter(Boolean).join(", ")
    : "—";
  const type = inspection?.inspection_type
    ? inspection.inspection_type.charAt(0).toUpperCase() + inspection.inspection_type.slice(1)
    : "—";
  const date = inspection?.inspection_date
    ? new Date(inspection.inspection_date).toLocaleDateString("en-NZ", {
        day: "numeric", month: "short", year: "numeric",
      })
    : "—";

  const bars: Array<[string, string, number]> = [
    ["Excellent", "bg-emerald-500", counts.excellent ?? 0],
    ["Good", "bg-teal", counts.good ?? 0],
    ["Fair", "bg-amber-400", counts.fair ?? 0],
    ["Poor", "bg-orange-500", counts.poor ?? 0],
    ["Damaged", "bg-red-500", counts.damaged ?? 0],
  ];
  const total = bars.reduce((s, [, , n]) => s + n, 0) || 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {generating ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Preparing report…</p>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Report</p>
            <p className="text-base font-semibold text-foreground">{ref}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="Property" value={address} />
            <Row label="Inspection" value={`${type} · ${date}`} />
            <Row label="Items" value={`${itemCount} inspected · ${maintenanceCount} need maintenance`} />
          </dl>
          <div className="mt-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Condition breakdown</p>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {bars.map(([label, color, n]) =>
                n > 0 ? (
                  <div key={label} className={color} style={{ width: `${(n / total) * 100}%` }} />
                ) : null,
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground">
              {bars.map(([label, color, n]) => (
                <li key={label} className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${color}`} />
                  <span className="text-muted-foreground">{label}</span>
                  <span className="ml-auto font-medium">{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 rounded-lg bg-muted p-3 text-center text-xs text-muted-foreground">
            Tap Download PDF to view or save the full report.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}