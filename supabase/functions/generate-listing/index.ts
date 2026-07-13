// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
import { requirePlan, requireMonthlyLimit, getUserPlan } from "../_shared/plan.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PORTAL_GUIDANCE: Record<string, string> = {
  trademe:
    "Trade Me Property listing. Keep the description under 2000 characters. Use a casual-professional NZ tone, plain language, short paragraphs. Mention practical living features and location convenience.",
  realestate:
    "realestate.co.nz listing. Use a slightly more formal, structured tone with 2-3 well-organised paragraphs covering the home, key features, and location.",
  airbnb:
    "Airbnb / Bookabach short-stay listing. Focus on the guest experience, comfort, amenities, sleeping arrangements, and what's nearby. Warm, welcoming, second-person voice ('you').",
  general:
    "General purpose listing. Balanced, all-purpose NZ tone suitable for multiple channels.",
};

function buildPrompt(ctx: any) {
  const rooms = (ctx.rooms ?? [])
    .map((r: any) => `- ${r.name}: ${[r.transcript, r.notes].filter(Boolean).join(" | ") || "(no notes)"}`)
    .join("\n");
  return `You are writing a New Zealand property listing.

Property details:
- Address: ${ctx.address ?? "unspecified"}
- Suburb: ${ctx.suburb ?? "unspecified"}
- City: ${ctx.city ?? "unspecified"}
- Property type: ${ctx.property_type ?? "unspecified"}
- Listing type: ${ctx.listing_type ?? "unspecified"}
- Bedrooms: ${ctx.bedrooms ?? "?"}
- Bathrooms: ${ctx.bathrooms ?? "?"}
- Asking price: ${ctx.asking_price ?? "not provided"}

Target portal guidance: ${PORTAL_GUIDANCE[ctx.target_portal] ?? PORTAL_GUIDANCE.general}

Key features entered by the agent:
${ctx.key_features ?? "(none)"}

Room-by-room walkthrough notes:
${rooms || "(none)"}

Write in a warm, professional NZ real estate tone using NZ English spelling. Avoid hype words like "stunning", "breathtaking", "immaculate" unless clearly warranted by the notes. Mention specific features observed during the walkthrough. Include light neighbourhood context if a suburb is known. Do not invent features that are not supported by the notes or property details.

Return STRICT JSON with this shape:
{
  "title": string (max 80 characters, catchy),
  "description": string (150-250 words, formatted for the target portal),
  "features": string[] (5-10 short bullet points),
  "price_line": string (e.g. "Asking $X" for sale, "Rent $X per week" for rent, or "" if no asking price)
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;
  const gate = await requirePlan(auth.userId, ["professional", "portfolio", "agency"], corsHeaders);
  if (gate) return gate;
  const limits: Record<string, number> = { professional: 5, portfolio: Infinity, agency: Infinity };
  const plan = await getUserPlan(auth.userId);
  const overLimit = await requireMonthlyLimit(auth.userId, "listings", limits[plan] ?? Infinity, corsHeaders);
  if (overLimit) return overLimit;
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ctx = await req.json();
    const prompt = buildPrompt(ctx);

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
          { role: "system", content: "You are an expert NZ real estate copywriter. Always respond with strict JSON matching the requested schema." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
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
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const title = String(parsed.title ?? "").slice(0, 80);
    const description = String(parsed.description ?? "");
    const features = Array.isArray(parsed.features) ? parsed.features.map((f: any) => String(f)) : [];
    const price_line = String(parsed.price_line ?? "");
    return new Response(JSON.stringify({ title, description, features, price_line }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});