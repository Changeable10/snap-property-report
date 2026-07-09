import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, PenLine, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  generateReportPdf, reportFilename,
  type PdfProperty, type PdfInspection, type PdfRoom,
  type PdfItem, type PdfPhoto, type PdfSignature,
} from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/inspection/$id/report")({
  head: () => ({ meta: [{ title: "Report — Snapsure" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("inspection-report.pdf");
  const [generating, setGenerating] = useState(true);

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
        .select("id,room_id,photo_url,captured_at")
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

  useEffect(() => {
    if (!inspection || !property || !rooms || !items || !photos || !signatures) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setGenerating(true);
      setFilename(reportFilename(property, inspection));
      const blob = await generateReportPdf({
        inspection, property, rooms, items, photos, signatures,
      });
      createdUrl = URL.createObjectURL(blob);
      if (!cancelled) {
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
  }, [inspection, property, rooms, items, photos, signatures]);

  function download() {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share() {
    if (!pdfUrl) return;
    try {
      await navigator.clipboard.writeText(pdfUrl);
      toast.success("Report link copied to clipboard");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

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

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Link to="/inspection/$id/sign" params={{ id }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark">
            <PenLine className="size-4" /> Sign report
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={download} disabled={!pdfUrl}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-50">
              <Download className="size-4" /> Download PDF
            </button>
            <button type="button" onClick={share} disabled={!pdfUrl}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-50">
              <Share2 className="size-4" /> Share
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}