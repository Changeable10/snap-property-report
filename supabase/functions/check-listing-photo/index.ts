// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY not configured" }, 503);
    const { image_url } = await req.json();
    if (!image_url) return json({ error: "image_url required" }, 400);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a real estate photography advisor. Rate this photo for listing quality. Respond with JSON: {rating: 'good'|'consider_retaking'|'retake_recommended', reason: 'one sentence'}",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Rate this listing photo." },
              { type: "image_url", image_url: { url: image_url, detail: "low" } },
            ],
          },
        ],
      }),
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return json({ error: `OpenAI ${resp.status}: ${text.slice(0, 300)}` }, 502);
    }
    const data: any = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const rating = ["good", "consider_retaking", "retake_recommended"].includes(parsed.rating)
      ? parsed.rating : "good";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    return json({ rating, reason });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timeout" : (e?.message ?? "unknown error");
    return json({ error: msg }, 504);
  }
});
