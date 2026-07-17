// Send transactional email via Resend.
// Supports optional PDF attachment fetched from a Supabase Storage path
// (bucket:path) via signed URL, so we never expose service creds to callers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM = "Snapsure <noreply@snapsure.co.nz>";

type Payload = {
  to: string;
  subject: string;
  body: string; // HTML
  attachmentUrl?: string; // "bucket:path/to/file.pdf" or public https URL
  attachmentFilename?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function fetchAttachment(spec: string): Promise<{ filename: string; content: string } | null> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let bytes: Uint8Array | null = null;
  let filename = "attachment.pdf";

  if (spec.startsWith("http://") || spec.startsWith("https://")) {
    const res = await fetch(spec);
    if (!res.ok) return null;
    bytes = new Uint8Array(await res.arrayBuffer());
    filename = spec.split("/").pop() ?? filename;
  } else if (spec.includes(":")) {
    const [bucket, ...rest] = spec.split(":");
    const path = rest.join(":");
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return null;
    bytes = new Uint8Array(await data.arrayBuffer());
    filename = path.split("/").pop() ?? filename;
  } else {
    return null;
  }

  // base64 encode
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { filename, content: btoa(bin) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json(500, { error: "RESEND_API_KEY not configured" });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const { to, subject, body, attachmentUrl, attachmentFilename } = payload ?? {};
  if (!to || !isEmail(String(to))) return json(400, { error: "Invalid `to`" });
  if (!subject || typeof subject !== "string") return json(400, { error: "Missing subject" });
  if (!body || typeof body !== "string") return json(400, { error: "Missing body" });
  if (subject.length > 300) return json(400, { error: "Subject too long" });
  if (body.length > 200_000) return json(400, { error: "Body too large" });

  const attachments: Array<{ filename: string; content: string }> = [];
  if (attachmentUrl) {
    const att = await fetchAttachment(String(attachmentUrl));
    if (!att) return json(400, { error: "Could not load attachment" });
    if (attachmentFilename) att.filename = String(attachmentFilename);
    attachments.push(att);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html: body,
      attachments: attachments.length ? attachments : undefined,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("resend error", res.status, text);
    return json(res.status, { error: "Resend send failed", detail: text.slice(0, 500) });
  }

  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return json(200, { ok: true, id: (parsed as { id?: string })?.id ?? null });
});