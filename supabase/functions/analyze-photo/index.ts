// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a property inspection assistant for New Zealand residential tenancy inspections. You analyse photos of rooms and items in rental properties to assess their condition. Given a photo taken during a property inspection, identify each visible fixture, fitting, or surface. For each item assess the condition as one of: good (clean, undamaged, functioning, normal wear), fair (minor cosmetic issues, light wear, small marks, still functional), poor (visible damage, significant wear, staining, needs attention), or damaged (broken, non-functional, major damage, requires repair or replacement). Describe any specific issues you can see including stains, cracks, mould, wear patterns, missing or broken components, and safety concerns. Flag any items that need maintenance. Respond in JSON format with an items array where each item has: name (string), condition (good/fair/poor/damaged), description (string), maintenance_required (boolean), maintenance_notes (string if applicable), confidence (0.0 to 1.0). Also include room_suggestion (string) and overall_notes (string). Rules: be factual and objective, this is a legal document. Do not speculate about causes. Do not make recommendations about responsibility. Use NZ English spelling. Describe only what you can see. Set confidence below 0.7 if uncertain.

ITEM NAMING (critical to avoid duplicates): Use standard canonical names in Title Case. Preferred names: "Walls", "Ceiling", "Floor / Carpet", "Curtains / Blinds", "Windows", "Light fittings", "Power points", "Door", "Wardrobe", "Smoke alarm", "Shower", "Bath", "Toilet", "Vanity / Basin", "Mirror", "Tapware", "Towel rail", "Exhaust fan", "Benchtop", "Sink", "Oven / Cooktop", "Rangehood", "Cupboards", "Drawers", "Splashback". Do not invent variants (e.g. use "Walls" not "Wall Surface"; "Door" not "Doorway and Frame"; "Light fittings" not "Ceiling Light").

DEDUPLICATION: You may be given a list of items that already exist for this room. If your analysis detects an item that matches or is similar to an existing item (e.g. "Wall Surface" matches "Walls", "Doorway and Frame" matches "Door"), use the EXISTING item's exact name so it updates rather than creates a duplicate. Only create a new item if it is genuinely different from all existing items.`;

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
    const { image_base64, image_url, room_type, mime_type, existing_items } = await req.json();
    const src = image_url ?? (image_base64 ? `data:${mime_type ?? "image/jpeg"};base64,${image_base64}` : null);
    if (!src) {
      return new Response(JSON.stringify({ error: "image_base64 or image_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingBlock = Array.isArray(existing_items) && existing_items.length > 0
      ? `Items already recorded for this room (match these names exactly when the item is the same):\n${existing_items
          .map((it: any) => `- ${it?.name ?? ""}${it?.condition ? ` (${it.condition})` : ""}${it?.description ? `: ${String(it.description).slice(0, 120)}` : ""}`)
          .join("\n")}\n\n`
      : "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);

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
            { type: "text", text: `Room type: ${room_type ?? "unspecified"}. ${existingBlock}Analyse this inspection photo and return the JSON described in the system prompt.` },
            { type: "image_url", image_url: { url: src } },
          ]},
        ],
        max_tokens: 1500,
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
    try { parsed = JSON.parse(content); } catch { parsed = { items: [], overall_notes: content }; }
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});