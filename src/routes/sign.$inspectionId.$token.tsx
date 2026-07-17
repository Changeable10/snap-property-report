import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

type SummaryResp = {
  inspection: {
    id: string;
    inspection_type: string;
    inspection_date: string;
    inspector_name: string | null;
    tenant_names: string[] | null;
  };
  property: { address: string; suburb: string | null; city: string | null; postcode: string | null } | null;
  itemCount: number;
  maintenanceCount: number;
  email: string;
};

export const Route = createFileRoute("/sign/$inspectionId/$token")({
  head: () => ({
    meta: [
      { title: "Sign Inspection Report — Snapsure" },
      { name: "description", content: "Review and sign your inspection report." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <div className="p-10 text-center text-slate-600">Something went wrong. Please try the link again.</div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center text-slate-600">Signature link not found.</div>
  ),
  component: PublicSignPage,
});

function PublicSignPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "ready" | "expired" | "used" | "missing" | "done" | "error">("loading");
  const [data, setData] = useState<SummaryResp | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/public/signature-token/${token}`);
        if (r.status === 410) {
          const b = await r.json().catch(() => ({}));
          setState(b?.error === "already_used" ? "used" : "expired");
          return;
        }
        if (r.status === 404) {
          setState("missing");
          return;
        }
        if (!r.ok) {
          setState("error");
          return;
        }
        const j = (await r.json()) as SummaryResp;
        setData(j);
        setState("ready");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (state === "expired" || state === "used" || state === "missing" || state === "error") {
    const msg =
      state === "expired" ? "This signature link has expired." :
      state === "used" ? "This signature link has already been used." :
      state === "missing" ? "This signature link is invalid." :
      "Something went wrong loading this link.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full"><CardContent className="p-6 text-center text-slate-700">{msg}</CardContent></Card>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h1 className="text-xl font-semibold text-slate-900">Thanks — signature received</h1>
            <p className="text-slate-600 text-sm">Your signature has been added to the inspection report.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const propAddr = data?.property
    ? [data.property.address, data.property.suburb, data.property.city, data.property.postcode].filter(Boolean).join(", ")
    : "";

  async function submit(signatureData: string) {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/signature-token/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signerName: name.trim(), signatureData }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        toast.error(b?.error === "already_used" ? "Already signed" : "Failed to submit signature");
        setSubmitting(false);
        return;
      }
      setState("done");
    } catch {
      toast.error("Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Sign inspection report</h1>
        <Card>
          <CardHeader><CardTitle className="text-base">Inspection summary</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-700 space-y-1">
            <div><span className="text-slate-500">Property:</span> {propAddr || "—"}</div>
            <div><span className="text-slate-500">Type:</span> {data?.inspection.inspection_type}</div>
            <div><span className="text-slate-500">Date:</span> {new Date(data!.inspection.inspection_date).toLocaleDateString()}</div>
            <div><span className="text-slate-500">Inspector:</span> {data?.inspection.inspector_name ?? "—"}</div>
            <div><span className="text-slate-500">Items recorded:</span> {data?.itemCount}</div>
            <div><span className="text-slate-500">Maintenance flagged:</span> {data?.maintenanceCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Your signature</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="signer-name">Full name</Label>
              <Input id="signer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <PublicSignaturePad disabled={submitting} onSubmit={submit} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PublicSignaturePad({ onSubmit, disabled }: { onSubmit: (dataUrl: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  function pos(e: PointerEvent | React.PointerEvent) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: (e as PointerEvent).clientX - r.left, y: (e as PointerEvent).clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setEmpty(false);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function up() {
    drawing.current = false;
  }
  function clear() {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }
  function submit() {
    if (empty || !ref.current) return;
    onSubmit(ref.current.toDataURL("image/png"));
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={ref}
        className="w-full h-48 bg-white border border-slate-300 rounded-md touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={clear} disabled={disabled}>Clear</Button>
        <Button type="button" onClick={submit} disabled={disabled || empty}>Submit signature</Button>
      </div>
    </div>
  );
}