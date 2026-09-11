import { describe, it, expect } from "vitest";
import {
  describeRole,
  describeScope,
  firstName,
  inviteEmail,
  siteUrl,
  welcomeEmail,
  type InviteEmailInput,
} from "@/lib/email-templates";
import { formatMoney } from "@/lib/money";
import { siteConfig } from "@/lib/site";

/**
 * Everything a reader sees: the `<style>` block dropped, tags removed, the five
 * entities `escapeHtml` emits decoded. A small character walk rather than a
 * regex chain — this is a test oracle, not a sanitizer, but CodeQL can't tell
 * the difference and flags `replace(/<style…/)` as incomplete sanitization.
 */
function visibleText(html: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    if (!inTag && lower.startsWith("<style", i)) {
      const end = lower.indexOf("</style>", i);
      i = end === -1 ? html.length : end + "</style>".length - 1;
      continue;
    }
    const ch = html[i]!;
    if (ch === "<") {
      inTag = true;
      out += " ";
    } else if (ch === ">" && inTag) {
      inTag = false;
    } else if (!inTag) {
      out += ch;
    }
  }
  return out
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

describe("firstName", () => {
  it("takes the first word of a display name", () => {
    expect(firstName("Nitheesh Kumar KR")).toBe("Nitheesh");
    expect(firstName("  Ana  ")).toBe("Ana");
  });
  it("gives up on nothing usable", () => {
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
    expect(firstName("   ")).toBeNull();
    expect(firstName("x".repeat(41))).toBeNull(); // not a first name, don't greet with it
  });
});

describe("welcomeEmail", () => {
  it("greets by first name in the subject and body", () => {
    const mail = welcomeEmail({ name: "Nitheesh Kumar" });
    expect(mail.subject).toBe(`Welcome to ${siteConfig.name}, Nitheesh`);
    expect(mail.html).toContain("Hi Nitheesh,");
    expect(mail.text).toContain("Hi Nitheesh,");
  });

  it("falls back to a neutral greeting without a name", () => {
    const mail = welcomeEmail({ name: null });
    expect(mail.subject).toBe(`Welcome to ${siteConfig.name}`);
    expect(mail.html).toContain("Hi, thanks for signing up");
  });

  it("links to the tracker, the feature pages it mentions, and the repo — as absolute URLs", () => {
    const { html, text } = welcomeEmail({ name: "Ana" });
    for (const path of [
      "/app",
      "/features/chat-expense-tracker",
      "/features/ai-expense-tracker",
      "/features/voice-expense-tracker",
      "/features/keyboard-shortcuts",
      "/features/bulk-add",
      "/features/multiple-profiles",
      "/features/workspaces",
      "/features/export-and-print",
      "/docs",
      "/blog",
      "/privacy",
    ]) {
      expect(html).toContain(`href="${siteUrl(path)}"`);
      expect(text).toContain(siteUrl(path));
    }
    expect(html).toContain(siteConfig.links.github);
    expect(html).not.toMatch(/href="\//); // no relative links in an email
  });

  it("carries the three entry methods and the one-time footer in both bodies", () => {
    const { html, text } = welcomeEmail({ name: "Ana" });
    for (const phrase of ["Type it", "Write it in a sentence", "Say it", "one-time note", "isn't a newsletter"]) {
      expect(visibleText(html)).toContain(phrase);
      expect(text).toContain(phrase);
    }
    expect(text).not.toMatch(/<[a-z]/); // the text body is text
  });

  it("escapes a hostile display name", () => {
    // Only the first "word" is used as a name, and it is escaped in the HTML.
    const { html, text } = welcomeEmail({ name: `<img src=x onerror=alert(1)>` });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Hi &lt;img,");
    // The text body carries it verbatim — there's nothing to inject into.
    expect(text).toContain("Hi <img,");
  });

  it("is a complete light-scheme HTML document with a hidden preheader", () => {
    const { html } = welcomeEmail({ name: "Ana" });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain("Your first expense takes about five seconds");
    // The mark beside the wordmark is the only image; everything else is
    // tables and borders so it renders with images blocked.
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain(`src="${siteUrl("/email/logo.png")}"`);
  });

  it("opens on a two-message tracker feed in the recipient's currency, with the composer", () => {
    const { html, text } = welcomeEmail({ name: "Ana", money: { currency: "INR", locale: "en-IN" } });
    // Expense: neutral amount, no sign. Income: emerald, leading "+".
    expect(html).toContain("₹4.50");
    expect(html).toContain("+₹2,400.00");
    expect(html).toContain("#059669");
    expect(visibleText(html)).toContain("Today");
    expect(visibleText(html)).toContain("Add a title — type # to tag a category");
    expect(text).toContain("→ Coffee · Food & Dining · ₹4.50 · 9:12");
    expect(text).toContain("← Salary · Salary · +₹2,400.00 · 18:02");
    // Default money format when none is given.
    expect(welcomeEmail({ name: null }).html).toContain("$4.50");
  });

  it("draws shortcut keys as key caps in HTML and plain keys in text", () => {
    const { html, text } = welcomeEmail({ name: "Ana" });
    expect(html).toMatch(/>M<\/span>/);
    expect(html).toMatch(/>Shift<\/span>/);
    expect(html).toMatch(/>R<\/span> starts an entry/);
    expect(text).toContain("Q T E S jump between views; R starts an entry");
    expect(text).toContain("Hold M and speak");
    expect(text).toContain("Shift + a number switches");
    expect(text).not.toContain("`");
  });
});

describe("describeRole / describeScope", () => {
  it("explains the role in terms of what it allows", () => {
    expect(describeRole("viewer")).toContain("read-only");
    expect(describeRole("editor")).toContain("add and edit");
    expect(describeRole("admin")).toContain("manage everything");
  });

  it("phrases workspace-wide, single-profile and multi-profile scopes", () => {
    expect(describeScope("Family", { kind: "all", role: "editor" })).toBe(
      "the workspace “Family” as editor (add and edit transactions)",
    );
    expect(
      describeScope("Family", { kind: "profiles", entries: [{ name: "Home", role: "viewer" }] }),
    ).toBe("the “Home” profile in “Family” as viewer (read-only)");
    expect(
      describeScope("Family", {
        kind: "profiles",
        entries: [
          { name: "Home", role: "viewer" },
          { name: "Car", role: "editor" },
        ],
      }),
    ).toBe("2 profiles in “Family”: “Home” (viewer), “Car” (editor)");
  });
});

describe("inviteEmail", () => {
  const base: InviteEmailInput = {
    workspaceName: "Family Budget",
    inviterName: "Ana Silva",
    scope: { kind: "all", role: "editor" },
    joinUrl: `${siteConfig.url}/invite/tok_abcdefghijklmnopqrstuvwxyz0123`,
    recipientEmail: "sam@example.com",
    recipientHasAccount: false,
  };

  it("leads with the workspace tile — icon, name, inviter, role pills", () => {
    const mail = inviteEmail({ ...base, workspaceIcon: "🏠" });
    const seen = visibleText(mail.html);
    expect(seen).toContain("🏠");
    expect(seen).toContain("Invited by Ana Silva");
    expect(seen).toContain("editor · all profiles");
    expect(mail.text).toContain("[🏠] Family Budget — invited by Ana Silva — editor · all profiles");

    const scoped = inviteEmail({
      ...base,
      workspaceIcon: null,
      scope: {
        kind: "profiles",
        entries: [
          { name: "Home", role: "viewer" },
          { name: "Car", role: "editor" },
        ],
      },
    });
    expect(visibleText(scoped.html)).toContain("🏢"); // default tile
    expect(visibleText(scoped.html)).toContain("Home · viewer");
    expect(visibleText(scoped.html)).toContain("Car · editor");
  });

  it("previews a shared feed with author labels, in the workspace's currency", () => {
    const mail = inviteEmail({ ...base, money: { currency: "EUR", locale: "de-DE" } });
    // Built with the same formatter, so an ICU change to de-DE spacing can't break it.
    const sixtyTwo = formatMoney(6200, "EUR", "de-DE");
    expect(mail.text).toContain(`→ Ana: Groceries · Groceries · ${sixtyTwo} · Mon`);
    expect(mail.text).toContain("← You: Split from last week");
    expect(visibleText(mail.html)).toContain("Ana");
    expect(visibleText(mail.html)).toContain("You");
    // No inviter name → the author label falls back rather than showing "null".
    expect(inviteEmail({ ...base, inviterName: null }).text).toContain("→ Admin: Groceries");
  });

  it("invites a new person to join, naming the inviter and the address", () => {
    const mail = inviteEmail(base);
    expect(mail.subject).toBe(`Ana Silva invited you to Family Budget on ${siteConfig.name}`);
    expect(mail.html).toContain(`href="${base.joinUrl}"`);
    expect(mail.text).toContain(`Join Family Budget: ${base.joinUrl}`);
    expect(visibleText(mail.html)).toContain("invited you to the workspace “Family Budget” as editor");
    expect(visibleText(mail.html)).toContain("sam@example.com");
    expect(mail.text).toContain("nothing happens until you accept");
  });

  it("tells an existing account the access is already live", () => {
    const mail = inviteEmail({
      ...base,
      recipientHasAccount: true,
      joinUrl: `${siteConfig.url}/app?workspace=ws1`,
    });
    expect(mail.subject).toBe(`You now have access to Family Budget on ${siteConfig.name}`);
    expect(visibleText(mail.html)).toContain("gave you access to");
    expect(mail.text).toContain(`Open Family Budget: ${siteConfig.url}/app?workspace=ws1`);
    expect(mail.text).toContain("press G");
  });

  it("copes with an inviter who has no display name", () => {
    const mail = inviteEmail({ ...base, inviterName: null });
    expect(mail.subject).toBe(`You're invited to Family Budget on ${siteConfig.name}`);
    expect(visibleText(mail.html)).toContain("Someone invited you");
    const added = inviteEmail({ ...base, inviterName: "   ", recipientHasAccount: true });
    expect(visibleText(added.html)).toContain("don't recognise the sender");
  });

  it("never turns backticks in a person's name or address into key caps", () => {
    const mail = inviteEmail({ ...base, inviterName: "Bob `X` Smith", recipientEmail: "a`b`c@example.com" });
    expect(mail.html).not.toMatch(/border-bottom-width:2px;[^>]*>X<\/span>/);
    expect(visibleText(mail.html)).toContain("Bob `X` Smith");
    expect(visibleText(mail.html)).toContain("a`b`c@example.com");
    expect(mail.text).toContain("Bob `X` Smith");
  });

  it("escapes a hostile workspace name everywhere it appears in the HTML", () => {
    const evil = `<a href="https://evil.example">Verify</a>`;
    const mail = inviteEmail({ ...base, workspaceName: evil });
    expect(mail.html).not.toContain("<a href=\"https://evil.example\">");
    expect(mail.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    // The subject is plain text, so the name passes through untouched.
    expect(mail.subject).toContain(evil);
  });
});
