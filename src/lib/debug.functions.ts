import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPropertiesDebug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden");

    const { count: totalCount } = await supabaseAdmin
      .from("properties")
      .select("id", { count: "exact", head: true });

    const { data: rows } = await supabaseAdmin
      .from("properties")
      .select("user_id, team_id");

    const byUser: Record<string, number> = {};
    const byTeam: Record<string, number> = {};
    for (const r of rows ?? []) {
      const u = (r.user_id ?? "null") as string;
      byUser[u] = (byUser[u] ?? 0) + 1;
      const t = (r.team_id ?? "null") as string;
      byTeam[t] = (byTeam[t] ?? 0) + 1;
    }
    return {
      total: totalCount ?? 0,
      mine: byUser[context.userId] ?? 0,
      byUser,
      byTeam,
    };
  });