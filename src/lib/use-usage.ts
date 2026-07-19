import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Plan } from "@/lib/use-plan";

export type UsageType = "listing" | "staging" | "enhancement";

export const LISTING_LIMIT: Record<Plan, number> = {
  free: 0,
  professional: 5,
  portfolio: Infinity,
  agency: Infinity,
};

export const STAGING_LIMIT: Record<Plan, number> = {
  free: 0,
  professional: 5,
  portfolio: 15,
  agency: 50,
};

export const ENHANCEMENT_LIMIT: Record<Plan, number> = {
  free: 0,
  professional: 20,
  portfolio: 50,
  agency: Infinity,
};

export const TEAM_MEMBER_LIMIT: Record<Plan, number> = {
  free: 1,
  professional: 1,
  portfolio: 3,
  agency: 10,
};

export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthLabel(): string {
  const d = new Date();
  return d.toLocaleString("en-NZ", { month: "long", year: "numeric" });
}

export function limitFor(type: UsageType, plan: Plan): number {
  if (type === "listing") return LISTING_LIMIT[plan];
  if (type === "staging") return STAGING_LIMIT[plan];
  return ENHANCEMENT_LIMIT[plan];
}

export function useMonthlyUsage(userId: string | undefined, type: UsageType) {
  return useQuery({
    queryKey: ["usage-tracking", userId, type, currentMonth()],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { data } = await supabase
        .from("usage_tracking")
        .select("count")
        .eq("user_id", userId!)
        .eq("usage_type", type)
        .eq("month", currentMonth())
        .maybeSingle();
      return data?.count ?? 0;
    },
  });
}

export async function incrementUsage(type: UsageType): Promise<number | null> {
  const { data, error } = await supabase.rpc("increment_usage", { _usage_type: type });
  if (error) {
    console.warn("[usage] increment failed", type, error.message);
    return null;
  }
  return (data as number) ?? null;
}

export function useInvalidateUsage() {
  const qc = useQueryClient();
  return (type?: UsageType) => {
    qc.invalidateQueries({ queryKey: ["usage-tracking", undefined, type] });
    // Broad invalidate — usage keys share the ["usage-tracking"] prefix.
    qc.invalidateQueries({ queryKey: ["usage-tracking"] });
  };
}

/** Reads the count of active team members owned by the caller's team (or 1 if solo). */
export function useTeamMemberCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["team-member-count", userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { data: teamRow } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId!)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const teamId = teamRow?.team_id;
      if (!teamId) return 1;
      const { count } = await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "active");
      return count ?? 1;
    },
  });
}