import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Share2, Home, CheckCircle2, AlertTriangle, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  generateHhReportPdf, hhReportFilename, hhRefNumber,
  evalHeating, evalInsulation, evalVentilation, evalMoisture, evalDraught, evalSmoke, evalOverall,
  type HhAssessment, type HhPdfInspection, type HhPdfProperty, type HhPdfSignature, type HhStatus,
} from "@/lib/hh-report-pdf";

export const Route = createFileRoute("/_authenticated/inspection/$id/hh-report")({
  head: () => ({ meta: [{ title: "Healthy Homes report — Snapsure" }] }),
  component: HhReportPage,
});

const STEP_LABELS = ["Heating", "Insulation", "Ventilation", "Moisture & Drainage", "Draught Stopping", "Smoke Alarms"] as const;

function HhReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState("healthy-homes-report.pdf");
  const [generating, setGenerating] = useState(true);

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections")
        .select("id,property_id,inspection_date,inspector_name")
        .eq("id", id).single();
      if (error) throw error;
      return data as HhPdfInspection;
    },
  });

  const { data: property } = useQuery({
    queryKey: ["property", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties")
        .select("id,address,suburb,city,postcode,property_type")
        .eq("id", inspection!.property_id).single();
      if (error) throw error;
      return data as HhPdfProperty;
    },
  });

  const { data: assessment } = useQuery({
    queryKey: ["hh-assessment", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("healthy_homes_assessments")
        .select("heating_data,insulation_data,ventilation_data,moisture_data,draught_data,smoke_alarms_data,overall_status")
        .eq("inspection_id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as HhAssessment | null;
    },
  });

  const { data: signatures } = useQuery({
    queryKey: ["inspection-signatures", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_signatures")
        .select("signer_role, signer_name, signature_data, signed_at")
        .eq("inspection_id", id);
      if (error) throw error;
      return (data ?? []) as HhPdfSignature[];
    },
  });

  useEffect(() => {
    if (!inspection || !property || assessment === undefined || !signatures) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      setGenerating(true);
      setFilename(hhReportFilename(property, inspection));
      const a: HhAssessment = assessment ?? {
        heating_data: null, insulation_data: null, ventilation_data: null,
        moisture_data: null, draught_data: null, smoke_alarms_data: null,
        overall_status: null,
      };
      const blob = await generateHhReportPdf({
        property, inspection, assessment: a, signatures,
      });
      url = URL.createObjectURL(blob);
      if (!cancelled) {
        setPdfBlob(blob);
        setPdfUrl(url);
        setGenerating(false);
      } else {
        URL.revokeObjectURL(url);
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
      if (url) URL.revokeObjectURL(url);
    };
  }, [inspection, property, assessment, signatures]);

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
      } catch { return; }
    }
    try {
      await navigator.clipboard.writeText(pdfUrl ?? "");
      toast.success("Report link copied to clipboard");
    } catch {
      toast.error("Couldn't share report");
    }
  }

  function emailReport() {
    const subject = encodeURIComponent(`Healthy Homes assessment — ${property?.address ?? ""}`);
    const body = encodeURIComponent(
      `Please find attached the Healthy Homes compliance assessment for ${property?.address ?? "the property"}.\n\nReport reference: ${inspection ? hhRefNumber(inspection.id) : ""}\n\n— Sent from Snapsure`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  const statuses: HhStatus[] = assessment
    ? [
        evalHeating(assessment.heating_data),
        evalInsulation(assessment.insulation_data),
        evalVentilation(assessment.ventilation_data),
        evalMoisture(assessment.moisture_data),
        evalDraught(assessment.draught_data),
        evalSmoke(assessment.smoke_alarms_data),
      ]
    : ["unknown", "unknown", "unknown", "unknown", "unknown", "unknown"];
  const overall = evalOverall(statuses);
  const overallLabel =
    overall === "compliant" ? "Compliant"
    : overall === "non_compliant" ? "Non-compliant"
    : "Action required";
  const overallTone =
    overall === "compliant" ? "bg-condition-good/15 text-condition-good ring-condition-good/40"
    : overall === "non_compliant" ? "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40"
    : "bg-condition-fair/15 text-condition-fair ring-condition-fair/40";

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/property/$id"
            params={{ id: inspection?.property_id ?? "" }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Healthy Homes report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Self-assessment against the NZ Healthy Homes Standards.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-inset ${overallTone}`}>
          {overall === "compliant" ? <CheckCircle2 className="size-4" /> : overall === "non_compliant" ? <XIcon className="size-4" /> : <AlertTriangle className="size-4" />}
          <span className="text-sm font-semibold">Overall: {overallLabel}</span>
        </div>

        {isMobile ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            {generating ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Preparing report…</p>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Report</p>
                <p className="text-base font-semibold text-foreground">
                  {inspection ? hhRefNumber(inspection.id) : "—"}
                </p>
                {property ? (
                  <p className="mt-2 text-sm text-foreground">
                    {[property.address, property.suburb, property.city, property.postcode].filter(Boolean).join(", ")}
                  </p>
                ) : null}
                <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                  {STEP_LABELS.map((label, i) => (
                    <li key={label} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <StatusChip status={statuses[i]} />
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-lg bg-muted p-3 text-center text-xs text-muted-foreground">
                  Tap Download PDF to view or save the full report.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {generating || !pdfUrl ? (
              <div className="flex aspect-[1/1.4] items-center justify-center text-sm text-muted-foreground">
                Generating report…
              </div>
            ) : (
              <iframe title="Healthy Homes report" src={pdfUrl} className="block h-[70vh] w-full border-0" />
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={download} disabled={!pdfBlob}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-50">
              <Download className="size-4" /> Download PDF
            </button>
            <button type="button" onClick={share} disabled={!pdfBlob}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-50">
              <Share2 className="size-4" /> Share
            </button>
          </div>
          <button type="button" onClick={emailReport} disabled={!pdfBlob}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-50">
            Email report
          </button>
          <button
            type="button"
            onClick={() => inspection && navigate({ to: "/property/$id", params: { id: inspection.property_id } })}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground"
          >
            <Home className="size-4" /> Back to property
          </button>
        </div>
      </main>
    </div>
  );
}

function StatusChip({ status }: { status: HhStatus }) {
  const cfg =
    status === "green" ? { cls: "bg-condition-good/15 text-condition-good", label: "Compliant" }
    : status === "amber" ? { cls: "bg-condition-fair/15 text-condition-fair", label: "Action" }
    : status === "red" ? { cls: "bg-condition-damaged/15 text-condition-damaged", label: "Non-compliant" }
    : { cls: "bg-muted text-muted-foreground", label: "Incomplete" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}