// deno-lint-ignore-file no-explicit-any
// Finds users who signed up 48h+ ago, still have zero properties, and
// haven't been nudged before — then sends each a "still setting up?" email
// via the existing send-email function (reusing the caller's own auth
// token, since send-email requires a real user session either way).
//
// Admin-only. Not wired to a cron trigger — call it manually for now:
//   curl -X POST https://<project>.supabase.co/functions/v1/send-nudge-emails \
//     -H "Authorization: Bearer <a real user access_token>"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nudgeEmailHtml(name: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px;">Hi ${name}, we noticed you haven't added your first property yet.</p>
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">It only takes a minute — just tap "Add property" and go from there.</p>
  <p style="font-size: 13px; color: #64748b; margin: 0;">Need help? Reply to this email.</p>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server not configured" });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Admin-only — this fans out email to potentially every stale user.
  const { data: adminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!adminRow) return json(403, { error: "Admin access required" });

  // 1. All users, paginated, filtered to created 48h+ ago.
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const allUsers: any[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json(500, { error: error.message });
    allUsers.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const staleUsers = allUsers.filter((u) => new Date(u.created_at).getTime() < cutoff);
  if (staleUsers.length === 0) return json(200, { checked: 0, candidates: 0, sent: 0 });

  // 2. Exclude users who already have at least one property.
  const staleIds = staleUsers.map((u) => u.id);
  const { data: propOwners, error: propErr } = await admin
    .from("properties")
    .select("user_id")
    .in("user_id", staleIds);
  if (propErr) return json(500, { error: propErr.message });
  const ownerSet = new Set((propOwners ?? []).map((p) => p.user_id));
  const candidates = staleUsers.filter((u) => !ownerSet.has(u.id) && u.email);

  // 3. Exclude users already nudged.
  const { data: alreadySent, error: sentErr } = await admin
    .from("nudge_emails_sent")
    .select("user_id")
    .in("user_id", candidates.map((u) => u.id));
  if (sentErr) return json(500, { error: sentErr.message });
  const sentSet = new Set((alreadySent ?? []).map((r) => r.user_id));
  const toNudge = candidates.filter((u) => !sentSet.has(u.id));

  let sent = 0;
  const failures: string[] = [];

  for (const u of toNudge) {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.display_name === "string" && meta.display_name) ||
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      String(u.email).split("@")[0];

    const res = await fetch(`${url}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: u.email,
        subject: "Still setting up? We can help",
        body: nudgeEmailHtml(name),
      }),
    });

    if (res.ok) {
      const { error: markErr } = await admin
        .from("nudge_emails_sent")
        .insert({ user_id: u.id });
      if (!markErr) sent++;
      else failures.push(`${u.email}: marked-sent failed: ${markErr.message}`);
    } else {
      failures.push(`${u.email}: ${await res.text()}`);
    }
  }

  return json(200, {
    checked: staleUsers.length,
    candidates: candidates.length,
    sent,
    failures,
  });
});
