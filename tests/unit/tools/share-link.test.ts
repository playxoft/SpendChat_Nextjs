import { describe, expect, it } from "vitest";
import { decodeShareToken, encodeShareToken, shareTokenFromHash } from "@/lib/tools/share-link";

describe("share links", () => {
  it("round-trips text, including non-ASCII, through a URL-safe token", async () => {
    const text = JSON.stringify({ number: "INV-0007", client: "Priyā & Co.", total: "₹37,501.50" });
    const token = await encodeShareToken(text);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShareToken(token)).toBe(text);
  });

  it("compresses a realistic document well below its JSON size", async () => {
    const text = JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => ({ description: `Line item ${i}`, qty: "1", price: "100" })) });
    const token = await encodeShareToken(text);
    expect(token.length).toBeLessThan(text.length);
  });

  it("rejects malformed, truncated or oversized tokens", async () => {
    expect(await decodeShareToken("")).toBeNull();
    expect(await decodeShareToken("not base64!")).toBeNull();
    const token = await encodeShareToken("hello world, hello world");
    expect(await decodeShareToken(token.slice(0, 5))).toBeNull();
    expect(await decodeShareToken("A".repeat(40_000))).toBeNull();
  });

  it("reads the token only from a #share= fragment", () => {
    expect(shareTokenFromHash("#share=abc")).toBe("abc");
    expect(shareTokenFromHash("#currency=INR&share=abc")).toBe("abc");
    expect(shareTokenFromHash("#faq")).toBeNull();
    expect(shareTokenFromHash("")).toBeNull();
  });
});
