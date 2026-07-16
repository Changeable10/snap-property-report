import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const { email } = await req.json();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: list, error: le } = await admin.auth.admin.listUsers();
  if (le) return new Response(JSON.stringify({ error: le.message }), { status: 500 });
  const u = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (!u) return new Response(JSON.stringify({ found: false }));
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ deleted: true, id: u.id }));
});
