// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FEEDBACK_TYPES = ["bug", "feature", "confusion", "general"];
const SEVERITIES = ["low", "medium", "high", "critical"];

const SYSTEM_PROMPT = `You are triaging spoken feedback from a tester of a property-inspection app called Snapsure. Given a raw voice transcript, classify it.

Return STRICT JSON: {"feedback_type": one of ${JSON.stringify(FEEDBACK_TYPES)}, "severity": one of ${JSON.stringify(SEVERITIES)}, "structured_summary": string (one short sentence, max 140 chars, third person, no filler)}.

Guidance: "bug" = something broken or behaving incorrectly. "feature" = a request for new/changed functionality. "confusion" = the tester didn't understand something (UX/copy issue). "general" = anything else. Severity reflects impact: "critical" blocks core usage, "high" is a significant problem, "medium" is annoying but workable, "low" is cosmetic or minor. Default to "general"/"low" if genuinely unclear.`;

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
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript required" }), {
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
          { role: "user", content: `Transcript: "${transcript.slice(0, 4000)}"` },
        ],
        max_tokens: 200,
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

    const feedback_type = FEEDBACK_TYPES.includes(parsed.feedback_type) ? parsed.feedback_type : "general";
    const severity = SEVERITIES.includes(parsed.severity) ? parsed.severity : "low";
    const structured_summary = String(parsed.structured_summary ?? transcript.slice(0, 140)).slice(0, 160);

    return new Response(JSON.stringify({ feedback_type, severity, structured_summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    return new Response(JSON.stringify({ error: msg }), {
      status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
