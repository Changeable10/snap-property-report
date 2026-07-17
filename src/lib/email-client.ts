import { supabase } from "@/integrations/supabase/client";

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentFilename?: string;
};

/** Invoke the send-email edge function. Throws on error. */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: true; id: string | null }> {
  const { data, error } = await supabase.functions.invoke("send-email", { body: input });
  if (error) {
    // supabase.functions.invoke stashes the Response on error.context for non-2xx.
    let detail = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const txt = await ctx.text();
        try {
          const j = JSON.parse(txt) as { error?: string; detail?: string };
          detail = j.detail ?? j.error ?? txt;
        } catch {
          detail = txt;
        }
      } catch { /* ignore */ }
    }
    throw new Error(detail || error.message || "Email send failed");
  }
  const d = data as { ok?: boolean; id?: string | null; error?: string; detail?: string };
  if (!d?.ok) throw new Error(d?.detail ?? d?.error ?? "Email send failed");
  return { ok: true, id: d.id ?? null };
}

/** Random URL-safe token. */
export function newToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function emailWrap(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
      <div style="font-weight:700;font-size:18px;color:#0F6E56;margin-bottom:16px">Snapsure</div>
      ${inner}
    </div>
    <p style="margin:16px 4px 0;font-size:12px;color:#6b7280">Sent by Snapsure · snapsure.co.nz</p>
  </div></body></html>`;
}