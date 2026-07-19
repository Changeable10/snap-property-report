import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, CheckCircle2, Mail, PenLine, Share2, Download, Home,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Condition } from "@/lib/parse-transcript";
import {
  generateReportPdf, refNumber, reportFilename,
  type PdfInspection, type PdfProperty, type PdfRoom, type PdfItem, type PdfPhoto,
  type PdfSignature,
} from "@/lib/report-pdf";
import { toast } from "sonner";
import { loadPdfBranding } from "@/lib/branding";
import { sendEmail, newToken, emailWrap } from "@/lib/email-client";
import { useResolvedInspectorName } from "@/lib/display-name";

export const Route = createFileRoute("/_authenticated/inspection/$id/sign")({
  head: () => ({ meta: [{ title: "Sign — Snapsure" }] }),
  component: SignPage,
});

const DECLARATION =
  "This property inspection report has been completed by the parties listed below. Both parties confirm that the report accurately reflects the condition of the property at the time of inspection.";

type SigRow = {
  id: string; signer_role: "landlord" | "tenant"; signer_name: string;
  signature_data: string; signed_at: string;
};

function SignPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections")
        .select("id, property_id, inspection_type, inspection_date, inspector_name, tenant_names, status")
        .eq("id", id).single();
      if (error) throw error;
      return data as PdfInspection & { status: string };
    },
  });
  const resolvedInspectorName = useResolvedInspectorName({
    user,
    inspectorName: inspection?.inspector_name,
    propertyId: inspection?.property_id,
  });

  const { data: signatures } = useQuery({
    queryKey: ["inspection-signatures", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_signatures")
        .select("id, signer_role, signer_name, signature_data, signed_at")
        .eq("inspection_id", id)
        .order("signed_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SigRow[];
    },
  });

  const landlordSig = signatures?.find((s) => s.signer_role === "landlord");
  const tenantSig = signatures?.find((s) => s.signer_role === "tenant");
  const bothSigned = !!landlordSig && !!tenantSig;
  const isFinalised = inspection?.status === "signed";

  // Latch: once we're on the completion screen, never leave it until the user
  // taps "Back to dashboard". This prevents any query refetch or transient
  // undefined state from re-rendering the signature UI.
  const [showCompletion, setShowCompletion] = useState(false);
  useEffect(() => {
    if (isFinalised) setShowCompletion(true);
  }, [isFinalised]);

  const [tenantMode, setTenantMode] = useState<"choose" | "device" | "sent">("choose");
  const [tenantEmail, setTenantEmail] = useState("");
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  async function saveSignature(role: "landlord" | "tenant", name: string, dataUrl: string) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { toast.error("Not signed in"); return; }
    const { error } = await supabase.from("inspection_signatures").insert({
      user_id: userData.user.id,
      inspection_id: id,
      signer_role: role,
      signer_name: name,
      signature_data: dataUrl,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Signature saved");
    qc.invalidateQueries({ queryKey: ["inspection-signatures", id] });
  }

  async function sendTenantSignatureEmail(email: string) {
    if (!inspection) return;
    setSendingInvite(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const token = newToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const { error: tokErr } = await supabase.from("signature_tokens").insert({
        inspection_id: id,
        created_by: userData.user.id,
        email,
        token,
        expires_at: expiresAt,
      });
      if (tokErr) throw tokErr;
      const link = `${window.location.origin}/sign/${id}/${token}`;
      const html = emailWrap(`
        <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">Please sign your inspection report</h2>
        <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5">
          You've been asked to review and sign the property inspection report.
          The link below opens a secure page where you can review a summary and sign directly from your device.
        </p>
        <p style="margin:24px 0">
          <a href="${link}" style="display:inline-block;background:#0F6E56;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">Review and sign report</a>
        </p>
        <p style="margin:0;color:#64748b;font-size:12px">This link expires in 7 days.</p>
      `);
      await sendEmail({
        to: email,
        subject: `Signature requested — Inspection ${refNumber(id)}`,
        body: html,
      });
      setSentEmail(email);
      setTenantMode("sent");
      toast.success("Signature request sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setSendingInvite(false);
    }
  }

  async function finalise() {
    const { error } = await supabase.from("inspections")
      .update({ status: "signed" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setShowCompletion(true);
    qc.invalidateQueries({ queryKey: ["inspection", id] });
  }

  if (showCompletion) {
    return (
      <CompletionScreen
        inspectionId={id}
        onBack={() => navigate({ to: "/" as never })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link to="/inspection/$id/report" params={{ id }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Signatures</h1>
          <p className="mt-1 text-sm text-muted-foreground">Collect signatures to finalise the inspection.</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6 space-y-6">
        <div className="rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
          {DECLARATION}
        </div>

        {/* Landlord */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">Landlord / Agent</h2>
            <p className="text-xs text-muted-foreground">
              {inspection ? resolvedInspectorName : "—"} · Inspector
            </p>
          </header>

          {landlordSig ? (
            <SignedConfirmation sig={landlordSig} />
          ) : (
            <SignaturePad
              onAccept={(dataUrl) =>
                saveSignature("landlord", resolvedInspectorName || "Inspector", dataUrl)
              }
            />
          )}
        </section>

        {/* Tenant — only after landlord */}
        {landlordSig ? (
          <section className="rounded-2xl border border-border bg-card p-4">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Tenant</h2>
              <p className="text-xs text-muted-foreground">
                {inspection?.tenant_names ?? "—"}
              </p>
            </header>

            {tenantSig ? (
              <SignedConfirmation sig={tenantSig} />
            ) : tenantMode === "sent" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-foreground">
                  Signature request sent to <strong>{sentEmail}</strong>.
                </p>
                <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Awaiting signature
                </span>
                <button type="button"
                  onClick={() => setTenantMode("choose")}
                  className="ml-3 text-xs font-medium text-teal underline">
                  Choose another option
                </button>
              </div>
            ) : tenantMode === "device" ? (
              <div>
                <SignaturePad
                  onAccept={(dataUrl) =>
                    saveSignature("tenant", inspection?.tenant_names ?? "Tenant", dataUrl)
                  }
                />
                <button type="button" onClick={() => setTenantMode("choose")}
                  className="mt-2 text-xs font-medium text-teal underline">
                  Send via email instead
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Send via email
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      placeholder="tenant@example.com"
                      className="flex-1 min-h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-teal"
                    />
                    <button
                      type="button"
                      disabled={!tenantEmail.trim() || sendingInvite}
                      onClick={() => sendTenantSignatureEmail(tenantEmail.trim())}
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-teal px-3 text-sm font-semibold text-teal-foreground disabled:opacity-50 hover:bg-teal-dark"
                    >
                      <Mail className="size-4" /> {sendingInvite ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
                </div>
                <button
                  type="button"
                  onClick={() => setTenantMode("device")}
                  className="flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-teal bg-background px-3 text-sm font-semibold text-teal hover:bg-teal/5"
                >
                  <PenLine className="size-4" /> Sign on this device
                </button>
              </div>
            )}
          </section>
        ) : null}

        {bothSigned ? (
          <button
            type="button"
            onClick={finalise}
            className="flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark"
          >
            <CheckCircle2 className="size-4" /> Finalise report
          </button>
        ) : null}
      </main>
    </div>
  );
}

function SignedConfirmation({ sig }: { sig: SigRow }) {
  const d = new Date(sig.signed_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-900">Signed by {sig.signer_name}</p>
        <p className="text-xs text-emerald-800">{when}</p>
        {sig.signature_data ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={sig.signature_data} className="mt-2 h-12 rounded bg-white p-1" alt="Signature" />
        ) : null}
      </div>
    </div>
  );
}

// -------------------- Signature Pad --------------------

function SignaturePad({ onAccept }: { onAccept: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const height = 160;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, height);
        ctx.strokeStyle = "#0F6E56";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    };
    resize();
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pointFrom(e);
    setHasDrawn(true);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointFrom(e);
    const last = lastRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastRef.current = p;
  }
  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasDrawn(false);
  }

  function accept() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL("image/png");
    onAccept(dataUrl);
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-border bg-white"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="block"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {/* Dashed sign-here guide */}
        <div className="pointer-events-none absolute inset-x-4 bottom-6 border-t border-dashed border-slate-300" />
        {!hasDrawn ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs uppercase tracking-wide text-slate-400">
            Sign here
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={clear}
          className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium text-foreground hover:bg-muted"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={!hasDrawn}
          className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-teal px-3 text-sm font-semibold text-teal-foreground disabled:opacity-50 hover:bg-teal-dark"
        >
          Accept signature
        </button>
      </div>
    </div>
  );
}

// -------------------- Completion Screen --------------------

function CompletionScreen({ inspectionId, onBack }: { inspectionId: string; onBack: () => void }) {
  const { data: inspection } = useQuery({
    queryKey: ["inspection", inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections")
        .select("id, property_id, inspection_type, inspection_date, inspector_name, tenant_names")
        .eq("id", inspectionId).single();
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
    queryKey: ["inspection-items", inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description,maintenance_required,maintenance_notes,sort_order")
        .eq("inspection_id", inspectionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PdfItem[];
    },
  });
  const { data: photos } = useQuery({
    queryKey: ["inspection-photos", inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_photos")
        .select("id,room_id,photo_url,captured_at")
        .eq("inspection_id", inspectionId)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PdfPhoto[];
    },
  });
  const { data: signatures } = useQuery({
    queryKey: ["inspection-signatures", inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_signatures")
        .select("signer_role, signer_name, signature_data, signed_at")
        .eq("inspection_id", inspectionId);
      if (error) throw error;
      return (data ?? []) as PdfSignature[];
    },
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(true);
  const [sending, setSending] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const filename = useMemo(() => {
    if (!property || !inspection) return "inspection-report.pdf";
    return reportFilename(property, inspection);
  }, [property, inspection]);

  useEffect(() => {
    if (!inspection || !property || !rooms || !items || !photos || !signatures) return;
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      setGenerating(true);
      try {
        const branding = await loadPdfBranding();
        const blob = await generateReportPdf({
          inspection, property, rooms, items, photos, signatures, branding,
        });
        created = URL.createObjectURL(blob);
        if (!cancelled) { setPdfUrl(created); setPdfBlob(blob); setGenerating(false); }
        else URL.revokeObjectURL(created);
      } catch (e) {
        console.error(e);
        if (!cancelled) { toast.error("Failed to regenerate report"); setGenerating(false); }
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
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
  async function emailReport(to: string) {
    if (!pdfBlob || !inspection) return;
    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      // Storage RLS requires the first folder segment to equal auth.uid().
      const path = `${userData.user.id}/reports/${inspection.id}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("inspection-photos")
        .upload(path, pdfBlob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const ref = refNumber(inspection.id);
      const html = emailWrap(`
        <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">Inspection Report ${ref}</h2>
        <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5">
          Your property inspection report is attached as a PDF.
        </p>
      `);
      await sendEmail({
        to,
        subject: `Inspection Report ${ref}`,
        body: html,
        attachmentUrl: `inspection-photos:${path}`,
        attachmentFilename: filename,
      });
      toast.success("Report emailed");
      setEmailModalOpen(false);
      setEmailInput("");
      setEmailError(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to email report");
    } finally {
      setSending(false);
    }
  }

  function submitEmailModal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const to = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    setEmailError(null);
    void emailReport(to);
  }

  const itemCount = items?.length ?? 0;
  const maintenanceCount = items?.filter((i) => i.maintenance_required).length ?? 0;
  const landlordDone = !!signatures?.some((s) => s.signer_role === "landlord");
  const tenantDone = !!signatures?.some((s) => s.signer_role === "tenant");
  const ref = inspection ? refNumber(inspection.id) : "—";

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="mx-auto max-w-md px-5 py-10 space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="size-9 text-emerald-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            Report finalised
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{ref}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <dl className="space-y-2">
            <Row label="Filename" value={filename} />
            <Row label="Items inspected" value={String(itemCount)} />
            <Row label="Maintenance items" value={String(maintenanceCount)} />
            <Row
              label="Signatures"
              value={`Landlord ${landlordDone ? "✓" : "—"} · Tenant ${tenantDone ? "✓" : "—"}`}
            />
          </dl>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={download} disabled={!pdfUrl || generating}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
            <Download className="size-4" /> Download
          </button>
          <button type="button" onClick={() => { setEmailError(null); setEmailModalOpen(true); }}
            disabled={!pdfBlob || sending}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-muted">
            <Mail className="size-4" /> {sending ? "Sending…" : "Email"}
          </button>
          <button type="button" onClick={share} disabled={!pdfUrl}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
            <Share2 className="size-4" /> Share
          </button>
        </div>

        <p className="rounded-xl bg-muted p-3 text-center text-xs text-muted-foreground">
          This report is saved to the property's inspection history.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark"
        >
          <Home className="size-4" /> Back to dashboard
        </button>
      </main>

      {emailModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-report-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"
          onClick={() => { if (!sending) setEmailModalOpen(false); }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitEmailModal}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
          >
            <h2 id="email-report-title" className="text-base font-semibold text-foreground">
              Email report
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              We'll send the PDF report as an attachment.
            </p>
            <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="email-report-input">
              Recipient email
            </label>
            <input
              id="email-report-input"
              type="email"
              autoFocus
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); if (emailError) setEmailError(null); }}
              placeholder="name@example.com"
              className="mt-1 w-full min-h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-teal"
              disabled={sending}
              required
            />
            {emailError ? (
              <p className="mt-2 text-xs text-red-600">{emailError}</p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                disabled={sending}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || !emailInput.trim()}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-teal px-3 text-sm font-semibold text-teal-foreground hover:bg-teal-dark disabled:opacity-50"
              >
                <Mail className="size-4" /> {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}