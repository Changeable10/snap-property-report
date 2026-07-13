// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map UI style keys → Decor8 design_style values
const STYLE_MAP: Record<string, string> = {
  modern: "modernminimalist",
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
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("DECOR8_API_KEY");
    if (!apiKey) {
      return json({ error: "Virtual staging API key not configured" }, 503);
    }

    const { image_url, style, room_type } = await req.json();
    if (!image_url || !style) {
      return json({ error: "image_url and style are required" }, 400);
    }
    const designStyle = STYLE_MAP[String(style).toLowerCase()] ?? String(style).toLowerCase();
    const rt = String(room_type ?? "livingroom").toLowerCase();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

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
      return json({ error: `Decor8 ${resp.status}: ${text.slice(0, 400)}` }, 502);
    }
    const data: any = await resp.json();
    const images: any[] =
      data?.info?.images ?? data?.images ?? data?.output?.images ?? [];
    const stagedUrl: string | undefined =
      images[0]?.url ?? images[0]?.image_url ?? data?.image_url;
    if (!stagedUrl) {
      return json({ error: "Staging response missing image URL", raw: data }, 502);
    }
    return json({ staged_url: stagedUrl, style: designStyle });
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : (err?.message ?? "unknown error");
    return json({ error: msg }, 504);
  }
});
