import "server-only";
import { after } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Transactional email via Zoho ZeptoMail's HTTP API (API mode, not SMTP).
 *
 * Configuration (managed in Doppler — all optional; sending is skipped with a
 * warning when the token is absent, so local dev and tests need nothing):
 *   ZEPTOMAIL_TOKEN     – the Mail Agent's "Send Mail Token"
 *   ZEPTOMAIL_API_URL   – regional endpoint, default https://api.zeptomail.com/v1.1/email
 *                         (use https://api.zeptomail.in/v1.1/email for the IN DC)
 *   MAIL_FROM_ADDRESS   – verified sender, e.g. noreply@spendchat.playxoft.com
 *   MAIL_FROM_NAME      – display name, default "SpendChat"
 *
 * Like the logger, delivery is deferred with `after()` (waitUntil on Workers)
 * and failures are logged, never thrown — inviting a member must not fail
 * because the notification couldn't be sent.
 *
 * Thin I/O wiring, excluded from the coverage gate (see vitest.config.ts).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** HTML body; a plain-text fallback is derived by stripping tags. */
  html: string;
};

async function deliver(message: EmailMessage): Promise<void> {
  // Accept the token with or without the "Zoho-enczapikey " prefix the
  // ZeptoMail console displays — we add the scheme ourselves.
  const token = process.env.ZEPTOMAIL_TOKEN?.replace(/^Zoho-enczapikey\s+/i, "");
  const from = process.env.MAIL_FROM_ADDRESS;
  if (!token || !from) {
    logger.warn("email.skipped", {
      to: message.to,
      subject: message.subject,
      reason: "ZEPTOMAIL_TOKEN / MAIL_FROM_ADDRESS not configured",
    });
    return;
  }
  const url = process.env.ZEPTOMAIL_API_URL ?? "https://api.zeptomail.com/v1.1/email";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Zoho-enczapikey ${token}`,
      },
      body: JSON.stringify({
        from: { address: from, name: process.env.MAIL_FROM_NAME ?? "SpendChat" },
        to: [{ email_address: { address: message.to } }],
        subject: message.subject,
        htmlbody: message.html,
        textbody: message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      }),
    });
    if (!res.ok) {
      logger.error("email.failed", {
        to: message.to,
        subject: message.subject,
        status: res.status,
        body: (await res.text()).slice(0, 500),
      });
    } else {
      logger.info("email.sent", { to: message.to, subject: message.subject });
    }
  } catch (err) {
    logger.error("email.failed", { to: message.to, subject: message.subject, error: err });
  }
}

/** Fire-and-forget send, deferred past the response when in a request scope. */
export function sendEmail(message: EmailMessage): void {
  try {
    after(() => deliver(message));
  } catch {
    void deliver(message);
  }
}
