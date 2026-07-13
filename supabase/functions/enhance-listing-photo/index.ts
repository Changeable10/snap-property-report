// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
import { requirePlan } from "../_shared/plan.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a professional real estate photo retoucher. Analyse the given listing photo and return SPECIFIC enhancement recommendations that a simple client-side filter (brightness / contrast / saturation / warmth) can apply.

Return STRICT JSON with these exact keys:
{
  "brightness": number,   // -100 to +100, 0 = no change
  "contrast":   number,   // -100 to +100
  "saturation": number,   // -100 to +100
  "warmth":     number,   // -100 to +100, positive = warmer (add orange), negative = cooler (add blue)
  "sharpness":  "low" | "acceptable" | "good",
  "issues":     string[], // short phrases e.g. "underexposed", "colour cast", "slightly blurry", "cluttered foreground"
  "suggestion": string    // one-line human recommendation, max 140 chars
}

Be conservative — most photos need adjustments in the +/-10 to +/-40 range. Only recommend larger values if the photo is clearly under/overexposed or heavily colour-cast. Never invent problems that aren't present; return 0 for adjustments you don't need.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;
  const gate = await requirePlan(auth.userId, ["professional", "portfolio", "agency"], corsHeaders);
  if (gate) return gate;
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { image_url } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url required" }), {
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
            { type: "text", text: "Analyse this property listing photo and return the enhancement JSON described." },
            { type: "image_url", image_url: { url: image_url } },
          ]},
        ],
        max_tokens: 400,
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

    const clamp = (n: any) => {
      const v = Number(n ?? 0);
      if (!Number.isFinite(v)) return 0;
      return Math.max(-100, Math.min(100, Math.round(v)));
    };
    const sharpRaw = String(parsed.sharpness ?? "acceptable").toLowerCase();
    const sharpness = (["low", "acceptable", "good"].includes(sharpRaw) ? sharpRaw : "acceptable") as "low" | "acceptable" | "good";
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map((s: any) => String(s)).filter(Boolean).slice(0, 6)
      : [];
    const suggestion = String(parsed.suggestion ?? "").slice(0, 200);

    return new Response(JSON.stringify({
      brightness: clamp(parsed.brightness),
      contrast: clamp(parsed.contrast),
      saturation: clamp(parsed.saturation),
      warmth: clamp(parsed.warmth),
      sharpness,
      issues,
      suggestion,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});