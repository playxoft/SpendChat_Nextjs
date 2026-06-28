import { describe, it, expect } from "vitest";
import { getAuthErrorMessage, friendlyOtpError } from "@/lib/auth-errors";

describe("getAuthErrorMessage", () => {
  it("reads .message off an Error or plain object", () => {
    expect(getAuthErrorMessage(new Error("boom"))).toBe("boom");
    expect(getAuthErrorMessage({ message: "nope" })).toBe("nope");
  });
  it("accepts a bare string", () => {
    expect(getAuthErrorMessage("just a string")).toBe("just a string");
  });
  it("uses the fallback for empty / messageless / nullish input", () => {
    expect(getAuthErrorMessage({ message: "   " })).toBe(
      "Something went wrong. Please try again.",
    );
    expect(getAuthErrorMessage({})).toBe("Something went wrong. Please try again.");
    expect(getAuthErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(getAuthErrorMessage("", "custom fallback")).toBe("custom fallback");
  });
});

describe("friendlyOtpError", () => {
  it("maps expired codes", () => {
    expect(friendlyOtpError("Code has EXPIRED")).toContain("expired");
  });
  it("maps invalid / incorrect / mismatch / wrong codes", () => {
    expect(friendlyOtpError("invalid code")).toContain("incorrect");
    expect(friendlyOtpError("does not match")).toContain("incorrect");
    expect(friendlyOtpError("wrong")).toContain("incorrect");
  });
  it("maps rate-limit / attempt errors", () => {
    expect(friendlyOtpError("Too many attempts")).toContain("Too many attempts");
    expect(friendlyOtpError("rate limited")).toContain("Too many attempts");
  });
  it("passes through an unknown message, and uses a fallback when empty", () => {
    expect(friendlyOtpError("some odd error")).toBe("some odd error");
    expect(friendlyOtpError("")).toBe("Couldn't verify that code. Please try again.");
  });
});
