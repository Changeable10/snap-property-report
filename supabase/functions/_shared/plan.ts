// Shared plan-gating helper for edge functions.
// Resolves the user's active subscription plan from the subscriptions table
// using the service role client (bypasses RLS) and exposes convenience gates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type Plan = "free" | "professional" | "portfolio" | "agency";

const PRICE_TO_PLAN: Record<string, Plan> = {
  professional_monthly: "professional",
  portfolio_monthly: "portfolio",
  agency_monthly: "agency",
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserPlan(userId: string): Promise<Plan> {
  const admin = adminClient();
  const rank: Record<Plan, number> = { free: 0, professional: 1, portfolio: 2, agency: 3 };
  let best: Plan = "free";

  // 1. Admin users always get the highest tier.
  const { data: adminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (adminRow) return "agency";

  // 2. Direct subscription — if any active subscription exists, honour the highest one.
  const { data } = await admin
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const now = Date.now();
  for (const row of data ?? []) {
    const endsAt = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    const isActive =
      (ACTIVE_STATUSES.has(row.status) && (!endsAt || endsAt > now)) ||
      (row.status === "canceled" && endsAt && endsAt > now);
    if (!isActive) continue;
    const p = PRICE_TO_PLAN[row.price_id] ?? "free";
    if (rank[p] > rank[best]) best = p;
  }

  // 3. Team membership — inherit the team's plan when the caller is an active member.
  const { data: memberships } = await admin
    .from("team_members")
    .select("team_id, status, teams:team_id(plan)")
    .eq("user_id", userId)
    .eq("status", "active");
  for (const m of (memberships ?? []) as Array<{ teams?: { plan?: string } | null }>) {
    const raw = String(m?.teams?.plan ?? "").toLowerCase();
    const p: Plan =
      raw === "agency" || raw === "portfolio" || raw === "professional" || raw === "free"
        ? (raw as Plan)
        : "free";
    if (rank[p] > rank[best]) best = p;
  }

  return best;
}

function jsonResponse(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Ensures the caller's plan is one of `allowed`. Returns a Response to send
 * back on failure, or null on success.
 */
export async function requirePlan(
  userId: string,
  allowed: Plan[],
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const plan = await getUserPlan(userId);
  if (!allowed.includes(plan)) {
    return jsonResponse(403, { error: "upgrade_required", plan, allowed }, corsHeaders);
  }
  return null;
}

/**
 * Enforces a rolling 30-day usage limit against a table with `user_id` and
 * `created_at` columns. Returns a 429 Response on failure, or null on success.
 */
export async function requireMonthlyLimit(
  userId: string,
  table: string,
  limit: number,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (!Number.isFinite(limit)) return null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const admin = adminClient();
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) {
    return jsonResponse(429, { error: "monthly_limit_reached", limit }, corsHeaders);
  }
  return null;
}