import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { PdfBranding } from "@/lib/branding";

export interface ExportListing {
  id?: string;
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

export interface ExportAgent {
  name: string | null;
  email: string | null;
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
  branding: PdfBranding | null = null,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;
  const accent: [number, number, number] = branding?.accent ?? [15, 110, 86];
  const brandName = branding?.company_name ?? "Snapsure";

  // Optional logo top-right above hero
  if (branding?.logo) {
    try {
      const maxW = 40, maxH = 16;
      const ratio = branding.logo.w / branding.logo.h;
      let w = maxW, h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      doc.addImage(branding.logo.dataUrl, "PNG", pageW - margin - w, y, w, h);
      y += h + 4;
    } catch { /* skip */ }
  }

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
  doc.setTextColor(...accent);
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
  if (branding) {
    const contactBits = [branding.phone, branding.email, branding.address].filter(Boolean).join(" · ");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(brandName, margin, pageH - 12);
    if (contactBits) {
      doc.setFontSize(7);
      doc.setTextColor(140);
      const lines = doc.splitTextToSize(contactBits, pageW - margin * 2);
      doc.text(Array.isArray(lines) ? lines[0] : lines, margin, pageH - 8);
    }
    doc.setFontSize(6.5);
    doc.setTextColor(180);
    doc.text("Powered by Snapsure", pageW / 2, pageH - 4, { align: "center" });
  } else {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Generated with Snapsure", margin, pageH - 8);
  }

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
  agent?: ExportAgent;
  filenameBase?: string;
  branding?: PdfBranding | null;
}): Promise<void> {
  const { listing, property, photos, roomNameById, agent, branding = null } = opts;
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
  const xmlImgFilenames: string[] = [];
  for (let i = 0; i < featured.length; i++) {
    const p = featured[i];
    const index = String(i + 1).padStart(2, "0");
    const tag = p.is_hero ? "hero" : roomTag(p.room_id ? roomNameById.get(p.room_id) : null);

    // Prefer enhanced over original; also include staged separately if present.
    const primaryPath = p.enhanced_url || p.photo_url;
    const primary = await signedBlob(primaryPath);
    if (primary) {
      const filename = `${index}-${tag}.${primary.ext}`;
      zip.file(`photos/${filename}`, primary.blob);
      xmlImgFilenames.push(filename);
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
  const pdf = await buildSummaryPdf(listing, property, heroBlob, branding);
  zip.file("listing-summary.pdf", pdf);

  // 4. REAXML feed
  zip.file("listing.xml", buildReaxml(listing, property, agent, xmlImgFilenames));

  // 5. produce and download
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

function xmlEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function reaxmlRootFor(listingType: string): "residential" | "rental" | "holiday" {
  const t = (listingType || "").toLowerCase();
  if (t === "for_rent" || t === "rental" || t === "for rent") return "rental";
  if (t === "holiday" || t === "holiday_rental" || t === "short_stay") return "holiday";
  return "residential";
}

function categoryFor(propertyType: string | null): string {
  const t = (propertyType || "").toLowerCase();
  if (t === "apartment") return "Apartment";
  if (t === "townhouse") return "Townhouse";
  if (t === "unit") return "Unit";
  return "House";
}

function splitStreet(address: string | null): { number: string; street: string } {
  const a = (address || "").trim();
  if (!a) return { number: "", street: "" };
  const m = a.match(/^(\d+\S*)\s+(.*)$/);
  if (m) return { number: m[1], street: m[2] };
  return { number: "", street: a };
}

function buildReaxml(
  l: ExportListing,
  p: ExportProperty,
  agent: ExportAgent | undefined,
  imgFilenames: string[],
): string {
  const root = reaxmlRootFor(l.listing_type);
  const { number, street } = splitStreet(p.address);
  const price = (l.asking_price || "").trim();
  const imgs = imgFilenames
    .map((f, i) => `      <img id="${i + 1}" url="${xmlEscape(f)}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<propertyList>
  <${root}>
    <agentID>snapsure</agentID>
    <uniqueID>${xmlEscape(l.id || "")}</uniqueID>
    <status>current</status>
    <headline>${xmlEscape(l.title || "")}</headline>
    <description>${xmlEscape(l.description || "")}</description>
    <address>
      <streetNumber>${xmlEscape(number)}</streetNumber>
      <street>${xmlEscape(street)}</street>
      <suburb>${xmlEscape(p.suburb || "")}</suburb>
      <state>${xmlEscape(p.city || "")}</state>
      <postcode>${xmlEscape(p.postcode || "")}</postcode>
      <country>NZ</country>
    </address>
    <category name="${xmlEscape(categoryFor(p.property_type))}"/>
    <features>
      <bedrooms>${xmlEscape(l.bedrooms ?? p.bedrooms ?? "")}</bedrooms>
      <bathrooms>${xmlEscape(l.bathrooms ?? p.bathrooms ?? "")}</bathrooms>
    </features>
    <price display="yes">${xmlEscape(price)}</price>
    <listingAgent>
      <name>${xmlEscape(agent?.name || "")}</name>
      <email>${xmlEscape(agent?.email || "")}</email>
    </listingAgent>
    <objects>
${imgs}
    </objects>
  </${root}>
</propertyList>
`;
}