import { describe, it, expect } from "vitest";
import { safeNextPath, withNext } from "@/lib/next-path";

describe("safeNextPath", () => {
  it("accepts same-origin paths, with query strings and fragments", () => {
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/invite/abc_DEF-123?x=1#y")).toBe("/invite/abc_DEF-123?x=1#y");
  });

  it("rejects anything that could leave the origin", () => {
    expect(safeNextPath("//evil.example/app")).toBeNull();
    expect(safeNextPath("/\u2028//evil.example")).toBeNull(); // line separator counts as \s
    // Percent-encoded slashes stay a same-origin path after URL resolution.
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
    expect(safeNextPath("/\\evil.example")).toBeNull(); // browsers read "\" as "/"
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("app")).toBeNull(); // relative, not rooted
  });

  it("rejects whitespace and control characters", () => {
    expect(safeNextPath("/app x")).toBeNull();
    expect(safeNextPath("/app\nSet-Cookie: x")).toBeNull();
    expect(safeNextPath("/app\t")).toBeNull();
    expect(safeNextPath("/app\u00a0")).toBeNull(); // non-breaking space
    expect(safeNextPath("/app\u0000")).toBeNull(); // NUL
    expect(safeNextPath("/app\u007f")).toBeNull(); // DEL
  });

  it("rejects empty, missing, and absurdly long values", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBeNull();
    expect(safeNextPath(`/${"a".repeat(500)}`)).not.toBeNull();
  });
});

describe("withNext", () => {
  it("returns the bare path when there is nothing to carry", () => {
    expect(withNext("/sign-in", null)).toBe("/sign-in");
    expect(withNext("/sign-in", null, { email: "" })).toBe("/sign-in");
  });

  it("encodes next and any extra params", () => {
    expect(withNext("/sign-in", "/invite/tok?x=1", { email: "a+b@example.com" })).toBe(
      "/sign-in?next=%2Finvite%2Ftok%3Fx%3D1&email=a%2Bb%40example.com",
    );
  });

  it("drops extras with empty or missing values", () => {
    expect(withNext("/verify-email", "/x", { email: null, other: undefined })).toBe(
      "/verify-email?next=%2Fx",
    );
  });
});
