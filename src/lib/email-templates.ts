import type { WorkspaceRole } from "@/db/schema";
import { escapeHtml } from "@/lib/email";
import { featureLink } from "@/lib/features";
import { formatMoney } from "@/lib/money";
import { siteConfig } from "@/lib/site";

/**
 * The emails SpendChat sends, rendered from one shared layout.
 *
 * Pure functions: input in, `{ subject, html, text }` out. Nothing here talks
 * to the network or the database — `email.ts` delivers, `welcome-email.ts` and
 * `services/workspaces.ts` decide when. That split is what makes the copy and
 * the escaping unit-testable without a mail server.
 *
 * Design rules, mirrored from the app (AGENTS.md): neutral palette, no
 * gradients, one dark call-to-action, income in the single emerald accent,
 * generous whitespace. The layout is a 600px table with inline styles because
 * that is still the only thing every mail client renders the same way; the
 * `<style>` block only handles narrow screens. The one image is the mark
 * beside the wordmark (`public/email/logo.png`, from `scripts/email-logo.html`);
 * everything else that looks like the app — the chat bubbles, the composer
 * strip, the key caps, the workspace tile — is tables and borders, so it
 * renders with images blocked and can't break.
 *
 * Every string a user controls (names, workspace titles) passes through
 * `escapeHtml` on the way into the HTML body. The plain-text body is built in
 * parallel from the unescaped values, so the two never disagree in content.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

/** A rendered fragment in both bodies. */
type Block = { html: string; text: string };

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const COLOR_TEXT = "#171717";
const COLOR_BODY = "#404040";
const COLOR_MUTED = "#737373";
const COLOR_BORDER = "#e5e5e5";
const COLOR_PAGE = "#f5f5f5";
const COLOR_CARD = "#ffffff";
const COLOR_SURFACE = "#fafafa";
const COLOR_ACCENT = "#0a0a0a";
/** Tailwind emerald-600 — the app's one accent, reserved for income. */
const COLOR_INCOME = "#059669";

/** Currency + number format for the illustrative amounts. */
export type MoneyFormat = { currency: string; locale: string };
const DEFAULT_MONEY: MoneyFormat = { currency: "USD", locale: "en-US" };

/** Absolute URL for a site path — email links must never be relative. */
export function siteUrl(path: string): string {
  return `${siteConfig.url}${path}`;
}

/* ------------------------------------------------------------------------- */
/* Inline text                                                                */
/* ------------------------------------------------------------------------- */

/** A key cap, like the app's shortcut cheat sheet. */
function kbd(key: string): string {
  return (
    `<span style="display:inline-block;padding:0 6px;border:1px solid #d4d4d4;border-bottom-width:2px;` +
    `border-radius:5px;background:${COLOR_SURFACE};font-family:${MONO};font-size:12px;line-height:18px;` +
    `color:${COLOR_TEXT};vertical-align:baseline;">${escapeHtml(key)}</span>`
  );
}

/**
 * Escape a line of copy for HTML and turn `` `X` `` into a key cap. The text
 * body gets the same line with the backticks dropped, so "Press `/`" reads as
 * a key in HTML and as "Press /" in plain text.
 */
function inline(text: string): Block {
  const html = text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2
        ? kbd(part.slice(1, -1))
        : escapeHtml(part),
    )
    .join("");
  return { html, text: text.replace(/`([^`]+)`/g, "$1") };
}

/* ------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* ------------------------------------------------------------------------- */

/** Our own copy (may use `` `key` `` caps). Never pass user-controlled text here. */
function paragraph(text: string, opts: { muted?: boolean } = {}): Block {
  const color = opts.muted ? COLOR_MUTED : COLOR_BODY;
  const size = opts.muted ? 13 : 15;
  const line = inline(text);
  return {
    html: `<p style="margin:0 0 16px;font-size:${size}px;line-height:1.6;color:${color};">${line.html}</p>`,
    text: line.text,
  };
}

/**
 * A paragraph whose HTML is already assembled (contains its own links, or
 * user-controlled text that has been escaped and must NOT go through the
 * key-cap markup — a name with backticks in it is a name, not a shortcut).
 */
function richParagraph(html: string, text: string, opts: { muted?: boolean } = {}): Block {
  const color = opts.muted ? COLOR_MUTED : COLOR_BODY;
  const size = opts.muted ? 13 : 15;
  return {
    html: `<p style="margin:0 0 16px;font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`,
    text,
  };
}

function heading(text: string): Block {
  return {
    html: `<h2 style="margin:28px 0 12px;font-size:16px;line-height:1.4;font-weight:600;color:${COLOR_TEXT};">${escapeHtml(text)}</h2>`,
    text: `\n${text.toUpperCase()}`,
  };
}

function link(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${COLOR_TEXT};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

function button(label: string, href: string): Block {
  return {
    html:
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">` +
      // The 1px border matches the fill in light mode and is what keeps the
      // button a visible shape when a client (Gmail on Android, Outlook, a
      // dark-mode extension) recolours the card behind it.
      `<tr><td style="border-radius:8px;background:${COLOR_ACCENT};border:1px solid ${COLOR_ACCENT};">` +
      `<a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>` +
      `</td></tr></table>`,
    text: `\n${label}: ${href}\n`,
  };
}

type Item = { title: string; body: string; href?: string };

/** A list of short titled items — the "three ways" / "tips" pattern. */
function items(list: Item[]): Block {
  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">` +
    list
      .map((it) => {
        const title = it.href ? link(it.title, it.href) : escapeHtml(it.title);
        return (
          `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.55;color:${COLOR_BODY};">` +
          `<span style="font-weight:600;color:${COLOR_TEXT};">${title}</span>` +
          `<br>${inline(it.body).html}</td></tr>`
        );
      })
      .join("") +
    `</table>`;
  const text = list
    .map((it) => `- ${it.title}: ${inline(it.body).text}${it.href ? `\n  ${it.href}` : ""}`)
    .join("\n");
  return { html, text };
}

/* ------------------------------------------------------------------------- */
/* App-flavoured pieces                                                       */
/* ------------------------------------------------------------------------- */

type Bubble = {
  type: "income" | "expense";
  amountMinor: number;
  title: string;
  category: { name: string; icon: string };
  time: string;
  /** Shown atop the bubble in shared workspaces, like the tracker does. */
  author?: string;
};

/**
 * One transaction as the tracker draws it: the category emoji in a round
 * avatar, a bordered bubble with the title and amount up top and the
 * category + time along the bottom. Income sits on the left with the emerald
 * amount and a leading "+"; expense on the right in the neutral colour — the
 * same "received vs. sent" reading as the app (`transaction-bubble.tsx`).
 */
function bubbleRow(b: Bubble, money: MoneyFormat): Block {
  const income = b.type === "income";
  const amount = income
    ? formatMoney(b.amountMinor, money.currency, money.locale, { signed: true })
    : formatMoney(b.amountMinor, money.currency, money.locale);
  const avatar =
    `<td style="vertical-align:top;${income ? "padding-right:8px;" : "padding-left:8px;"}">` +
    `<span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:999px;background:${COLOR_PAGE};font-size:15px;">${escapeHtml(b.category.icon)}</span></td>`;
  const bubble =
    `<td style="vertical-align:top;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};border-radius:16px;${income ? "border-top-left-radius:4px;" : "border-top-right-radius:4px;"}min-width:200px;">` +
    (b.author
      ? `<tr><td colspan="2" style="padding:8px 12px 0;font-size:11px;font-weight:600;color:${COLOR_MUTED};">${escapeHtml(b.author)}</td></tr>`
      : "") +
    `<tr>` +
    `<td style="padding:${b.author ? "2px" : "8px"} 12px 2px;font-size:14px;font-weight:500;color:${COLOR_TEXT};">${escapeHtml(b.title)}</td>` +
    `<td style="padding:${b.author ? "2px" : "8px"} 12px 2px 16px;text-align:right;font-size:15px;font-weight:600;white-space:nowrap;color:${income ? COLOR_INCOME : COLOR_TEXT};">${escapeHtml(amount)}</td>` +
    `</tr>` +
    `<tr>` +
    `<td style="padding:0 12px 8px;font-size:11px;color:${COLOR_MUTED};white-space:nowrap;">${escapeHtml(b.category.icon)} ${escapeHtml(b.category.name)}</td>` +
    `<td style="padding:0 12px 8px;text-align:right;font-size:11px;color:${COLOR_MUTED};">${escapeHtml(b.time)}</td>` +
    `</tr></table></td>`;
  const html =
    `<tr><td style="padding:0 14px 8px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${income ? "left" : "right"}"><tr>` +
    (income ? avatar + bubble : bubble + avatar) +
    `</tr></table></td></tr>`;
  const text = `  ${income ? "←" : "→"} ${b.author ? `${b.author}: ` : ""}${b.title} · ${b.category.name} · ${amount} · ${b.time}`;
  return { html, text };
}

/** The tracker's day divider — a small pill on its own line. */
function dayPill(label: string): string {
  return (
    `<tr><td style="padding:12px 14px 10px;text-align:center;">` +
    `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};font-size:11px;color:${COLOR_MUTED};">${escapeHtml(label)}</span>` +
    `</td></tr>`
  );
}

/** The composer: amount field, title field with its real placeholder, send. */
function composerStrip(money: MoneyFormat): string {
  const amount = formatMoney(450, money.currency, money.locale);
  return (
    `<tr><td style="padding:6px 14px 14px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};border-radius:10px;">` +
    `<tr>` +
    `<td style="padding:8px 12px;font-size:13px;font-weight:500;color:${COLOR_TEXT};border-right:1px solid ${COLOR_BORDER};white-space:nowrap;">${escapeHtml(amount)}</td>` +
    `<td style="padding:8px 12px;font-size:13px;color:${COLOR_MUTED};">Add a title — type # to tag a category</td>` +
    `<td style="padding:5px 6px;width:30px;text-align:right;">` +
    `<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:${COLOR_ACCENT};color:#ffffff;font-size:15px;font-weight:600;">&uarr;</span>` +
    `</td></tr></table></td></tr>`
  );
}

/**
 * A few messages of the tracker feed, drawn as the app draws them. Purely
 * illustrative — the amounts are examples in the recipient's own currency,
 * which is what makes them read as *their* tracker rather than a stock shot.
 */
function feedVignette(
  bubbles: Bubble[],
  money: MoneyFormat,
  opts: { day?: string; composer?: boolean } = {},
): Block {
  const rows = bubbles.map((b) => bubbleRow(b, money));
  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 24px;background:${COLOR_SURFACE};border:1px solid ${COLOR_BORDER};border-radius:12px;">` +
    (opts.day ? dayPill(opts.day) : `<tr><td style="padding:6px;"></td></tr>`) +
    rows.map((r) => r.html).join("") +
    (opts.composer ? composerStrip(money) : `<tr><td style="padding:6px;"></td></tr>`) +
    `</table>`;
  const text = [opts.day ? `  — ${opts.day} —` : null, ...rows.map((r) => r.text)]
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

/** A small pill — role names, profile names — like the app's badges. */
function pill(label: string): string {
  return (
    `<span style="display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid ${COLOR_BORDER};` +
    `background:${COLOR_CARD};font-size:11px;font-weight:500;line-height:16px;color:${COLOR_TEXT};white-space:nowrap;">${escapeHtml(label)}</span>`
  );
}

/**
 * The workspace as the switcher shows it: the emoji tile, the name, and the
 * access being offered as pills. Sits under the headline of an invite so the
 * reader knows what they're joining before they read a sentence.
 */
function workspaceTile(input: {
  icon: string | null | undefined;
  name: string;
  inviterName: string | null;
  scope: InviteScope;
}): Block {
  const pills =
    input.scope.kind === "all"
      ? pill(`${input.scope.role} · all profiles`)
      : input.scope.entries.map((e) => pill(`${e.name} · ${e.role}`)).join(" ");
  const by = input.inviterName ? `Invited by ${escapeHtml(input.inviterName)}` : "You're invited";
  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;background:${COLOR_SURFACE};border:1px solid ${COLOR_BORDER};border-radius:12px;">` +
    `<tr>` +
    `<td style="padding:14px 0 14px 14px;width:44px;vertical-align:top;">` +
    `<span style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;border-radius:12px;background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};font-size:22px;">${escapeHtml(input.icon || "🏢")}</span></td>` +
    `<td style="padding:13px 14px 12px 12px;vertical-align:top;">` +
    `<div style="font-size:15px;font-weight:600;line-height:1.4;color:${COLOR_TEXT};">${escapeHtml(input.name)}</div>` +
    `<div style="margin-top:2px;font-size:12px;line-height:1.5;color:${COLOR_MUTED};">${by}</div>` +
    `<div style="margin-top:8px;">${pills}</div>` +
    `</td></tr></table>`;
  const roles =
    input.scope.kind === "all"
      ? `${input.scope.role} · all profiles`
      : input.scope.entries.map((e) => `${e.name} · ${e.role}`).join(", ");
  const text = `  [${input.icon || "🏢"}] ${input.name}${input.inviterName ? ` — invited by ${input.inviterName}` : ""} — ${roles}`;
  return { html, text };
}

/* ------------------------------------------------------------------------- */
/* Layout                                                                     */
/* ------------------------------------------------------------------------- */

type LayoutInput = {
  subject: string;
  /** The inbox preview line shown after the subject; hidden in the body. */
  preheader: string;
  title: string;
  blocks: Block[];
  /** Why this person is receiving the message. Plain text; links added by us. */
  footer: string;
};

function render({ subject, preheader, title, blocks, footer }: LayoutInput): RenderedEmail {
  const year = new Date().getUTCFullYear();
  const home = siteUrl("/");
  const footerLinks =
    `${link("Privacy", siteUrl("/privacy"))} &nbsp;·&nbsp; ` +
    `${link("Help", siteUrl("/docs"))} &nbsp;·&nbsp; ` +
    `${link(siteConfig.author, siteConfig.links.playxoft)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .card { padding: 24px 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR_PAGE};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR_PAGE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">
<tr><td style="padding:0 4px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:10px;vertical-align:middle;"><a href="${escapeHtml(home)}" style="text-decoration:none;"><img src="${escapeHtml(siteUrl("/email/logo.png"))}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;border-radius:8px;"></a></td>
    <td style="vertical-align:middle;font-size:18px;font-weight:600;letter-spacing:-0.01em;color:${COLOR_TEXT};"><a href="${escapeHtml(home)}" style="color:${COLOR_TEXT};text-decoration:none;">${escapeHtml(siteConfig.name)}</a></td>
  </tr></table>
</td></tr>
<tr><td class="card" style="background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};border-radius:12px;padding:36px 40px;">
  <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${COLOR_TEXT};">${escapeHtml(title)}</h1>
  ${blocks.map((b) => b.html).join("\n  ")}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:${COLOR_MUTED};">
  <p style="margin:0 0 8px;">${escapeHtml(footer)}</p>
  <p style="margin:0;">${footerLinks} &nbsp;·&nbsp; © ${year} ${escapeHtml(siteConfig.author)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    siteConfig.name,
    "",
    title,
    "",
    ...blocks.map((b) => b.text),
    "",
    "—",
    footer,
    `Privacy: ${siteUrl("/privacy")} · Help: ${siteUrl("/docs")}`,
    `© ${year} ${siteConfig.author}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject, html, text };
}

/* ------------------------------------------------------------------------- */
/* Welcome                                                                    */
/* ------------------------------------------------------------------------- */

/** "Nitheesh" from "Nitheesh Kumar", or null when there's nothing usable. */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length <= 40 ? first : null;
}

/**
 * The one email a new account receives, on its first bootstrap. Its job is to
 * get the first transaction logged — everything else is secondary — so the
 * call to action sits above the fold, right under a glimpse of what the
 * tracker looks like with two entries in it, and the feature tour is short.
 * The "worth knowing" section is the marketing; it's kept to facts the person
 * would want before trusting the app with their numbers. The footer says
 * plainly that this is a one-off, which is both the honest description and the
 * reason it doesn't read as spam.
 *
 * `money` is the new workspace's currency/locale (geo-detected at bootstrap),
 * so the example amounts are in the currency they're about to use.
 */
export function welcomeEmail(input: {
  name: string | null;
  money?: MoneyFormat;
}): RenderedEmail {
  const money = input.money ?? DEFAULT_MONEY;
  const first = firstName(input.name);
  const subject = first ? `Welcome to ${siteConfig.name}, ${first}` : `Welcome to ${siteConfig.name}`;
  const greeting = first ? `Hi ${escapeHtml(first)},` : "Hi,";
  const greetingText = first ? `Hi ${first},` : "Hi,";
  const app = siteUrl("/app");

  const blocks: Block[] = [
    richParagraph(
      `${greeting} thanks for signing up. ${escapeHtml(siteConfig.name)} is a money tracker that works like a chat: type what you spent, send, done. Your workspace is ready and waiting — here's what it looks like with a couple of entries in it.`,
      `${greetingText} thanks for signing up. ${siteConfig.name} is a money tracker that works like a chat: type what you spent, send, done. Your workspace is ready and waiting — here's what it looks like with a couple of entries in it.`,
    ),
    feedVignette(
      [
        {
          type: "expense",
          amountMinor: 450,
          title: "Coffee",
          category: { name: "Food & Dining", icon: "🍽️" },
          time: "9:12",
        },
        {
          type: "income",
          amountMinor: 240000,
          title: "Salary",
          category: { name: "Salary", icon: "💼" },
          time: "18:02",
        },
      ],
      money,
      { day: "Today", composer: true },
    ),
    button("Log your first expense", app),

    heading("Three ways to add a transaction"),
    items([
      {
        title: "Type it",
        body: "Amount, a short title, a category if you like, send. It lands in your feed and the balance updates.",
        href: siteUrl(featureLink("chat-expense-tracker")),
      },
      {
        title: "Write it in a sentence",
        body: "Switch the composer to AI and write “coffee 4.50 and 62 on groceries”. You get tidy drafts to check before anything is saved.",
        href: siteUrl(featureLink("ai-expense-tracker")),
      },
      {
        title: "Say it",
        body: "Hold `M` and speak, in whichever languages you actually mix. It's transcribed into a draft you approve.",
        href: siteUrl(featureLink("voice-expense-tracker")),
      },
    ]),

    heading("Five things people wish they knew on day one"),
    items([
      {
        title: "Press / for the cheat sheet",
        body: "Every screen and action has a key. `Q` `T` `E` `S` jump between views; `R` starts an entry.",
        href: siteUrl(featureLink("keyboard-shortcuts")),
      },
      {
        title: "Paste a whole month at once",
        body: "Bulk add takes rows straight from a spreadsheet and shows a preview before it saves.",
        href: siteUrl(featureLink("bulk-add")),
      },
      {
        title: "Keep separate books",
        body: "Profiles give Personal, Home and Business their own feed and balance. `Shift` + a number switches.",
        href: siteUrl(featureLink("multiple-profiles")),
      },
      {
        title: "Track together",
        body: "Invite a partner, a flatmate or your accountant from Settings → Workspace and pick what each can see or change.",
        href: siteUrl(featureLink("workspaces")),
      },
      {
        title: "Your data leaves when you want",
        body: "Any filtered view exports to CSV or prints to a clean PDF. No paid tier gates it.",
        href: siteUrl(featureLink("export-and-print")),
      },
    ]),

    heading("Worth knowing"),
    richParagraph(
      `${escapeHtml(siteConfig.name)} is free and ${link("open source", siteConfig.links.github)} under ${escapeHtml(siteConfig.license)}. It never asks for a bank login, shows no ads, and doesn't sell data. If you like it, a star on GitHub or a word to a friend genuinely helps a small project.`,
      `${siteConfig.name} is free and open source under ${siteConfig.license} (${siteConfig.links.github}). It never asks for a bank login, shows no ads, and doesn't sell data. If you like it, a star on GitHub or a word to a friend genuinely helps a small project.`,
    ),
    richParagraph(
      `Stuck, or have an idea? Reply to this email — a person reads every one. The ${link("docs", siteUrl("/docs"))} and ${link("blog", siteUrl("/blog"))} cover the rest.`,
      `Stuck, or have an idea? Reply to this email — a person reads every one. Docs: ${siteUrl("/docs")} · Blog: ${siteUrl("/blog")}`,
    ),
  ];

  return render({
    subject,
    preheader: "Your first expense takes about five seconds. Here's how, plus a few tips.",
    title: `Welcome to ${siteConfig.name}`,
    blocks,
    footer: `You're receiving this one-time note because a ${siteConfig.name} account was just created with this address. It isn't a newsletter — the only other mail we send is when someone invites you to a workspace, or when something in your account needs your attention.`,
  });
}

/* ------------------------------------------------------------------------- */
/* Workspace invites                                                          */
/* ------------------------------------------------------------------------- */

/** What an invite or grant covers, resolved to names for the copy. */
export type InviteScope =
  | { kind: "all"; role: WorkspaceRole }
  | { kind: "profiles"; entries: { name: string; role: WorkspaceRole }[] };

/** The role, as what it lets you do. */
export function describeRole(role: WorkspaceRole): string {
  switch (role) {
    case "admin":
      return "admin (manage everything, including members)";
    case "editor":
      return "editor (add and edit transactions)";
    default:
      return "viewer (read-only)";
  }
}

/** Plain-text description of the scope; the HTML variant escapes it. */
export function describeScope(workspaceName: string, scope: InviteScope): string {
  if (scope.kind === "all") {
    return `the workspace “${workspaceName}” as ${describeRole(scope.role)}`;
  }
  if (scope.entries.length === 1) {
    const [only] = scope.entries;
    return `the “${only!.name}” profile in “${workspaceName}” as ${describeRole(only!.role)}`;
  }
  const list = scope.entries.map((e) => `“${e.name}” (${e.role})`).join(", ");
  return `${scope.entries.length} profiles in “${workspaceName}”: ${list}`;
}

export type InviteEmailInput = {
  workspaceName: string;
  /** The workspace's emoji, shown on the tile; the default tile when null. */
  workspaceIcon?: string | null;
  /** The admin who sent it; null when their account has no display name. */
  inviterName: string | null;
  scope: InviteScope;
  /** The `/invite/<token>` page (new person) or `/app?workspace=<id>` (existing account). */
  joinUrl: string;
  /** The address it's going to — named in the body so a forwarded copy makes sense. */
  recipientEmail: string;
  /** Whether the recipient already has an account (access is live) or needs one. */
  recipientHasAccount: boolean;
  /** The workspace's currency/locale, for the example amounts. */
  money?: MoneyFormat;
};

/**
 * The invite (no account yet) and the access-granted notice (existing account)
 * share one template because they differ in one fact: whether the reader has
 * to create an account before the link means anything. Everything else — who,
 * what, which role — is the same information, shown first as the workspace
 * tile and then as a sentence.
 */
export function inviteEmail(input: InviteEmailInput): RenderedEmail {
  const { workspaceName, inviterName, scope, joinUrl, recipientEmail, recipientHasAccount } =
    input;
  const money = input.money ?? DEFAULT_MONEY;
  const who = inviterName?.trim() || null;
  const scopeText = describeScope(workspaceName, scope);
  const name = siteConfig.name;

  const subject = recipientHasAccount
    ? `You now have access to ${workspaceName} on ${name}`
    : who
      ? `${who} invited you to ${workspaceName} on ${name}`
      : `You're invited to ${workspaceName} on ${name}`;

  const leadText = `${who ?? "Someone"} ${recipientHasAccount ? "gave you access to" : "invited you to"} ${scopeText}.`;
  const leadHtml = `${who ? `<b>${escapeHtml(who)}</b>` : "Someone"} ${recipientHasAccount ? "gave you access to" : "invited you to"} ${escapeHtml(scopeText)}.`;

  const blocks: Block[] = [
    workspaceTile({
      icon: input.workspaceIcon,
      name: workspaceName,
      inviterName: who,
      scope,
    }),
    richParagraph(leadHtml, leadText),
    paragraph(
      `${name} is a shared money tracker that works like a chat — everyone in the workspace sees the same feed, categories and currency, and each entry shows who added it:`,
    ),
    feedVignette(
      [
        {
          type: "expense",
          amountMinor: 6200,
          title: "Groceries",
          category: { name: "Groceries", icon: "🛒" },
          time: "Mon",
          author: firstName(who) ?? "Admin",
        },
        {
          type: "income",
          amountMinor: 12000,
          title: "Split from last week",
          category: { name: "Other", icon: "➕" },
          time: "Tue",
          author: "You",
        },
      ],
      money,
    ),
    button(recipientHasAccount ? `Open ${workspaceName}` : `Join ${workspaceName}`, joinUrl),
    recipientHasAccount
      ? richParagraph(
          `The link opens the workspace in your account. You can also switch to it any time from the workspace menu in the sidebar (or press ${kbd("G")}).`,
          `The link opens the workspace in your account. You can also switch to it any time from the workspace menu in the sidebar (or press G).`,
        )
      : richParagraph(
          `You'll need a free ${escapeHtml(name)} account with <b>${escapeHtml(recipientEmail)}</b> — the link takes you through creating one (Google, or email and a password) and drops you straight into the workspace. No bank connection, nothing to install.`,
          `You'll need a free ${name} account with ${recipientEmail} — the link takes you through creating one (Google, or email and a password) and drops you straight into the workspace. No bank connection, nothing to install.`,
        ),
    // User-controlled values (inviter name, address): escaped, never key-capped.
    ...(() => {
      const text = recipientHasAccount
        ? `If you don't recognise ${who ?? "the sender"} or the workspace, you can leave it from Settings → Workspace at any time.`
        : `If you weren't expecting this, you can ignore it — nothing happens until you accept, and the invite only works for ${recipientEmail}.`;
      return [richParagraph(escapeHtml(text), text, { muted: true })];
    })(),
  ];

  return render({
    subject,
    preheader: recipientHasAccount
      ? `${who ?? "An admin"} added you to ${workspaceName}. Open it in one click.`
      : `${who ?? "Someone"} wants to track money with you in ${workspaceName}.`,
    title: recipientHasAccount ? `You've been added to ${workspaceName}` : `Join ${workspaceName}`,
    blocks,
    footer: `This message was sent to ${recipientEmail} because a ${name} workspace admin ${recipientHasAccount ? "shared a workspace with" : "invited"} that address. It isn't a newsletter.`,
  });
}
