import "server-only";

type SendEmailInput = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends a transactional email through Brevo.
 * Without BREVO_API_KEY (local development) the email is printed to the
 * server console instead. Never throws: returns false if nothing was sent.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n[email not sent: BREVO_API_KEY is empty]\nTo: ${input.to.email}\nSubject: ${input.subject}\n\n${input.text}\n`,
      );
    } else {
      console.error("BREVO_API_KEY is not set. Email was not sent.");
    }
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: process.env.EMAIL_FROM_ADDRESS || "support@example.com",
          name: process.env.EMAIL_FROM_NAME || "QuickDesk",
        },
        to: [input.to],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });

    if (!response.ok) {
      console.error(`Brevo responded with ${response.status}: ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Brevo request failed:", error);
    return false;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
