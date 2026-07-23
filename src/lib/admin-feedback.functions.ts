import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminFeedbackRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  feedback_type: string | null;
  severity: string | null;
  raw_transcript: string | null;
  structured_summary: string | null;
  page_url: string | null;
  created_at: string | null;
}

// ---- All tester feedback, newest first (admins only) ----
export const getAllFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminFeedbackRow[]> => {
    const { supabase, userId } = context;

    const { data: adminRow, error: adminErr } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminRow) throw new Error("Admin access required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("tester_feedback")
      .select(
        "id,user_id,feedback_type,severity,raw_transcript,structured_summary,page_url,created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;

    const userIds = Array.from(
      new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)),
    ) as string[];
    const emailByUserId = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      for (const u of usersPage?.users ?? []) {
        if (u.email) emailByUserId.set(u.id, u.email);
      }
    }

    return (rows ?? []).map((r) => ({
      ...r,
      user_email: r.user_id ? (emailByUserId.get(r.user_id) ?? null) : null,
    }));
  });
