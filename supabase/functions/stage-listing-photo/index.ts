// deno-lint-ignore-file no-explicit-any
import { requireUser } from "../_shared/auth.ts";
import { requirePlan, requireMonthlyLimit, getUserPlan } from "../_shared/plan.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map UI style keys → Decor8 design_style values.
// Valid Decor8 styles include: minimalist, scandinavian, industrial, boho, traditional,
// artdeco, midcenturymodern, coastal, tropical, eclectic, contemporary, frenchcountry,
// rustic, modern, farmhouse, japandi, warmminimalist, organicmodern, ... (see api-docs.decor8.ai).
const STYLE_MAP: Record<string, string> = {
  modern: "modern",
  scandinavian: "scandinavian",
  minimalist: "minimalist",
  industrial: "industrial",
  farmhouse: "farmhouse",
  coastal: "coastal",
  traditional: "traditional",
  contemporary: "contemporary",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  console.log("[stage-listing-photo] request start", { method: req.method });
  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) {
    console.warn("[stage-listing-photo] unauthorized");
    return auth;
  }
  console.log("[stage-listing-photo] user", auth.userId);
  const plan = await getUserPlan(auth.userId);
  console.log("[stage-listing-photo] plan", plan);
  const gate = await requirePlan(auth.userId, ["professional", "portfolio", "agency"], corsHeaders);
  if (gate) {
    console.warn("[stage-listing-photo] plan gate blocked", { plan });
    return gate;
  }
  const stagingLimits: Record<string, number> = {
    free: 0,
    professional: 10,
    portfolio: 50,
    agency: Infinity,
  };
  const overLimit = await requireMonthlyLimit(auth.userId, "staging_usage", stagingLimits[plan] ?? 0, corsHeaders);
  if (overLimit) {
    console.warn("[stage-listing-photo] monthly limit reached", { plan });
    return overLimit;
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("DECOR8_API_KEY");
    if (!apiKey) {
      console.error("[stage-listing-photo] DECOR8_API_KEY missing");
      return json({ error: "Virtual staging API key not configured" }, 503);
    }

    let payload: { image_url?: string; style?: string; room_type?: string };
    try {
      payload = await req.json();
    } catch (e) {
      console.error("[stage-listing-photo] invalid JSON body", e);
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { image_url, style, room_type } = payload;
    console.log("[stage-listing-photo] payload", {
      hasImageUrl: !!image_url,
      style,
      room_type,
    });
    if (!image_url || !style) {
      return json({ error: "image_url and style are required" }, 400);
    }
    const designStyle = STYLE_MAP[String(style).toLowerCase()] ?? String(style).toLowerCase();
    const rt = String(room_type ?? "livingroom").toLowerCase();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    console.log("[stage-listing-photo] calling Decor8", { designStyle, rt });
    const resp = await fetch("https://api.decor8.ai/generate_designs_for_room", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_image_url: image_url,
        room_type: rt,
        design_style: designStyle,
        num_images: 1,
        num_captions: 0,
      }),
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[stage-listing-photo] Decor8 non-2xx", { status: resp.status, text: text.slice(0, 400) });
      const status = resp.status === 429 ? 429 : 502;
      return json({ error: `Staging provider error (${resp.status}): ${text.slice(0, 400)}` }, status);
    }
    const data: any = await resp.json();
    console.log("[stage-listing-photo] Decor8 raw response:", JSON.stringify(data).slice(0, 2000));
    const images: any[] =
      data?.info?.images ?? data?.images ?? data?.output?.images ?? [];
    const stagedUrl: string | undefined =
      images[0]?.url ?? images[0]?.image_url ?? data?.image_url;
    if (!stagedUrl) {
      console.error("[stage-listing-photo] staging response missing URL", data);
      const providerMsg = data?.error || data?.message || "Staging response missing image URL";
      return json({ error: `Staging provider: ${providerMsg}` }, 502);
    }
    console.log("[stage-listing-photo] success", { ms: Date.now() - t0, stagedUrl });
    return json({ staged_url: stagedUrl, style: designStyle });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    const status = err?.name === "AbortError" ? 504 : 500;
    console.error("[stage-listing-photo] handler error", { msg, status });
    return json({ error: msg }, status);
  }
});
