import "server-only";
import { escapeHtml } from "@/lib/email";

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export type TicketEmail = {
  recipientName: string;
  subject: string;
  heading: string;
  intro: string;
  /** Message text shown in a quote box, e.g. the reply body. */
  quote?: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketId: string;
};

/** Plain, client-safe HTML email plus a text version. All values are escaped. */
export function renderTicketEmail(email: TicketEmail): { html: string; text: string } {
  const link = `${appUrl()}/tickets/${email.ticketId}`;
  const preferences = `${appUrl()}/profile`;
  const quote = email.quote ? email.quote.slice(0, 4000) : "";

  const text = [
    `Hi ${email.recipientName},`,
    "",
    email.intro,
    "",
    `${email.ticketNumber}: ${email.ticketSubject}`,
    ...(quote ? ["", quote] : []),
    "",
    `View the ticket: ${link}`,
    "",
    `Change which emails you get: ${preferences}`,
  ].join("\n");

  const quoteHtml = quote
    ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #2563eb;background:#f1f5f9;white-space:pre-wrap;font-size:14px;line-height:1.5;color:#0f172a">${escapeHtml(quote)}</div>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:16px">QuickDesk</td>
            </tr>
            <tr>
              <td style="padding:24px">
                <p style="margin:0 0 4px;font-size:12px;color:#64748b;font-family:monospace">${escapeHtml(email.ticketNumber)}</p>
                <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4">${escapeHtml(email.heading)}</h1>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.5">Hi ${escapeHtml(email.recipientName)},</p>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(email.intro)}</p>
                <p style="margin:0;font-size:14px;line-height:1.5"><strong>${escapeHtml(email.ticketSubject)}</strong></p>
                ${quoteHtml}
                <p style="margin:20px 0 0">
                  <a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:600">View ticket</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
                You are receiving this because of your QuickDesk notification settings.
                <a href="${escapeHtml(preferences)}" style="color:#2563eb">Change email preferences</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
}
