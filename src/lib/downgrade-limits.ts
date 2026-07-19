import type { Plan } from "@/lib/use-plan";

// Limits used exclusively by the downgrade enforcement flow.
// Mirrors PLAN_LIMITS in use-plan.ts.
export const DOWNGRADE_PROPERTY_LIMIT: Record<Plan, number> = {
  free: 1,
  professional: 10,
  portfolio: 25,
  agency: 100,
};

// Rolling 30-day listing cap enforced when downgrading.
export const DOWNGRADE_LISTING_LIMIT: Record<Plan, number> = {
  free: 0,
  professional: 5,
  portfolio: Infinity,
  agency: Infinity,
};

const RANK: Record<Plan, number> = { free: 0, professional: 1, portfolio: 2, agency: 3 };
export function isDowngrade(from: Plan, to: Plan): boolean {
  return RANK[to] < RANK[from];
}