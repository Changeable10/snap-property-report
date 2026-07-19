import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  AlertTriangle,
  X,
  Flame,
  Layers,
  Wind,
  Droplets,
  DoorClosed,
  BellRing,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_ACCEPT_ATTR, IMAGE_VALIDATION_ERROR, isAcceptedImage } from "@/lib/image-validation";

export const Route = createFileRoute("/_authenticated/inspection/$id/healthy-homes")({
  head: () => ({ meta: [{ title: "Healthy Homes assessment — Snapsure" }] }),
  component: HealthyHomesPage,
});

type StepKey = "heating" | "insulation" | "ventilation" | "moisture" | "draught" | "smoke";

const STEPS: { key: StepKey; label: string; short: string; Icon: typeof Flame }[] = [
  { key: "heating", label: "Heating", short: "Heat", Icon: Flame },
  { key: "insulation", label: "Insulation", short: "Insul", Icon: Layers },
  { key: "ventilation", label: "Ventilation", short: "Vent", Icon: Wind },
  { key: "moisture", label: "Moisture & Drainage", short: "Moist", Icon: Droplets },
  { key: "draught", label: "Draught Stopping", short: "Draught", Icon: DoorClosed },
  { key: "smoke", label: "Smoke Alarms", short: "Smoke", Icon: BellRing },
];

type HeaterType =
  | "heat_pump"
  | "flued_gas"
  | "wood_burner"
  | "pellet_burner"
  | "fixed_electric"
  | "portable"
  | "none"
  | "other";

const HEATER_OPTIONS: { value: HeaterType; label: string; nonCompliant?: boolean }[] = [
  { value: "heat_pump", label: "Heat pump" },
  { value: "flued_gas", label: "Flued gas heater" },
  { value: "wood_burner", label: "Wood burner" },
  { value: "pellet_burner", label: "Pellet burner" },
  { value: "fixed_electric", label: "Fixed electric heater" },
  { value: "portable", label: "Portable/plug-in heater (non-compliant)", nonCompliant: true },
  { value: "none", label: "No heater (non-compliant)", nonCompliant: true },
  { value: "other", label: "Other" },
];

type YesNo = "yes" | "no" | "";
type YesNoUnknown = "yes" | "no" | "unknown" | "";
type YesNoNA = "yes" | "no" | "na" | "";

interface HeatingData {
  heater_type?: HeaterType | "";
  length_m?: number | "";
  width_m?: number | "";
  ceiling_m?: number | "";
  heater_capacity_kw?: number | "";
  photo_path?: string | null;
  notes?: string;
}
interface InsulationData {
  ceiling?: YesNoUnknown;
  ceiling_thickness_mm?: number | "";
  underfloor?: YesNoNA;
  underfloor_thickness_mm?: number | "";
  condition_ok?: YesNo;
  photo_ceiling_path?: string | null;
  photo_underfloor_path?: string | null;
  notes?: string;
}
interface VentilationData {
  rooms?: Record<string, YesNo>;
  kitchen_fan?: YesNo;
  kitchen_duct_mm?: number | "";
  bathroom_fan?: YesNo;
  bathroom_duct_mm?: number | "";
  photo_kitchen_path?: string | null;
  photo_bathroom_path?: string | null;
  notes?: string;
}
interface MoistureData {
  gutters_ok?: YesNo;
  water_ingress?: YesNo;
  subfloor?: YesNo;
  moisture_barrier?: YesNo;
  photo_gutters_path?: string | null;
  photo_moisture_path?: string | null;
  photo_subfloor_path?: string | null;
  notes?: string;
}
interface DraughtData {
  gaps?: YesNo;
  gaps_description?: string;
  open_fireplace?: YesNo;
  fireplace_blocked?: YesNo;
  photo_gaps_path?: string | null;
  photo_fireplace_path?: string | null;
  notes?: string;
}
type SmokeAlarmType = "photoelectric" | "ionisation" | "combined" | "unknown" | "";
interface SmokeAlarmsData {
  present?: YesNo;
  count?: number | "";
  near_bedrooms?: YesNo;
  tested?: YesNo;
  alarm_type?: SmokeAlarmType;
  photo_path?: string | null;
  notes?: string;
}

type Status = "green" | "amber" | "red" | "unknown";

function evalHeating(d: HeatingData): { status: Status; minKw: number | null; areaM2: number | null } {
  const l = Number(d.length_m || 0);
  const w = Number(d.width_m || 0);
  const h = Number(d.ceiling_m || 2.4);
  const cap = Number(d.heater_capacity_kw || 0);
  const area = l > 0 && w > 0 ? l * w : null;
  const minKw = area != null ? area * h * 0.15 : null;
  if (d.heater_type === "portable" || d.heater_type === "none") return { status: "red", minKw, areaM2: area };
  if (!d.heater_type) return { status: "unknown", minKw, areaM2: area };
  if (minKw != null && cap > 0) {
    return { status: cap >= minKw ? "green" : "amber", minKw, areaM2: area };
  }
  return { status: "unknown", minKw, areaM2: area };
}

function evalInsulation(d: InsulationData): Status {
  if (d.ceiling === "no" || d.ceiling === "unknown") return "red";
  if (d.ceiling !== "yes") return "unknown";
  const ct = Number(d.ceiling_thickness_mm || 0);
  if (ct > 0 && ct < 120) return "amber";
  if (d.underfloor === "yes") {
    const ut = Number(d.underfloor_thickness_mm || 0);
    if (ut > 0 && ut < 120) return "amber";
  }
  if (d.condition_ok === "no") return "amber";
  return "green";
}

function evalVentilation(d: VentilationData): Status {
  const roomVals = Object.values(d.rooms ?? {});
  if (roomVals.some((v) => v === "no")) return "red";
  let amber = false;
  if (d.kitchen_fan === "yes") {
    const k = Number(d.kitchen_duct_mm || 0);
    if (k > 0 && k < 150) amber = true;
  }
  if (d.bathroom_fan === "yes") {
    const b = Number(d.bathroom_duct_mm || 0);
    if (b > 0 && b < 120) amber = true;
  }
  return amber ? "amber" : "green";
}

function evalMoisture(d: MoistureData): Status {
  if (d.water_ingress === "yes") return "red";
  if (d.gutters_ok === "no") return "amber";
  if (d.subfloor === "yes" && d.moisture_barrier === "no") return "amber";
  return "green";
}

function evalDraught(d: DraughtData): Status {
  if (d.gaps === "yes") return "amber";
  if (d.open_fireplace === "yes" && d.fireplace_blocked === "no") return "amber";
  return "green";
}

function evalSmoke(d: SmokeAlarmsData): Status {
  if (!d.present) return "unknown";
  if (d.present === "no") return "red";
  if (d.near_bedrooms === "no" || d.tested === "no") return "amber";
  if (!d.near_bedrooms || !d.tested) return "unknown";
  return "green";
}

function overallFrom(statuses: Status[]): "compliant" | "action_required" | "non_compliant" {
  if (statuses.some((s) => s === "red")) return "non_compliant";
  if (statuses.some((s) => s === "amber" || s === "unknown")) return "action_required";
  return "compliant";
}

function HealthyHomesPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", inspection!.property_id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["hh-assessment", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("healthy_homes_assessments")
        .select("*")
        .eq("inspection_id", id)
        .maybeSingle();
      return data;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  const [stepIdx, setStepIdx] = useState(0);
  const [heating, setHeating] = useState<HeatingData>({ ceiling_m: 2.4 });
  const [insulation, setInsulation] = useState<InsulationData>({});
  const [ventilation, setVentilation] = useState<VentilationData>({ rooms: {} });
  const [moisture, setMoisture] = useState<MoistureData>({});
  const [draught, setDraught] = useState<DraughtData>({});
  const [smoke, setSmoke] = useState<SmokeAlarmsData>({});
  const [showSummary, setShowSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || existing === undefined) return;
    hydrated.current = true;
    if (!existing) return;
    const hasKeys = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === "object" && Object.keys(v as object).length > 0;
    if (hasKeys(existing.heating_data)) setHeating(existing.heating_data as HeatingData);
    if (hasKeys(existing.insulation_data)) setInsulation(existing.insulation_data as InsulationData);
    if (hasKeys(existing.ventilation_data)) setVentilation(existing.ventilation_data as VentilationData);
    if (hasKeys(existing.moisture_data)) setMoisture(existing.moisture_data as MoistureData);
    if (hasKeys(existing.draught_data)) setDraught(existing.draught_data as DraughtData);
    const sa = (existing as { smoke_alarms_data?: unknown }).smoke_alarms_data;
    if (hasKeys(sa)) setSmoke(sa as SmokeAlarmsData);
  }, [existing]);

  const statuses = useMemo<Status[]>(
    () => [
      evalHeating(heating).status,
      evalInsulation(insulation),
      evalVentilation(ventilation),
      evalMoisture(moisture),
      evalDraught(draught),
      evalSmoke(smoke),
    ],
    [heating, insulation, ventilation, moisture, draught, smoke],
  );

  async function persist(patch: Partial<{
    heating_data: HeatingData;
    insulation_data: InsulationData;
    ventilation_data: VentilationData;
    moisture_data: MoistureData;
    draught_data: DraughtData;
    smoke_alarms_data: SmokeAlarmsData;
    overall_status: string;
  }>) {
    if (!inspection) return;
    const body = {
      inspection_id: id,
      property_id: inspection.property_id,
      user_id: user.id,
      heating_data: (patch.heating_data ?? heating) as unknown as Json,
      insulation_data: (patch.insulation_data ?? insulation) as unknown as Json,
      ventilation_data: (patch.ventilation_data ?? ventilation) as unknown as Json,
      moisture_data: (patch.moisture_data ?? moisture) as unknown as Json,
      draught_data: (patch.draught_data ?? draught) as unknown as Json,
      smoke_alarms_data: (patch.smoke_alarms_data ?? smoke) as unknown as Json,
      overall_status: patch.overall_status ?? "in_progress",
    };
    const { error } = await supabase
      .from("healthy_homes_assessments")
      .upsert(body, { onConflict: "inspection_id" });
    if (error) {
      toast.error(error.message);
      throw error;
    }
  }

  async function uploadPhoto(file: File, slot: string): Promise<string | null> {
    if (!inspection) return null;
    const path = `${user.id}/${id}/hh/${slot}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("inspection-photos")
      .upload(path, file, { contentType: file.type });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return path;
  }

  async function next() {
    try {
      await persist({});
    } catch {
      return;
    }
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
    else setShowSummary(true);
  }

  async function finish() {
    setSaving(true);
    const overall = overallFrom(statuses);
    await persist({ overall_status: overall });
    await supabase
      .from("inspections")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["hh-assessment", id] });
    toast.success("Healthy Homes assessment saved");
    setSaving(false);
    navigate({ to: "/inspection/$id/hh-report", params: { id } });
  }

  const current = STEPS[stepIdx];

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/inspection/setup/$propertyId"
            params={{ propertyId: inspection?.property_id ?? "" }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Healthy Homes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Six-standard compliance assessment
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 pt-4">
        <StepIndicator
          current={showSummary ? STEPS.length : stepIdx}
          statuses={statuses}
          onJump={(i) => {
            setShowSummary(false);
            setStepIdx(i);
          }}
        />
      </div>

      <main className="mx-auto max-w-md px-5 py-6">
        {showSummary ? (
          <Summary
            statuses={statuses}
            onEdit={(i) => {
              setShowSummary(false);
              setStepIdx(i);
            }}
            onFinish={finish}
            saving={saving}
          />
        ) : current.key === "heating" ? (
          <HeatingStep data={heating} setData={setHeating} uploadPhoto={uploadPhoto} />
        ) : current.key === "insulation" ? (
          <InsulationStep data={insulation} setData={setInsulation} uploadPhoto={uploadPhoto} />
        ) : current.key === "ventilation" ? (
          <VentilationStep
            data={ventilation}
            setData={setVentilation}
            rooms={rooms ?? []}
            uploadPhoto={uploadPhoto}
          />
        ) : current.key === "moisture" ? (
          <MoistureStep data={moisture} setData={setMoisture} uploadPhoto={uploadPhoto} />
        ) : current.key === "draught" ? (
          <DraughtStep data={draught} setData={setDraught} uploadPhoto={uploadPhoto} />
        ) : (
          <SmokeAlarmsStep data={smoke} setData={setSmoke} uploadPhoto={uploadPhoto} />
        )}
      </main>

      {!showSummary ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-3">
            <button
              type="button"
              onClick={() => stepIdx > 0 && setStepIdx(stepIdx - 1)}
              disabled={stepIdx === 0}
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-input bg-card text-sm font-semibold text-foreground disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={next}
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-teal text-sm font-semibold text-teal-foreground"
            >
              {stepIdx === STEPS.length - 1 ? "Review" : "Next"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepIndicator({
  current,
  statuses,
  onJump,
}: {
  current: number;
  statuses: Status[];
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const status = statuses[i];
        const dotClass = done
          ? status === "red"
            ? "bg-destructive text-destructive-foreground"
            : status === "amber"
              ? "bg-amber-500 text-white"
              : "bg-teal text-teal-foreground"
          : active
            ? "bg-teal text-teal-foreground"
            : "bg-muted text-muted-foreground";
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => (done || active ? onJump(i) : undefined)}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <div className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold", dotClass)}>
              {done ? <Check className="size-4" /> : i + 1}
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">{s.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  step = "any",
}: {
  value: number | "" | undefined;
  onChange: (n: number | "") => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      placeholder={placeholder}
      className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
    />
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | "" | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 flex-1 rounded-xl border px-3 text-sm font-semibold transition-colors",
              active
                ? "border-teal bg-teal-light text-teal-dark"
                : "border-input bg-card text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Alert({ tone, children }: { tone: "red" | "amber" | "green"; children: React.ReactNode }) {
  const toneClass =
    tone === "red"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        : "border-teal/40 bg-teal-light text-teal-dark";
  const Icon = tone === "green" ? Check : tone === "amber" ? AlertTriangle : X;
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", toneClass)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function PhotoButton({
  label,
  path,
  onUpload,
}: {
  label: string;
  path: string | null | undefined;
  onUpload: (file: File) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("inspection-photos")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-semibold text-foreground"
      >
        <Camera className="size-4" />
        {path ? "Replace" : label}
      </button>
      {url ? (
        <img src={url} alt="" className="size-11 rounded-lg object-cover" />
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_ACCEPT_ATTR}
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!isAcceptedImage(f)) { toast.error(IMAGE_VALIDATION_ERROR); return; }
          await onUpload(f);
        }}
      />
    </div>
  );
}

function Notes({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  return (
    <Field label="Notes">
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="rounded-xl border border-input bg-card px-3 py-2 text-base"
        placeholder="Any observations…"
      />
    </Field>
  );
}

function HeatingStep({
  data,
  setData,
  uploadPhoto,
}: {
  data: HeatingData;
  setData: (d: HeatingData) => void;
  uploadPhoto: (f: File, slot: string) => Promise<string | null>;
}) {
  const evalRes = evalHeating(data);
  const badChoice = data.heater_type === "portable" || data.heater_type === "none";
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Heating</h2>

      <Field label="Type of fixed heater in the main living room">
        <select
          value={data.heater_type ?? ""}
          onChange={(e) => setData({ ...data, heater_type: e.target.value as HeaterType })}
          className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
        >
          <option value="">Select…</option>
          {HEATER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {badChoice ? (
        <Alert tone="red">
          This does not meet the Healthy Homes heating standard. A fixed heater capable of warming the
          main living room to at least 18°C is required.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Length (m)">
          <NumInput value={data.length_m} onChange={(n) => setData({ ...data, length_m: n })} />
        </Field>
        <Field label="Width (m)">
          <NumInput value={data.width_m} onChange={(n) => setData({ ...data, width_m: n })} />
        </Field>
      </div>

      {evalRes.areaM2 != null ? (
        <div className="rounded-xl bg-muted px-4 py-2 text-sm">
          Room area: <span className="font-semibold">{evalRes.areaM2.toFixed(2)} m²</span>
        </div>
      ) : null}

      <Field label="Ceiling height (m)">
        <NumInput value={data.ceiling_m ?? 2.4} onChange={(n) => setData({ ...data, ceiling_m: n })} />
      </Field>

      {evalRes.minKw != null ? (
        <div className="rounded-xl bg-muted px-4 py-2 text-sm">
          Estimated minimum heating capacity:{" "}
          <span className="font-semibold">{evalRes.minKw.toFixed(1)} kW</span>
        </div>
      ) : null}

      <Field label="Heater capacity (kW)">
        <NumInput
          value={data.heater_capacity_kw}
          onChange={(n) => setData({ ...data, heater_capacity_kw: n })}
          placeholder="From heater label/manual"
        />
      </Field>

      {evalRes.minKw != null && Number(data.heater_capacity_kw || 0) > 0 && !badChoice ? (
        Number(data.heater_capacity_kw) >= evalRes.minKw ? (
          <Alert tone="green">Meets heating standard</Alert>
        ) : (
          <Alert tone="amber">Heater may be undersized — recommend professional assessment</Alert>
        )
      ) : null}

      <PhotoButton
        label="Take a photo of the heater and its label"
        path={data.photo_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "heater");
          if (p) setData({ ...data, photo_path: p });
        }}
      />

      <Notes value={data.notes} onChange={(v) => setData({ ...data, notes: v })} />
    </div>
  );
}

function InsulationStep({
  data,
  setData,
  uploadPhoto,
}: {
  data: InsulationData;
  setData: (d: InsulationData) => void;
  uploadPhoto: (f: File, slot: string) => Promise<string | null>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Insulation</h2>

      <Field label="Is there ceiling insulation?">
        <Segmented<YesNoUnknown>
          value={data.ceiling}
          onChange={(v) => setData({ ...data, ceiling: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
      </Field>

      {data.ceiling === "yes" ? (
        <>
          <Field label="Estimated ceiling insulation thickness (mm)">
            <NumInput
              value={data.ceiling_thickness_mm}
              onChange={(n) => setData({ ...data, ceiling_thickness_mm: n })}
            />
          </Field>
          {Number(data.ceiling_thickness_mm || 0) > 0 ? (
            Number(data.ceiling_thickness_mm) >= 120 ? (
              <Alert tone="green">Meets minimum ceiling thickness</Alert>
            ) : (
              <Alert tone="amber">May not meet minimum requirements</Alert>
            )
          ) : null}
        </>
      ) : data.ceiling ? (
        <Alert tone="red">Ceiling insulation is required in all rental properties</Alert>
      ) : null}

      <Field label="Is there underfloor insulation?">
        <Segmented<YesNoNA>
          value={data.underfloor}
          onChange={(v) => setData({ ...data, underfloor: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "na", label: "Slab" },
          ]}
        />
      </Field>

      {data.underfloor === "yes" ? (
        <>
          <Field label="Underfloor insulation thickness (mm)">
            <NumInput
              value={data.underfloor_thickness_mm}
              onChange={(n) => setData({ ...data, underfloor_thickness_mm: n })}
            />
          </Field>
          {Number(data.underfloor_thickness_mm || 0) > 0 ? (
            Number(data.underfloor_thickness_mm) >= 120 ? (
              <Alert tone="green">Meets minimum underfloor thickness</Alert>
            ) : (
              <Alert tone="amber">May not meet minimum requirements</Alert>
            )
          ) : null}
        </>
      ) : null}

      <Field label="Is the insulation in reasonable condition? (no gaps, mould, dampness, damage)">
        <Segmented<YesNo>
          value={data.condition_ok}
          onChange={(v) => setData({ ...data, condition_ok: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>

      <PhotoButton
        label="Ceiling insulation photo"
        path={data.photo_ceiling_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "insulation-ceiling");
          if (p) setData({ ...data, photo_ceiling_path: p });
        }}
      />
      <PhotoButton
        label="Underfloor insulation photo"
        path={data.photo_underfloor_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "insulation-underfloor");
          if (p) setData({ ...data, photo_underfloor_path: p });
        }}
      />

      <Notes value={data.notes} onChange={(v) => setData({ ...data, notes: v })} />
    </div>
  );
}

function VentilationStep({
  data,
  setData,
  rooms,
  uploadPhoto,
}: {
  data: VentilationData;
  setData: (d: VentilationData) => void;
  rooms: { id: string; name: string }[];
  uploadPhoto: (f: File, slot: string) => Promise<string | null>;
}) {
  const roomsMap = data.rooms ?? {};
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Ventilation</h2>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          Does each habitable room have an openable window, door, or skylight to the outside?
        </p>
        {rooms.length === 0 ? (
          <p className="text-xs text-muted-foreground">No rooms found for this property.</p>
        ) : (
          rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{r.name}</span>
              <div className="w-40">
                <Segmented<YesNo>
                  value={roomsMap[r.id] ?? ""}
                  onChange={(v) => setData({ ...data, rooms: { ...roomsMap, [r.id]: v } })}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <Field label="Does the kitchen have an extractor fan?">
        <Segmented<YesNo>
          value={data.kitchen_fan}
          onChange={(v) => setData({ ...data, kitchen_fan: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>
      {data.kitchen_fan === "yes" ? (
        <>
          <Field label="Kitchen fan duct diameter (mm)">
            <NumInput
              value={data.kitchen_duct_mm}
              onChange={(n) => setData({ ...data, kitchen_duct_mm: n })}
            />
          </Field>
          {Number(data.kitchen_duct_mm || 0) > 0 ? (
            Number(data.kitchen_duct_mm) >= 150 ? (
              <Alert tone="green">Meets kitchen ventilation standard</Alert>
            ) : (
              <Alert tone="amber">Duct may be undersized (min 150mm)</Alert>
            )
          ) : null}
        </>
      ) : null}

      <Field label="Does the bathroom have an extractor fan?">
        <Segmented<YesNo>
          value={data.bathroom_fan}
          onChange={(v) => setData({ ...data, bathroom_fan: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>
      {data.bathroom_fan === "yes" ? (
        <>
          <Field label="Bathroom fan duct diameter (mm)">
            <NumInput
              value={data.bathroom_duct_mm}
              onChange={(n) => setData({ ...data, bathroom_duct_mm: n })}
            />
          </Field>
          {Number(data.bathroom_duct_mm || 0) > 0 ? (
            Number(data.bathroom_duct_mm) >= 120 ? (
              <Alert tone="green">Meets bathroom ventilation standard</Alert>
            ) : (
              <Alert tone="amber">Duct may be undersized (min 120mm)</Alert>
            )
          ) : null}
        </>
      ) : null}

      <PhotoButton
        label="Kitchen fan photo"
        path={data.photo_kitchen_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "vent-kitchen");
          if (p) setData({ ...data, photo_kitchen_path: p });
        }}
      />
      <PhotoButton
        label="Bathroom fan photo"
        path={data.photo_bathroom_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "vent-bathroom");
          if (p) setData({ ...data, photo_bathroom_path: p });
        }}
      />

      <Notes value={data.notes} onChange={(v) => setData({ ...data, notes: v })} />
    </div>
  );
}

function MoistureStep({
  data,
  setData,
  uploadPhoto,
}: {
  data: MoistureData;
  setData: (d: MoistureData) => void;
  uploadPhoto: (f: File, slot: string) => Promise<string | null>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Moisture & Drainage</h2>

      <Field label="Are gutters and downpipes clear and functional?">
        <Segmented<YesNo>
          value={data.gutters_ok}
          onChange={(v) => setData({ ...data, gutters_ok: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>

      <Field label="Any visible water ingress? (staining, leaks)">
        <Segmented<YesNo>
          value={data.water_ingress}
          onChange={(v) => setData({ ...data, water_ingress: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>
      {data.water_ingress === "yes" ? (
        <Alert tone="red">Water ingress is non-compliant</Alert>
      ) : null}

      <Field label="Does the property have a subfloor space?">
        <Segmented<YesNo>
          value={data.subfloor}
          onChange={(v) => setData({ ...data, subfloor: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>
      {data.subfloor === "yes" ? (
        <Field label="Is a ground moisture barrier (polythene) installed?">
          <Segmented<YesNo>
            value={data.moisture_barrier}
            onChange={(v) => setData({ ...data, moisture_barrier: v })}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>
      ) : null}

      <PhotoButton
        label="Gutters/downpipes photo"
        path={data.photo_gutters_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "moisture-gutters");
          if (p) setData({ ...data, photo_gutters_path: p });
        }}
      />
      <PhotoButton
        label="Moisture issues photo"
        path={data.photo_moisture_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "moisture-issues");
          if (p) setData({ ...data, photo_moisture_path: p });
        }}
      />
      <PhotoButton
        label="Subfloor photo"
        path={data.photo_subfloor_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "moisture-subfloor");
          if (p) setData({ ...data, photo_subfloor_path: p });
        }}
      />

      <Notes value={data.notes} onChange={(v) => setData({ ...data, notes: v })} />
    </div>
  );
}

function DraughtStep({
  data,
  setData,
  uploadPhoto,
}: {
  data: DraughtData;
  setData: (d: DraughtData) => void;
  uploadPhoto: (f: File, slot: string) => Promise<string | null>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Draught Stopping</h2>

      <Field label="Any unreasonable gaps or holes in walls, ceilings, windows, floors, or doors?">
        <Segmented<YesNo>
          value={data.gaps}
          onChange={(v) => setData({ ...data, gaps: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>
      {data.gaps === "yes" ? (
        <Field label="Describe the gaps">
          <input
            type="text"
            value={data.gaps_description ?? ""}
            onChange={(e) => setData({ ...data, gaps_description: e.target.value })}
            className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
          />
        </Field>
      ) : null}

      <Field label="Does the property have an open fireplace?">
        <Segmented<YesNo>
          value={data.open_fireplace}
          onChange={(v) => setData({ ...data, open_fireplace: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>
      {data.open_fireplace === "yes" ? (
        <>
          <Field label="Is it blocked/sealed?">
            <Segmented<YesNo>
              value={data.fireplace_blocked}
              onChange={(v) => setData({ ...data, fireplace_blocked: v })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          </Field>
          {data.fireplace_blocked === "no" ? (
            <Alert tone="amber">
              Open fireplaces must be blocked unless the tenant has agreed in writing to keep it usable.
            </Alert>
          ) : null}
        </>
      ) : null}

      <PhotoButton
        label="Gaps or holes photo"
        path={data.photo_gaps_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "draught-gaps");
          if (p) setData({ ...data, photo_gaps_path: p });
        }}
      />
      <PhotoButton
        label="Fireplace photo"
        path={data.photo_fireplace_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "draught-fireplace");
          if (p) setData({ ...data, photo_fireplace_path: p });
        }}
      />

      <Notes value={data.notes} onChange={(v) => setData({ ...data, notes: v })} />
    </div>
  );
}

function SmokeAlarmsStep({
  data,
  setData,
  uploadPhoto,
}: {
  data: SmokeAlarmsData;
  setData: (d: SmokeAlarmsData) => void;
  uploadPhoto: (f: File, slot: string) => Promise<string | null>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Smoke Alarms</h2>

      <Field label="Are there working smoke alarms installed?">
        <Segmented<YesNo>
          value={data.present}
          onChange={(v) => setData({ ...data, present: v })}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </Field>

      {data.present === "no" ? (
        <Alert tone="red">
          Working smoke alarms are required in all rental properties. The landlord must ensure
          they are installed and working at the start of every tenancy.
        </Alert>
      ) : null}

      {data.present === "yes" ? (
        <>
          <Field label="How many smoke alarms?">
            <NumInput
              value={data.count}
              onChange={(n) => setData({ ...data, count: n })}
              step="1"
            />
          </Field>

          <Field label="Are smoke alarms installed near each bedroom / sleeping area?">
            <Segmented<YesNo>
              value={data.near_bedrooms}
              onChange={(v) => setData({ ...data, near_bedrooms: v })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          </Field>
          {data.near_bedrooms === "no" ? (
            <Alert tone="amber">
              Smoke alarms should be installed within 3m of each bedroom door (or in every bedroom
              where occupants smoke).
            </Alert>
          ) : null}

          <Field label="Have the smoke alarms been tested?">
            <Segmented<YesNo>
              value={data.tested}
              onChange={(v) => setData({ ...data, tested: v })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          </Field>
          {data.tested === "no" ? (
            <Alert tone="amber">Smoke alarms should be tested at the start of each tenancy.</Alert>
          ) : null}

          <Field label="Type of smoke alarms">
            <select
              value={data.alarm_type ?? ""}
              onChange={(e) =>
                setData({ ...data, alarm_type: e.target.value as SmokeAlarmType })
              }
              className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
            >
              <option value="">Select…</option>
              <option value="photoelectric">Photoelectric (recommended)</option>
              <option value="ionisation">Ionisation</option>
              <option value="combined">Combined photoelectric/ionisation</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
        </>
      ) : null}

      <PhotoButton
        label="Take a photo of a smoke alarm"
        path={data.photo_path}
        onUpload={async (f) => {
          const p = await uploadPhoto(f, "smoke-alarm");
          if (p) setData({ ...data, photo_path: p });
        }}
      />

      <Notes value={data.notes} onChange={(v) => setData({ ...data, notes: v })} />
    </div>
  );
}

function Summary({
  statuses,
  onEdit,
  onFinish,
  saving,
}: {
  statuses: Status[];
  onEdit: (i: number) => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const overall = overallFrom(statuses);
  const overallLabel =
    overall === "compliant"
      ? "Compliant"
      : overall === "non_compliant"
        ? "Non-compliant"
        : "Action required";
  const overallTone: "green" | "amber" | "red" =
    overall === "compliant" ? "green" : overall === "non_compliant" ? "red" : "amber";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">Compliance summary</h2>

      <Alert tone={overallTone}>
        <div className="text-sm font-semibold">Overall: {overallLabel}</div>
      </Alert>

      <div className="flex flex-col gap-2">
        {STEPS.map((s, i) => {
          const st = statuses[i];
          const Icon = st === "green" ? Check : st === "amber" ? AlertTriangle : st === "red" ? X : AlertTriangle;
          const cls =
            st === "green"
              ? "bg-teal text-teal-foreground"
              : st === "amber"
                ? "bg-amber-500 text-white"
                : st === "red"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground";
          return (
            <div key={s.key} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className={cn("flex size-9 items-center justify-center rounded-full", cls)}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{s.label}</div>
                <div className="text-xs text-muted-foreground">
                  {st === "green"
                    ? "Meets standard"
                    : st === "amber"
                      ? "Action recommended"
                      : st === "red"
                        ? "Non-compliant"
                        : "Incomplete"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEdit(i)}
                className="text-sm font-semibold text-teal"
              >
                Edit
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onFinish}
        disabled={saving}
        className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground disabled:opacity-60"
      >
        {saving ? "Saving…" : "Generate report"}
      </button>

      <p className="text-xs text-muted-foreground">
        This assessment is a self-assessment guide based on the Healthy Homes Standards. It does not
        replace a professional compliance assessment. For certified compliance, engage a qualified
        assessor.
      </p>
    </div>
  );
}