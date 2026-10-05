import { describe, expect, it } from "vitest";
import { hasScrollRoom } from "@/lib/scroll-room";

// A 100px box over 300px of content: scrollTop runs 0..200.
describe("hasScrollRoom", () => {
  it("has room both ways in the middle", () => {
    expect(hasScrollRoom(100, 100, 300, 10)).toBe(true);
    expect(hasScrollRoom(100, 100, 300, -10)).toBe(true);
  });

  it("has no room up at the top, and room down", () => {
    expect(hasScrollRoom(0, 100, 300, -10)).toBe(false);
    expect(hasScrollRoom(0, 100, 300, 10)).toBe(true);
  });

  it("has no room down at the bottom, and room up", () => {
    expect(hasScrollRoom(200, 100, 300, 10)).toBe(false);
    expect(hasScrollRoom(200, 100, 300, -10)).toBe(true);
  });

  it("treats a box half a pixel short of its end as at the end", () => {
    // Fractional scrollTop against rounded sizes on a zoomed screen.
    expect(hasScrollRoom(199.5, 100, 300, 10)).toBe(false);
  });

  it("has no room in a box that doesn't overflow", () => {
    expect(hasScrollRoom(0, 100, 100, 10)).toBe(false);
    expect(hasScrollRoom(0, 100, 100, -10)).toBe(false);
  });

  it("has nowhere to go for a zero delta", () => {
    expect(hasScrollRoom(100, 100, 300, 0)).toBe(false);
  });
});
