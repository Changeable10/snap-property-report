import { supabase } from "@/integrations/supabase/client";

export interface TeamBranding {
  id: string;
  team_id: string;
  company_name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  brand_colour: string;
  updated_at?: string;
}

export interface PdfBranding {
  company_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  accent: [number, number, number];
  logo: { dataUrl: string; w: number; h: number } | null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return [0, 85, 224];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export async function fetchTeamBranding(teamId: string): Promise<TeamBranding | null> {
  const { data, error } = await supabase
    .from("team_branding")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw error;
  return (data as TeamBranding | null) ?? null;
}

// Find the current user's active team (owner or member).
async function fetchMyTeamId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;
  const { data: mem } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", uid)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (mem?.team_id) return mem.team_id as string;
  const { data: owned } = await supabase
    .from("teams")
    .select("id")
    .eq("owner_id", uid)
    .maybeSingle();
  return (owned?.id as string | undefined) ?? null;
}

export async function fetchMyBranding(): Promise<TeamBranding | null> {
  const teamId = await fetchMyTeamId();
  if (!teamId) return null;
  try {
    return await fetchTeamBranding(teamId);
  } catch {
    return null;
  }
}

export async function upsertTeamBranding(input: {
  teamId: string;
  company_name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  brand_colour: string;
}): Promise<void> {
  const { error } = await supabase.from("team_branding").upsert(
    {
      team_id: input.teamId,
      company_name: input.company_name,
      logo_url: input.logo_url,
      phone: input.phone,
      email: input.email,
      address: input.address,
      brand_colour: input.brand_colour,
    },
    { onConflict: "team_id" },
  );
  if (error) throw error;
}

export async function uploadTeamLogo(teamId: string, file: File): Promise<string> {
  const type = (file.type || "").toLowerCase();
  const ext = type.includes("png") ? "png" : "jpg";
  const path = `team-${teamId}/logo.${ext}`;
  const { error } = await supabase.storage.from("team-branding").upload(path, file, {
    upsert: true,
    contentType: file.type || (ext === "png" ? "image/png" : "image/jpeg"),
    cacheControl: "3600",
  });
  if (error) throw error;
  return path;
}

export async function fetchBrandingLogo(
  logoPath: string,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const { data, error } = await supabase.storage.from("team-branding").download(logoPath);
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
      img.onerror = () => resolve({ w: 200, h: 60 });
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

/** Load branding shaped for the PDF generators. Returns null if not configured. */
export async function loadPdfBranding(): Promise<PdfBranding | null> {
  const b = await fetchMyBranding();
  if (!b || !b.company_name) return null;
  const accent = hexToRgb(b.brand_colour || "#0055E0");
  let logo: PdfBranding["logo"] = null;
  if (b.logo_url) logo = await fetchBrandingLogo(b.logo_url);
  return {
    company_name: b.company_name,
    phone: b.phone,
    email: b.email,
    address: b.address,
    accent,
    logo,
  };
}

export function brandingLogoObjectUrl(path: string): Promise<string | null> {
  return supabase.storage
    .from("team-branding")
    .createSignedUrl(path, 3600)
    .then((r) => r.data?.signedUrl ?? null)
    .catch(() => null);
}