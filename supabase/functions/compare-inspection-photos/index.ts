// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a property inspection assistant for New Zealand residential tenancy inspections. You are given two photos of the same room from two different inspections: a "previous" photo and a "current" photo. Compare them side by side and identify concrete, visible changes to the property's condition. For each change, describe the item affected (e.g. "carpet", "wall paint", "window"), a factual description of what changed (e.g. "new stain on carpet near doorway", "small hole in wall by light switch"), and rate the severity as one of:
- none: no meaningful change (normal lighting/angle differences only)
- minor: cosmetic only, does not affect function (small marks, light wear)
- moderate: noticeable damage or deterioration needing attention
- significant: substantial damage requiring repair or replacement

Ignore differences caused only by lighting, camera angle, tenant belongings, staging, or clutter. Only report actual physical changes to fixtures, fittings, walls, floors, ceilings, or surfaces.

Respond as JSON with the shape: { "changes": [ { "item": string, "description": string, "severity": "none"|"minor"|"moderate"|"significant" } ] }. If nothing has changed, return { "changes": [] }. Use NZ English spelling. Be factual and objective — this is a legal document. Do not speculate about causes or responsibility.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { currentPhotoUrl, previousPhotoUrl, roomName } = await req.json();
    if (!currentPhotoUrl || !previousPhotoUrl) {
      return new Response(JSON.stringify({ error: "currentPhotoUrl and previousPhotoUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: `Room: ${roomName ?? "unspecified"}. The first image is the PREVIOUS inspection photo. The second image is the CURRENT inspection photo. Compare them and return the JSON described in the system prompt.` },
            { type: "image_url", image_url: { url: previousPhotoUrl } },
            { type: "image_url", image_url: { url: currentPhotoUrl } },
          ]},
        ],
        max_tokens: 1200,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: `OpenAI ${resp.status}: ${text}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { changes: [] }; }
    const changes = Array.isArray(parsed?.changes) ? parsed.changes : [];
    // Drop severity: none from the reported changes.
    const filtered = changes.filter((c: any) => c && typeof c.item === "string" && c.severity && c.severity !== "none");
    return new Response(JSON.stringify({ changes: filtered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});