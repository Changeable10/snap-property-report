function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(logoUrl: string, bodyHtml: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
  <img src="${logoUrl}" alt="Snapsure" width="56" height="56" style="display:block; margin: 0 0 24px; border-radius: 12px;" />
  ${bodyHtml}
  <p style="font-size: 13px; color: #64748b; margin-top: 32px;">Questions? Reply to this email.</p>
</div>`;
}

export function welcomeEmailHtml(opts: { name: string; origin: string }): string {
  const name = escapeHtml(opts.name);
  return shell(
    `${opts.origin}/snapsure-logo.png`,
    `<h1 style="font-size: 20px; margin: 0 0 16px;">Welcome to Snapsure, ${name}!</h1>
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px;">Here's how to get started:</p>
  <ol style="font-size: 14px; line-height: 1.9; padding-left: 20px; margin: 0 0 20px;">
    <li>Add your first property</li>
    <li>Run your first inspection</li>
    <li>Give us feedback — tap the Feedback button in the sidebar</li>
  </ol>
  <p style="font-size: 14px; margin: 0;">
    <a href="${opts.origin}/install" style="color: #0055E0;">Install the app on your phone</a>
  </p>`,
  );
}

export function feedbackAckEmailHtml(opts: {
  name: string;
  origin: string;
  transcript: string;
}): string {
  const name = escapeHtml(opts.name);
  const transcript = escapeHtml(opts.transcript);
  return shell(
    `${opts.origin}/snapsure-logo.png`,
    `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px;">Thanks for sharing your thoughts, ${name}.</p>
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">We've logged your feedback and will use it to improve Snapsure.</p>
  <p style="font-size: 13px; line-height: 1.6; margin: 0; padding: 12px; background: #f8fafc; border-radius: 8px; font-style: italic; color: #334155;">
    "${transcript}"
  </p>`,
  );
}
