import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";

export type Plan = "free" | "professional" | "portfolio" | "agency";

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  professional: 5,
  portfolio: 20,
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

export const ADMIN_TEST_PLAN_KEY = "snapsure-admin-test-plan";
export const ADMIN_TEST_PLAN_EVENT = "snapsure-admin-test-plan-change";

function readAdminTestPlan(): Plan | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(ADMIN_TEST_PLAN_KEY);
  if (v === "free" || v === "professional" || v === "portfolio" || v === "agency") return v;
  return null;
}

export function setAdminTestPlan(plan: Plan | null) {
  if (typeof window === "undefined") return;
  if (plan) window.localStorage.setItem(ADMIN_TEST_PLAN_KEY, plan);
  else window.localStorage.removeItem(ADMIN_TEST_PLAN_KEY);
  window.dispatchEvent(new Event(ADMIN_TEST_PLAN_EVENT));
}

export function useAdminTestPlan(): Plan | null {
  const [value, setValue] = useState<Plan | null>(() => readAdminTestPlan());
  useEffect(() => {
    const sync = () => setValue(readAdminTestPlan());
    window.addEventListener(ADMIN_TEST_PLAN_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ADMIN_TEST_PLAN_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return value;
}

export function useIsAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId!)
        .maybeSingle();
      return !!data;
    },
  });
}

export function usePlan(userId: string | undefined) {
  const query = useQuery({
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
  const { data: isAdmin } = useIsAdmin(userId);
  const testPlan = useAdminTestPlan();
  const override = isAdmin ? testPlan : null;
  if (override) {
    return { ...query, data: override } as typeof query;
  }
  return query;
}

export function usePropertyCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["property-count", userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("archived_at", null);
      return count ?? 0;
    },
  });
}