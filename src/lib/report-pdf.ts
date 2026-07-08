import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { Condition } from "@/lib/parse-transcript";

export interface PdfProperty {
  id: string; address: string; suburb: string; city: string; postcode: string;
  property_type: string; bedrooms: number; bathrooms: number;
}
export interface PdfInspection {
  id: string; property_id: string; inspection_type: "entry" | "routine" | "exit";
  inspection_date: string; inspector_name: string; tenant_names: string | null;
}
export interface PdfRoom { id: string; name: string; sort_order: number }
export interface PdfItem {
  id: string; room_id: string; item_name: string; condition: Condition;
  description: string | null; maintenance_required: boolean;
  maintenance_notes: string | null; sort_order: number;
}
export interface PdfPhoto { id: string; room_id: string; photo_url: string; captured_at: string }
export interface PdfSignature {
  signer_role: "landlord" | "tenant";
  signer_name: string;
  signature_data: string;
  signed_at: string;
}

const COND_RGB: Record<Condition, [number, number, number]> = {
  good: [34, 139, 92],
  fair: [217, 155, 38],
  poor: [217, 108, 38],
  damaged: [200, 45, 45],
};
const COND_LABEL: Record<Condition, string> = {
  good: "Good", fair: "Fair", poor: "Poor", damaged: "Damaged",
};

function formatDMY(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function refNumber(inspectionId: string) {
  const hex = inspectionId.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16) % 100000;
  return `SNP-2026-${String(n).padStart(5, "0")}`;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function reportFilename(property: PdfProperty, inspection: PdfInspection) {
  return `${slugify(property.address)}-${inspection.inspection_type}-${inspection.inspection_date}.pdf`;
}

async function fetchPhotoDataUrl(path: string) {
  try {
    const { data, error } = await supabase.storage.from("inspection-photos").download(path);
    if (error || !data) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(data);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 800, h: 600 });
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

export interface GenerateReportArgs {
  inspection: PdfInspection;
  property: PdfProperty;
  rooms: PdfRoom[];
  items: PdfItem[];
  photos: PdfPhoto[];
  signatures?: PdfSignature[];
}

export async function generateReportPdf({
  inspection, property, rooms, items, photos, signatures = [],
}: GenerateReportArgs): Promise<Blob> {
  const ref = refNumber(inspection.id);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;

  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 110, 86);
  doc.text("Property Inspection Report", margin, y + 4);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(`Report reference: ${ref}`, margin, y + 4);
  y += 12;

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 110, 86);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(15, 110, 86);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30);
  };

  const kv = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(90);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(value, contentW - 45);
    doc.text(lines, margin + 45, y);
    y += 5 * (Array.isArray(lines) ? lines.length : 1) + 1;
  };

  section("Property Details");
  kv("Address", property.address);
  kv("Suburb", property.suburb);
  kv("City", property.city);
  kv("Postcode", property.postcode);
  kv("Property type", property.property_type);
  kv("Bedrooms / Bathrooms", `${property.bedrooms} bed · ${property.bathrooms} bath`);
  y += 4;

  section("Inspection Details");
  kv("Inspection type", inspection.inspection_type.charAt(0).toUpperCase() + inspection.inspection_type.slice(1));
  kv("Date", formatDMY(inspection.inspection_date));
  kv("Inspector", inspection.inspector_name);
  kv("Tenant(s)", inspection.tenant_names || "—");
  y += 4;

  section("Condition Summary");
  const counts: Record<Condition, number> = { good: 0, fair: 0, poor: 0, damaged: 0 };
  for (const it of items) counts[it.condition]++;
  const conds: Condition[] = ["good", "fair", "poor", "damaged"];
  const boxW = (contentW - 9) / 4;
  const boxH = 20;
  conds.forEach((c, i) => {
    const x = margin + i * (boxW + 3);
    const [r, g, b] = COND_RGB[c];
    doc.setFillColor(r, g, b);
    doc.rect(x, y, boxW, boxH, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(String(counts[c]), x + boxW / 2, y + 9, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(COND_LABEL[c], x + boxW / 2, y + 15, { align: "center" });
  });
  y += boxH + 8;

  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const maintenance = items.filter((i) => i.maintenance_required);
  if (maintenance.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = margin; }
    section("Maintenance Items");
    autoTable(doc, {
      startY: y,
      head: [["Room", "Item", "Notes"]],
      body: maintenance.map((m) => [
        roomsById.get(m.room_id)?.name ?? "",
        m.item_name,
        m.maintenance_notes ?? "",
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2.5, textColor: 30 },
      headStyles: { fillColor: [15, 110, 86], textColor: 255 },
      alternateRowStyles: { fillColor: [246, 246, 246] },
      theme: "grid",
    });
    // @ts-expect-error autoTable augments doc
    y = doc.lastAutoTable.finalY + 8;
  }

  const itemsByRoom = new Map<string, PdfItem[]>();
  for (const it of items) {
    const arr = itemsByRoom.get(it.room_id) ?? [];
    arr.push(it); itemsByRoom.set(it.room_id, arr);
  }
  const photosByRoom = new Map<string, PdfPhoto[]>();
  for (const p of photos) {
    const arr = photosByRoom.get(p.room_id) ?? [];
    arr.push(p); photosByRoom.set(p.room_id, arr);
  }

  for (const room of rooms) {
    const rItems = itemsByRoom.get(room.id) ?? [];
    const rPhotos = photosByRoom.get(room.id) ?? [];
    if (rItems.length === 0 && rPhotos.length === 0) continue;

    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 110, 86);
    doc.text(room.name, margin, y + 2);
    y += 8;

    if (rItems.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Item", "Condition", "Description", "Maintenance"]],
        body: rItems.map((it) => [
          it.item_name,
          COND_LABEL[it.condition],
          it.description ?? "",
          it.maintenance_required ? "Yes" : "No",
        ]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 2.5, textColor: 30, valign: "top" },
        headStyles: { fillColor: [15, 110, 86], textColor: 255 },
        alternateRowStyles: { fillColor: [246, 246, 246] },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: "bold" },
          1: { cellWidth: 22, fontStyle: "bold" },
          2: { cellWidth: "auto" },
          3: { cellWidth: 25, halign: "center" },
        },
        theme: "grid",
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 1) {
            const cond = rItems[data.row.index].condition;
            data.cell.styles.textColor = COND_RGB[cond];
          }
        },
      });
      // @ts-expect-error autoTable augments doc
      y = doc.lastAutoTable.finalY + 6;
    }

    for (const p of rPhotos) {
      const img = await fetchPhotoDataUrl(p.photo_url);
      if (!img) continue;
      const maxW = contentW;
      const maxH = 90;
      const ratio = img.w / img.h;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      if (y + h > pageH - margin - 10) {
        doc.addPage(); y = margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 110, 86);
        doc.text(`${room.name} (continued)`, margin, y);
        y += 6;
      }
      try {
        doc.addImage(img.dataUrl, "JPEG", margin, y, w, h, undefined, "FAST");
      } catch {
        try { doc.addImage(img.dataUrl, "PNG", margin, y, w, h); } catch { /* skip */ }
      }
      y += h + 4;
    }
  }

  // Signature page
  doc.addPage();
  y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 110, 86);
  doc.text("Signatures", margin, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30);
  const intro = "This property inspection report has been completed by the parties listed below. Both parties confirm that the report accurately reflects the condition of the property at the time of inspection.";
  const introLines = doc.splitTextToSize(intro, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * 5 + 10;

  const sigByRole = new Map(signatures.map((s) => [s.signer_role, s]));

  const drawSigBlock = (label: string, role: "landlord" | "tenant", startY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 110, 86);
    doc.text(label, margin, startY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.setDrawColor(180);

    const sig = sigByRole.get(role);
    let yy = startY + 8;

    // Name
    doc.text("Name", margin, yy);
    if (sig) {
      doc.setTextColor(20);
      doc.text(sig.signer_name, margin + 25, yy);
      doc.setTextColor(60);
    }
    doc.line(margin + 25, yy + 1, pageW - margin, yy + 1);
    yy += 12;

    // Signature
    doc.text("Signature", margin, yy);
    if (sig?.signature_data) {
      try {
        doc.addImage(sig.signature_data, "PNG", margin + 25, yy - 10, 60, 14);
      } catch { /* skip */ }
    }
    doc.line(margin + 25, yy + 1, pageW - margin, yy + 1);
    yy += 12;

    // Date
    doc.text("Date", margin, yy);
    if (sig) {
      doc.setTextColor(20);
      const d = new Date(sig.signed_at);
      doc.text(d.toLocaleString(), margin + 25, yy);
      doc.setTextColor(60);
    }
    doc.line(margin + 25, yy + 1, pageW - margin, yy + 1);
    yy += 12;

    return yy;
  };

  const afterLandlord = drawSigBlock("Landlord / Agent", "landlord", y);
  drawSigBlock("Tenant", "tenant", afterLandlord + 8);

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.setDrawColor(220);
    doc.line(margin, pageH - 15, pageW - margin, pageH - 15);
    doc.text(`${ref}  ·  ${property.address}`, margin, pageH - 10);
    doc.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 10, { align: "center" });
    doc.text("Generated by Snapsure", pageW - margin, pageH - 10, { align: "right" });
  }

  return doc.output("blob");
}