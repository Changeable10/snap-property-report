// Client-side CSV export helpers.

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  // BOM so Excel opens UTF-8 correctly
  return "\ufeff" + lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- Inspection export ----------

export interface InspectionExportRow {
  id: string;
  inspection_type: string;
  inspection_date: string;
  status: string;
  inspector_name: string | null;
  tenant_names: string | null;
  property: { address: string; suburb: string | null; city: string | null } | null;
}

export interface InspectionItemAgg {
  inspection_id: string;
  condition: string;
  maintenance_required: boolean;
}

export const INSPECTION_CSV_HEADERS = [
  "property_address",
  "suburb",
  "city",
  "inspection_type",
  "date",
  "status",
  "total_items",
  "good_count",
  "fair_count",
  "poor_count",
  "damaged_count",
  "maintenance_items",
  "tenant_name",
  "inspector_name",
];

export function buildInspectionCsv(
  inspections: InspectionExportRow[],
  items: InspectionItemAgg[],
): string {
  const byId = new Map<string, { total: number; good: number; fair: number; poor: number; damaged: number; maint: number }>();
  for (const it of items) {
    const cur = byId.get(it.inspection_id) ?? { total: 0, good: 0, fair: 0, poor: 0, damaged: 0, maint: 0 };
    cur.total++;
    if (it.condition === "good") cur.good++;
    else if (it.condition === "fair") cur.fair++;
    else if (it.condition === "poor") cur.poor++;
    else if (it.condition === "damaged") cur.damaged++;
    if (it.maintenance_required) cur.maint++;
    byId.set(it.inspection_id, cur);
  }
  const rows = inspections.map((ins) => {
    const c = byId.get(ins.id) ?? { total: 0, good: 0, fair: 0, poor: 0, damaged: 0, maint: 0 };
    return [
      ins.property?.address ?? "",
      ins.property?.suburb ?? "",
      ins.property?.city ?? "",
      ins.inspection_type,
      ins.inspection_date,
      ins.status,
      c.total,
      c.good,
      c.fair,
      c.poor,
      c.damaged,
      c.maint,
      ins.tenant_names ?? "",
      ins.inspector_name ?? "",
    ];
  });
  return toCsv(INSPECTION_CSV_HEADERS, rows);
}

// ---------- Maintenance export ----------

export interface MaintenanceExportRow {
  property_address: string;
  room: string;
  item: string;
  issue: string;
  priority: string;
  status: string;
  date_flagged: string;
  date_resolved: string;
  inspection_type: string;
}

export const MAINTENANCE_CSV_HEADERS = [
  "property_address",
  "room",
  "item",
  "issue",
  "priority",
  "status",
  "date_flagged",
  "date_resolved",
  "inspection_type",
];

export function buildMaintenanceCsv(rows: MaintenanceExportRow[]): string {
  return toCsv(
    MAINTENANCE_CSV_HEADERS,
    rows.map((r) => [
      r.property_address,
      r.room,
      r.item,
      r.issue,
      r.priority,
      r.status,
      r.date_flagged,
      r.date_resolved,
      r.inspection_type,
    ]),
  );
}