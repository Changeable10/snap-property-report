import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

async function loadToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("signature_tokens")
    .select("id, inspection_id, email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const Route = createFileRoute("/api/public/signature-token/$token")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),

      GET: async ({ params }) => {
        try {
          const tok = await loadToken(params.token);
          if (!tok) return j(404, { error: "Not found" });
          if (tok.used_at) return j(410, { error: "already_used" });
          if (new Date(tok.expires_at).getTime() < Date.now()) return j(410, { error: "expired" });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: insp } = await supabaseAdmin
            .from("inspections")
            .select("id, property_id, inspection_type, inspection_date, inspector_name, tenant_names")
            .eq("id", tok.inspection_id)
            .maybeSingle();
          if (!insp) return j(404, { error: "inspection_missing" });

          const { data: prop } = await supabaseAdmin
            .from("properties")
            .select("address, suburb, city, postcode")
            .eq("id", insp.property_id)
            .maybeSingle();

          const { count: itemCount } = await supabaseAdmin
            .from("inspection_items")
            .select("id", { count: "exact", head: true })
            .eq("inspection_id", tok.inspection_id);

          const { count: maintCount } = await supabaseAdmin
            .from("inspection_items")
            .select("id", { count: "exact", head: true })
            .eq("inspection_id", tok.inspection_id)
            .eq("maintenance_required", true);

          return j(200, {
            inspection: insp,
            property: prop,
            itemCount: itemCount ?? 0,
            maintenanceCount: maintCount ?? 0,
            email: tok.email,
          });
        } catch (e) {
          console.error(e);
          return j(500, { error: "server_error" });
        }
      },

      POST: async ({ request, params }) => {
        try {
          const body = (await request.json()) as { signerName?: string; signatureData?: string };
          const signerName = String(body?.signerName ?? "").trim();
          const signatureData = String(body?.signatureData ?? "");
          if (!signerName || signerName.length > 200) return j(400, { error: "invalid_name" });
          if (!signatureData.startsWith("data:image/") || signatureData.length > 500_000) {
            return j(400, { error: "invalid_signature" });
          }

          const tok = await loadToken(params.token);
          if (!tok) return j(404, { error: "Not found" });
          if (tok.used_at) return j(410, { error: "already_used" });
          if (new Date(tok.expires_at).getTime() < Date.now()) return j(410, { error: "expired" });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: insp } = await supabaseAdmin
            .from("inspections")
            .select("id, user_id")
            .eq("id", tok.inspection_id)
            .maybeSingle();
          if (!insp) return j(404, { error: "inspection_missing" });

          const { error: sigErr } = await supabaseAdmin.from("inspection_signatures").insert({
            user_id: insp.user_id,
            inspection_id: tok.inspection_id,
            signer_role: "tenant",
            signer_name: signerName,
            signature_data: signatureData,
          });
          if (sigErr) throw sigErr;

          await supabaseAdmin
            .from("signature_tokens")
            .update({ used_at: new Date().toISOString() })
            .eq("id", tok.id);

          return j(200, { ok: true });
        } catch (e) {
          console.error(e);
          return j(500, { error: "server_error" });
        }
      },
    },
  },
});