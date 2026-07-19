import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function looksLikeEmail(s?: string | null): boolean {
  return !!s && EMAIL_RE.test(s.trim());
}

export function displayNameFromUser(user: User | null | undefined): string | null {
  const md = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof md.display_name === "string" && md.display_name) ||
    (typeof md.full_name === "string" && md.full_name) ||
    (typeof md.name === "string" && md.name) ||
    null;
  return candidate && candidate.trim() ? candidate.trim() : null;
}

async function contactNameForEmail(propertyId: string, email: string): Promise<string | null> {
  const { data } = await supabase
    .from("property_contacts")
    .select("contact_name,email")
    .eq("property_id", propertyId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  const name = data?.contact_name?.trim();
  return name ? name : null;
}

/**
 * Resolve the best display name for the current user in the context of a property.
 * Order: user_metadata → matching property contact → email fallback.
 */
export async function resolveDisplayName(opts: {
  user: User;
  propertyId?: string | null;
}): Promise<string> {
  const fromMeta = displayNameFromUser(opts.user);
  if (fromMeta) return fromMeta;
  const email = opts.user.email ?? null;
  if (email && opts.propertyId) {
    const fromContact = await contactNameForEmail(opts.propertyId, email);
    if (fromContact) return fromContact;
  }
  return email ?? "Unknown";
}

/**
 * Hook that returns a resolved inspector display name.
 * If the stored `inspector_name` still looks like an email (legacy rows),
 * it falls back to the resolved display name for the current user.
 */
export function useResolvedInspectorName(params: {
  user: User;
  inspectorName: string | null | undefined;
  propertyId: string | null | undefined;
}): string {
  const { user, inspectorName, propertyId } = params;
  const needsResolution = looksLikeEmail(inspectorName);
  const { data } = useQuery({
    queryKey: ["resolved-display-name", user.id, propertyId ?? null],
    enabled: needsResolution,
    queryFn: () => resolveDisplayName({ user, propertyId: propertyId ?? null }),
  });
  if (!needsResolution) return (inspectorName ?? "").trim() || "Inspector";
  return (data ?? inspectorName ?? "Inspector").trim() || "Inspector";
}