// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a professional real estate photography critic. Given a property listing photo, rate it on THREE criteria from 1 to 10:
- composition: framing, angle, balance, subject clarity
- lighting: natural light, exposure, brightness, colour balance
- appeal: would this photo attract a buyer or tenant browsing Trade Me or realestate.co.nz

Return STRICT JSON: {"composition": number, "lighting": number, "appeal": number, "overall": number (average of the three, one decimal), "reason": string (one short sentence, max 120 chars)}. Be honest — do not inflate scores. A dark, blurry or cluttered photo should score 3-5. An excellent listing shot scores 8-10.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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
            { type: "text", text: "Score this property listing photo and return the JSON described." },
            { type: "image_url", image_url: { url: image_url } },
          ]},
        ],
        max_tokens: 300,
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
    const composition = Number(parsed.composition ?? 0);
    const lighting = Number(parsed.lighting ?? 0);
    const appeal = Number(parsed.appeal ?? 0);
    const providedOverall = Number(parsed.overall ?? 0);
    const overall = providedOverall > 0
      ? Math.round(providedOverall * 10) / 10
      : Math.round(((composition + lighting + appeal) / 3) * 10) / 10;
    const reason = String(parsed.reason ?? "").slice(0, 160);
    return new Response(JSON.stringify({ composition, lighting, appeal, overall, reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});