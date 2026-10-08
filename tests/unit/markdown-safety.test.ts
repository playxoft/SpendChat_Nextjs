import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ANSWER_LINK_REL,
  linkDestination,
  linkTextShowsDestination,
  safeLinkUrl,
} from "@/lib/markdown-safety";
import { AnswerMarkdown } from "@/components/app/ask/answer-markdown";

/**
 * An Ask answer is model output built from people's notes, so it's untrusted
 * Markdown. These pin what may come out of it: Markdown structure yes; raw HTML,
 * images and unsafe links never.
 */

const render = (md: string) => renderToStaticMarkup(createElement(AnswerMarkdown, null, md));

describe("safeLinkUrl", () => {
  it.each([
    ["https://example.com/a?b=1", "https://example.com/a?b=1"],
    ["http://example.com", "http://example.com/"],
    ["  https://example.com  ", "https://example.com/"],
    ["mailto:me@example.com", "mailto:me@example.com"],
  ])("keeps %s", (raw, out) => {
    expect(safeLinkUrl(raw)).toBe(out);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "/app/settings",
    "//evil.example/x",
    "#top",
    "https://",
    "mailto:me@example.com?subject=Refund&body=Click%20here",
    "mailto:me@example.com?body=hi",
    "mailto:me@example.com,them@example.com",
    "mailto:me@example.com%3Fsubject=x",
    "mailto:",
    "not a url",
    "",
  ])("refuses %j", (raw) => {
    expect(safeLinkUrl(raw)).toBeNull();
  });

  it("names a link's destination: the host without www, punycode for look-alikes, a mailto's address", () => {
    expect(linkDestination("https://www.x.io/a?b=1")).toBe("x.io");
    expect(linkDestination(safeLinkUrl("https://pаypal.com/login")!)).toBe("xn--pypal-4ve.com");
    expect(linkDestination("mailto:me@example.com")).toBe("me@example.com");
  });

  it("knows when a link's text already is its destination", () => {
    expect(linkTextShowsDestination("https://x.io/a", "https://x.io/a")).toBe(true);
    expect(linkTextShowsDestination("www.x.io", "http://www.x.io/")).toBe(true);
    expect(linkTextShowsDestination("x.io", "https://x.io/deep/path")).toBe(true);
    expect(linkTextShowsDestination("me@example.com", "mailto:me@example.com")).toBe(true);
    expect(linkTextShowsDestination("View details", "https://x.io/a")).toBe(false);
    expect(linkTextShowsDestination("https://bank.example", "https://evil.example/")).toBe(false);
  });

  it("refuses non-strings", () => {
    expect(safeLinkUrl(undefined)).toBeNull();
    expect(safeLinkUrl(null)).toBeNull();
  });
});

describe("AnswerMarkdown", () => {
  it("renders Markdown structure: headings (shifted down), lists, bold, code", () => {
    const html = render("# Title\n## Sub\n- **one**\n- two\n\n1. first\n\nSome `code` here.");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
    expect(html).not.toMatch(/<h1|<h2/);
    expect(html).toMatch(/<ul[^>]*>\s*<li[^>]*><strong[^>]*>one<\/strong>/);
    expect(html).toContain("<ol");
    expect(html).toMatch(/<code[^>]*>code<\/code>/);
    expect(html).not.toContain("## Sub");
  });

  it("renders GFM tables inside a box that scrolls sideways", () => {
    const html = render("| Month | Spent |\n|---|---:|\n| Sep | $42.00 |\n| Oct | $12.50 |");
    expect(html).toMatch(/<div class="[^"]*overflow-x-auto[^"]*"><table/);
    expect(html).toContain("<th");
    expect(html).toMatch(/<td[^>]*>\$12\.50<\/td>/);
  });

  it("drops raw HTML — no tags, no scripts, no handlers", () => {
    const html = render(
      'Hi <script>alert(1)</script><img src=x onerror="alert(2)"><b onclick="x()">bold</b>\n\n<div>block</div>',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<b");
    expect(html).not.toContain("<div>block");
  });

  it("drops Markdown images — they would load (and leak) without a click", () => {
    const html = render("Look ![chart](https://evil.example/pixel.png?d=secret) here");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
  });

  it("opens safe links in a new tab with noopener noreferrer nofollow", () => {
    const html = render("See [the docs](https://example.com/docs).");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain(`rel="${ANSWER_LINK_REL}"`);
    expect(ANSWER_LINK_REL).toBe("noopener noreferrer nofollow");
  });

  it("shows where a link goes when its text says something else", () => {
    // Strip tags until none are left, so nested or split tags can't survive.
    const text = (html: string) => {
      let out = html;
      for (let prev = ""; prev !== out; ) {
        prev = out;
        out = out.replace(/<[^>]*>/g, "");
      }
      return out;
    };
    // A note's disguised link: the text claims one thing, the host says another.
    const disguised = render("[Your bank — verify now](https://evil.example/login)");
    expect(text(disguised)).toContain("Your bank — verify now · evil.example ↗");
    const lookalike = render("[https://bank.example](https://www.bank-example.io/x)");
    expect(text(lookalike)).toContain("https://bank.example · bank-example.io ↗");
    // A bare URL (or autolink) already says where it goes — no repeat.
    const bareUrl = render("<https://example.com/a>");
    expect(text(bareUrl)).toContain("https://example.com/a ↗");
    expect(text(bareUrl)).not.toContain("·");
    // Mailto shows its address; one with a pre-written body isn't a link at all.
    expect(text(render("[write to us](mailto:help@example.com)"))).toContain(
      "write to us · help@example.com ↗",
    );
    const prewritten = render("[support](mailto:help@example.com?subject=Refund&body=Send%20your%20PIN)");
    expect(prewritten).not.toContain("<a");
    expect(prewritten).not.toContain("PIN");
  });

  it("keeps an unsafe link's text but not the link", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,hi", "/app/settings", "vbscript:x"]) {
      const html = render(`[click me](${href})`);
      expect(html, href).toContain("click me");
      expect(html, href).not.toContain("<a");
      expect(html, href).not.toContain("javascript:");
      expect(html, href).not.toContain("data:");
    }
  });

  it("doesn't autolink an unsafe bare URL either", () => {
    const html = render("www.example.com and javascript:alert(1)");
    expect(html).not.toContain('href="javascript');
  });

  it("puts no hast `node` attribute on the DOM", () => {
    expect(render("**a** [b](https://example.com)")).not.toContain("node=");
  });
});
