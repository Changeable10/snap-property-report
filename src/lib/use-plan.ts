import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Plan = "free" | "professional" | "portfolio" | "agency";

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  professional: 10,
  portfolio: Infinity,
  agency: Infinity,
};

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  professional: "Professional",
  portfolio: "Portfolio",
  agency: "Agency",
};

export function usePlan(userId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Plan> => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan,status")
        .eq("user_id", userId!)
        .maybeSingle();
      if (!data || data.status !== "active") return "free";
      const p = data.plan as Plan;
      return (["free", "professional", "portfolio", "agency"] as Plan[]).includes(p) ? p : "free";
    },
  });
}

export function usePropertyCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["property-count", userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      return count ?? 0;
    },
  });
}