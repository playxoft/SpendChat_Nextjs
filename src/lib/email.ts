import "server-only";
import { after } from "next/server";
import { describeError, logger } from "@/lib/logger";
import { getLogContext, runWithLogContext } from "@/lib/log-context";

/**
 * Transactional email via Zoho ZeptoMail's HTTP API (API mode, not SMTP).
 *
 * Configuration (managed in Doppler — all optional; sending is skipped with a
 * warning when the token is absent, so local dev and tests need nothing):
 *   ZEPTOMAIL_TOKEN     – the Mail Agent's "Send Mail Token"
 *   ZEPTOMAIL_API_URL   – regional endpoint, default https://api.zeptomail.com/v1.1/email
 *                         (use https://api.zeptomail.in/v1.1/email for the IN DC)
 *   MAIL_FROM_ADDRESS   – verified sender, e.g. noreply@spendchat.app
 *   MAIL_FROM_NAME      – display name, default "SpendChat"
 *
 * Like the logger, delivery is deferred with `after()` (waitUntil on Workers)
 * and failures are logged, never thrown — inviting a member must not fail
 * because the notification couldn't be sent.
 *
 * What we send (all built in `email-templates.ts`): a one-time welcome note on
 * an account's first bootstrap (`welcome-email.ts`), and the workspace invite /
 * access-granted notices (`services/workspaces.ts`). ZeptoMail is a
 * transactional service — every message here is triggered by something the
 * recipient or an admin just did, sent once, and none is a newsletter.
 *
 * Thin I/O wiring, excluded from the coverage gate (see vitest.config.ts).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** HTML body. */
  html: string;
  /**
   * Plain-text alternative. Templates from `email-templates.ts` always supply
   * one; when absent it's derived by stripping tags, which is good enough for a
   * one-paragraph notice and unreadable for a table layout.
   */
  text?: string;
  /** Where a reply lands (e.g. support) when it shouldn't be the no-reply sender. */
  replyTo?: string;
};

/**
 * Escape a string for interpolation into an HTML email body. User-controlled
 * names (workspace, profile) land in `htmlbody` — unescaped, a workspace named
 * `<a href="https://evil…">Verify your account</a>` becomes attacker markup
 * sent from our verified domain.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Mask an email address for log payloads (`j***@example.com`) — recipient
 * addresses are PII and logs ship to a third-party vendor (BetterStack).
 */
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Collapse line breaks in a value bound for a mail header. The subject carries
 * user-controlled text (a workspace name), and while our hop is JSON over
 * HTTPS, the provider builds the MIME `Subject:` from it — a stray CR/LF is at
 * best a broken subject line and at worst header injection we'd be leaving to
 * the vendor to refuse.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

async function deliver(message: EmailMessage): Promise<void> {
  // Accept the token with or without the "Zoho-enczapikey " prefix the
  // ZeptoMail console displays — we add the scheme ourselves.
  const token = process.env.ZEPTOMAIL_TOKEN?.replace(/^Zoho-enczapikey\s+/i, "");
  const from = process.env.MAIL_FROM_ADDRESS;
  if (!token || !from) {
    logger.warn(
      `Email to ${redactEmail(message.to)} skipped — ZEPTOMAIL_TOKEN / MAIL_FROM_ADDRESS not configured`,
      {
        event: "email.skipped",
        to: redactEmail(message.to),
        reason: "ZEPTOMAIL_TOKEN / MAIL_FROM_ADDRESS not configured",
      },
    );
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
        ...(message.replyTo ? { reply_to: [{ address: message.replyTo }] } : {}),
        subject: sanitizeHeaderValue(message.subject),
        htmlbody: message.html,
        textbody:
          message.text ?? message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      }),
    });
    if (!res.ok) {
      logger.error(`Email to ${redactEmail(message.to)} failed with status ${res.status}`, {
        event: "email.failed",
        to: redactEmail(message.to),
        status: res.status,
        body: (await res.text()).slice(0, 500),
      });
    } else {
      logger.info(`Email sent to ${redactEmail(message.to)}`, {
        event: "email.sent",
        to: redactEmail(message.to),
      });
    }
  } catch (err) {
    logger.error(`Email to ${redactEmail(message.to)} failed: ${describeError(err)}`, {
      event: "email.failed",
      to: redactEmail(message.to),
      error: err,
    });
  }
}

/** Fire-and-forget send, deferred past the response when in a request scope. */
export function sendEmail(message: EmailMessage): void {
  // `after()` runs post-response, outside the request's log context, so snapshot
  // it now and replay it inside deliver() — otherwise its email.sent/failed logs
  // would lose the request identity (requestId/user/workspace/…).
  const ctx = getLogContext();
  const run = () => runWithLogContext(ctx, () => deliver(message));
  try {
    after(run);
  } catch {
    void run();
  }
}
