import { describe, it, expect } from "vitest";
import { escapeHtml, redactEmail } from "@/lib/email";

describe("escapeHtml", () => {
  it("escapes markup so user-named entities can't inject into email bodies", () => {
    expect(escapeHtml(`<a href="https://evil.example">Verify</a>`)).toBe(
      "&lt;a href=&quot;https://evil.example&quot;&gt;Verify&lt;/a&gt;",
    );
    expect(escapeHtml(`x"><img src=x onerror=alert(1)>`)).toBe(
      "x&quot;&gt;&lt;img src=x onerror=alert(1)&gt;",
    );
  });

  it("escapes ampersands first (no double-escaping)", () => {
    expect(escapeHtml("Tom & Jerry's <shop>")).toBe("Tom &amp; Jerry&#39;s &lt;shop&gt;");
  });

  it("leaves plain names untouched", () => {
    expect(escapeHtml("Family Budget 2026")).toBe("Family Budget 2026");
  });
});

describe("redactEmail", () => {
  it("masks the local part but keeps the domain", () => {
    expect(redactEmail("jane.doe@example.com")).toBe("j***@example.com");
  });

  it("degrades to a full mask for non-address strings", () => {
    expect(redactEmail("not-an-email")).toBe("***");
    expect(redactEmail("@lead-at")).toBe("***");
  });
});
