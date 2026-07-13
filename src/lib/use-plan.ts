import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";

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

const PRICE_TO_PLAN: Record<string, Plan> = {
  professional_monthly: "professional",
  portfolio_monthly: "portfolio",
  agency_monthly: "agency",
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function usePlan(userId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Plan> => {
      const { data } = await supabase
        .from("subscriptions")
        .select("price_id,status,current_period_end")
        .eq("user_id", userId!)
        .eq("environment", getPaddleEnvironment())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return "free";
      const endsAt = data.current_period_end ? new Date(data.current_period_end).getTime() : null;
      const isActive =
        (ACTIVE_STATUSES.has(data.status) && (!endsAt || endsAt > Date.now())) ||
        (data.status === "canceled" && endsAt && endsAt > Date.now());
      if (!isActive) return "free";
      return PRICE_TO_PLAN[data.price_id] ?? "free";
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