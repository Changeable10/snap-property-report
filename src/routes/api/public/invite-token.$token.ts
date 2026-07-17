import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/invite-token/$token")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      GET: async ({ params }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("team_invite_tokens")
            .select("invited_email, expires_at, accepted_at, team_id")
            .eq("token", params.token)
            .maybeSingle();
          if (error) throw error;
          if (!data) return j(404, { error: "not_found" });
          if (data.accepted_at) return j(410, { error: "already_accepted" });
          if (new Date(data.expires_at).getTime() < Date.now()) return j(410, { error: "expired" });

          let teamName: string | null = null;
          if (data.team_id) {
            const { data: t } = await supabaseAdmin
              .from("teams")
              .select("name")
              .eq("id", data.team_id)
              .maybeSingle();
            teamName = t?.name ?? null;
          }
          return j(200, { invitedEmail: data.invited_email, teamName });
        } catch (e) {
          console.error(e);
          return j(500, { error: "server_error" });
        }
      },
    },
  },
});