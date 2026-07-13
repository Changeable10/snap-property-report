import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export interface ExportListing {
  title: string | null;
  description: string | null;
  features: string | null;
  price_line?: string | null;
  listing_type: string;
  target_portal: string;
  bedrooms: number | null;
  bathrooms: number | null;
  asking_price: string | null;
}

export interface ExportProperty {
  address: string | null;
  suburb: string | null;
  city: string | null;
  postcode: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
}

export interface ExportPhoto {
  id: string;
  photo_url: string;
  enhanced_url?: string | null;
  staged_url?: string | null;
  staging_style?: string | null;
  is_hero?: boolean;
  featured?: boolean;
  room_id?: string | null;
}

export function slugify(input: string, fallback = "listing"): string {
  const s = (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

function extFromPath(path: string): string {
  const m = path.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  return (m ? m[1] : "jpg").toLowerCase();
}

async function signedBlob(path: string): Promise<{ blob: Blob; ext: string } | null> {
  const { data } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  const resp = await fetch(data.signedUrl);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  return { blob, ext: extFromPath(path) };
}

function buildDescriptionText(l: ExportListing, p: ExportProperty): string {
  const addressLine = [p.address, p.suburb, p.city, p.postcode].filter(Boolean).join(", ");
  const parts: string[] = [];
  parts.push(l.title || "Listing");
  parts.push("=".repeat((l.title || "Listing").length));
  parts.push("");
  if (addressLine) { parts.push(addressLine); parts.push(""); }
  const details: string[] = [];
  if (l.bedrooms ?? p.bedrooms) details.push(`${l.bedrooms ?? p.bedrooms} bed`);
  if (l.bathrooms ?? p.bathrooms) details.push(`${l.bathrooms ?? p.bathrooms} bath`);
  if (p.property_type) details.push(String(p.property_type));
  if (details.length) { parts.push(details.join(" • ")); parts.push(""); }
  if (l.price_line) { parts.push(l.price_line); parts.push(""); }
  else if (l.asking_price) { parts.push(l.asking_price); parts.push(""); }
  parts.push("Description");
  parts.push("-----------");
  parts.push(l.description || "");
  parts.push("");
  parts.push("Features");
  parts.push("--------");
  parts.push(l.features || "");
  parts.push("");
  return parts.join("\n");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

async function buildSummaryPdf(
  l: ExportListing,
  p: ExportProperty,
  heroBlob: Blob | null,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Hero image
  if (heroBlob) {
    try {
      const dataUrl = await blobToDataUrl(heroBlob);
      const imgW = pageW - margin * 2;
      const imgH = imgW * 0.5625; // 16:9
      doc.addImage(dataUrl, "JPEG", margin, y, imgW, imgH, undefined, "FAST");
      y += imgH + 6;
    } catch { /* skip image */ }
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const title = l.title || "Listing";
  const titleLines = doc.splitTextToSize(title, pageW - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 2;

  // Address
  const addressLine = [p.address, p.suburb, p.city, p.postcode].filter(Boolean).join(", ");
  if (addressLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    const addrLines = doc.splitTextToSize(addressLine, pageW - margin * 2);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 5 + 2;
  }

  // Key details line
  doc.setTextColor(15, 110, 86); // teal
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const details: string[] = [];
  if (l.bedrooms ?? p.bedrooms) details.push(`${l.bedrooms ?? p.bedrooms} bed`);
  if (l.bathrooms ?? p.bathrooms) details.push(`${l.bathrooms ?? p.bathrooms} bath`);
  if (p.property_type) details.push(String(p.property_type));
  if (l.price_line) details.push(l.price_line);
  else if (l.asking_price) details.push(l.asking_price);
  if (details.length) {
    doc.text(details.join("  •  "), margin, y);
    y += 6;
  }
  doc.setTextColor(0);

  // Description
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const pageH = doc.internal.pageSize.getHeight();
  const descAvail = pageH - margin - y - 6;
  const descLines = doc.splitTextToSize(l.description || "", pageW - margin * 2);
  const maxLines = Math.max(1, Math.floor(descAvail / 4.6));
  doc.text(descLines.slice(0, maxLines), margin, y + 2);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Generated with Snapsure", margin, pageH - 8);

  return doc.output("blob");
}

// naming helper: sanitize room name into filename fragment
function roomTag(name?: string | null): string {
  if (!name) return "photo";
  return slugify(name, "photo");
}

export async function exportListingPackage(opts: {
  listing: ExportListing;
  property: ExportProperty;
  photos: ExportPhoto[];
  roomNameById: Map<string, string>;
  filenameBase?: string;
}): Promise<void> {
  const { listing, property, photos, roomNameById } = opts;
  const base = opts.filenameBase
    || slugify([property.address, property.suburb].filter(Boolean).join("-") || "listing");

  const zip = new JSZip();

  // 1. description text
  zip.file("listing-description.txt", buildDescriptionText(listing, property));

  // 2. photos — featured only. Order: hero first, then rest.
  const featured = photos.filter((p) => p.featured);
  featured.sort((a, b) => {
    if (a.is_hero && !b.is_hero) return -1;
    if (b.is_hero && !a.is_hero) return 1;
    return 0;
  });

  let heroBlob: Blob | null = null;
  for (let i = 0; i < featured.length; i++) {
    const p = featured[i];
    const index = String(i + 1).padStart(2, "0");
    const tag = p.is_hero ? "hero" : roomTag(p.room_id ? roomNameById.get(p.room_id) : null);

    // Prefer enhanced over original; also include staged separately if present.
    const primaryPath = p.enhanced_url || p.photo_url;
    const primary = await signedBlob(primaryPath);
    if (primary) {
      zip.file(`photos/${index}-${tag}.${primary.ext}`, primary.blob);
      if (p.is_hero && !heroBlob) heroBlob = primary.blob;
    }

    // If staged version exists, include BOTH original and staged.
    if (p.staged_url) {
      // include original (unenhanced) alongside staged
      if (p.enhanced_url) {
        const orig = await signedBlob(p.photo_url);
        if (orig) zip.file(`photos/${index}-${tag}-original.${orig.ext}`, orig.blob);
      }
      const staged = await signedBlob(p.staged_url);
      if (staged) {
        const style = p.staging_style ? `-${slugify(p.staging_style, "staged")}` : "";
        zip.file(`photos/${index}-${tag}-staged${style}.${staged.ext}`, staged.blob);
      }
    }
  }

  // 3. one-page PDF summary
  const pdf = await buildSummaryPdf(listing, property, heroBlob);
  zip.file("listing-summary.pdf", pdf);

  // 4. produce and download
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}-listing.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}