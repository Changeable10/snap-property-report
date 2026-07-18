import type { Plan } from "@/lib/use-plan";

// Limits used exclusively by the downgrade enforcement flow.
// Portfolio caps at 20 properties here per product spec (distinct from the
// day-to-day PLAN_LIMITS used for gating new property creation).
export const DOWNGRADE_PROPERTY_LIMIT: Record<Plan, number> = {
  free: 1,
  professional: 5,
  portfolio: 20,
  agency: Infinity,
};

// Rolling 30-day listing cap enforced when downgrading.
export const DOWNGRADE_LISTING_LIMIT: Record<Plan, number> = {
  free: 1,
  professional: 5,
  portfolio: 20,
  agency: Infinity,
};

const RANK: Record<Plan, number> = { free: 0, professional: 1, portfolio: 2, agency: 3 };
export function isDowngrade(from: Plan, to: Plan): boolean {
  return RANK[to] < RANK[from];
}